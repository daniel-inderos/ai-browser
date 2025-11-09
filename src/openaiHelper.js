const { OpenAI } = require('openai');

// Main chat model using GPT-5
async function* streamChat(messages, options = {}) {
  const { enableWebSearch = false } = options;
  
  // If web search is enabled, use Responses API
  if (enableWebSearch) {
    yield* streamChatWithWebSearch(messages, options);
    return;
  }
  
  // Default: use Chat Completions API
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const stream = await openai.chat.completions.create({
    model: 'gpt-5',
    messages,
    stream: true,
  });
  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content || '';
    if (token) yield token;
  }
}

// Chat with web search using Responses API
async function* streamChatWithWebSearch(messages, options = {}) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  // Convert messages array to input string
  // Build conversation history for context
  let conversationHistory = '';
  let currentInput = '';
  
  for (const msg of messages) {
    if (!msg || !msg.content) continue;
    
    if (msg.role === 'system') {
      conversationHistory += (conversationHistory ? '\n\n' : '') + `System: ${msg.content}`;
    } else if (msg.role === 'user') {
      if (currentInput) {
        // Previous user message becomes part of history
        conversationHistory += (conversationHistory ? '\n\n' : '') + `User: ${currentInput}`;
      }
      currentInput = msg.content.trim();
    } else if (msg.role === 'assistant') {
      // Include assistant messages in conversation history
      conversationHistory += (conversationHistory ? '\n\n' : '') + `Assistant: ${msg.content}`;
    }
  }
  
  // Ensure we have a valid input - use the last user message or fallback
  if (!currentInput || currentInput.length === 0) {
    // Try to extract from conversation history or use a default
    const lastUserMsg = messages.filter(m => m.role === 'user').pop();
    if (lastUserMsg && lastUserMsg.content) {
      currentInput = lastUserMsg.content.trim();
    } else {
      throw new Error('No valid user input found in messages');
    }
  }
  
  // Combine conversation history with current input
  let input = currentInput;
  if (conversationHistory) {
    input = `${conversationHistory}\n\nUser: ${currentInput}`;
  }
  
  // Final validation - ensure input is not empty
  if (!input || input.trim().length === 0) {
    throw new Error('Input cannot be empty for Responses API');
  }
  
  // Configure web search tool
  const webSearchConfig = {
    type: 'web_search',
    ...(options.externalWebAccess !== undefined && { external_web_access: options.externalWebAccess }),
    ...(options.allowedDomains && options.allowedDomains.length > 0 && {
      filters: {
        allowed_domains: options.allowedDomains
      }
    }),
    ...(options.userLocation && {
      user_location: {
        type: 'approximate',
        ...options.userLocation
      }
    })
  };
  
  try {
    const includeParams = Array.isArray(options.include) ? options.include : undefined;
    const toolChoice = options.toolChoice || 'required';

    const stream = await openai.responses.create({
      model: options.model || 'gpt-5',
      tools: [webSearchConfig],
      input,
      include: includeParams,
      tool_choice: toolChoice,
      stream: true,
      ...(options.reasoning && { reasoning: options.reasoning }),
    });

    const collectedSources = new Set();
    const collectedCitations = new Map();
    let completedResponse = null;

    const trackAnnotation = (annotation) => {
      if (!annotation || typeof annotation !== 'object') return;
      if (annotation.type === 'url_citation' && annotation.url) {
        collectedSources.add(annotation.url);
        if (!collectedCitations.has(annotation.url)) {
          collectedCitations.set(annotation.url, {
            url: annotation.url,
            title: annotation.title || annotation.url,
          });
        }
      }
    };

    for await (const event of stream) {
      if (!event || !event.type) {
        continue;
      }

      switch (event.type) {
        case 'response.output_text.delta': {
          const token = event.delta || '';
          if (token) {
            yield token;
          }
          break;
        }
        case 'response.refusal.delta': {
          const token = event.delta || '';
          if (token) {
            yield token;
          }
          break;
        }
        case 'response.output_text.annotation.added': {
          trackAnnotation(event.annotation);
          break;
        }
        case 'response.completed': {
          completedResponse = event.response;
          break;
        }
        case 'response.error': {
          const message = event.error?.message || 'OpenAI response stream error';
          throw new Error(message);
        }
        default:
          break;
      }
    }

    if (completedResponse) {
      const { sources, citations } = extractResponseMetadata(completedResponse);
      sources.forEach((url) => collectedSources.add(url));
      citations.forEach((citation) => {
        if (citation.url && !collectedCitations.has(citation.url)) {
          collectedCitations.set(citation.url, citation);
        }
      });
    }

    if (collectedSources.size > 0) {
      yield { type: 'metadata', sources: Array.from(collectedSources) };
    }
    if (collectedCitations.size > 0) {
      yield { type: 'metadata', citations: Array.from(collectedCitations.values()) };
    }
  } catch (error) {
    console.error('Web search error:', error);
    throw error;
  }
}

function extractResponseMetadata(response) {
  const sources = new Set();
  const citations = new Map();

  if (!response || !Array.isArray(response.output)) {
    return {
      sources: [],
      citations: [],
    };
  }

  for (const output of response.output) {
    if (!output || output.type !== 'message' || !Array.isArray(output.content)) {
      continue;
    }

    for (const content of output.content) {
      if (!content || content.type !== 'output_text' || !Array.isArray(content.annotations)) {
        continue;
      }

      for (const annotation of content.annotations) {
        if (annotation?.type === 'url_citation' && annotation.url) {
          sources.add(annotation.url);
          if (!citations.has(annotation.url)) {
            citations.set(annotation.url, {
              url: annotation.url,
              title: annotation.title || annotation.url,
            });
          }
        }
      }
    }
  }

  return {
    sources: Array.from(sources),
    citations: Array.from(citations.values()),
  };
}

module.exports = { streamChat };
