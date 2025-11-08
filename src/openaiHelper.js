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
      // Try to use Responses API with streaming if supported
      // Include sources by default unless explicitly disabled
      const includeParams = options.include || ['web_search_call.action.sources'];
      
      // Force web search by setting tool_choice to "required" unless explicitly overridden
      const toolChoice = options.toolChoice || 'required';
      
      // Check if Responses API supports streaming
      // If not, we'll fall back to Chat Completions API with web search models
      try {
        // Try Responses API with stream parameter
        const responseStream = await openai.responses.create({
          model: options.model || 'gpt-5',
          tools: [webSearchConfig],
          input: input,
          include: includeParams,
          tool_choice: toolChoice,
          stream: true, // Try streaming
          ...(options.reasoning && { reasoning: options.reasoning }),
        });
        
        // If streaming works, process the stream
        let sources = [];
        let citations = [];
        let hasReceivedSources = false;
        
        for await (const chunk of responseStream) {
          // Handle different chunk types
          if (chunk.type === 'web_search_call' && chunk.action) {
            // Extract sources from web search call
            if (chunk.action.sources && Array.isArray(chunk.action.sources)) {
              chunk.action.sources.forEach(source => {
                if (typeof source === 'string') {
                  sources.push(source);
                } else if (source && source.url) {
                  sources.push(source.url);
                }
              });
              if (!hasReceivedSources && sources.length > 0) {
                yield { type: 'metadata', sources };
                hasReceivedSources = true;
              }
            }
          } else if (chunk.type === 'message' && chunk.content) {
            // Stream message content
            for (const contentItem of chunk.content) {
              if (contentItem.type === 'output_text' && contentItem.text) {
                yield contentItem.text;
              }
              // Extract citations
              if (contentItem.annotations) {
                const chunkCitations = contentItem.annotations.filter(ann => ann.type === 'url_citation');
                if (chunkCitations.length > 0) {
                  citations.push(...chunkCitations);
                }
              }
            }
          }
        }
        
        // Yield final citations if available
        if (citations.length > 0) {
          yield { type: 'metadata', citations };
        }
        
        return; // Successfully streamed
      } catch (streamError) {
        // If streaming fails, fall back to non-streaming Responses API
        console.log('Streaming not supported, using non-streaming Responses API');
      }
      
      // Fallback: Use non-streaming Responses API (original implementation)
      const response = await openai.responses.create({
        model: options.model || 'gpt-5',
        tools: [webSearchConfig],
        input: input,
        include: includeParams,
        tool_choice: toolChoice,
        ...(options.reasoning && { reasoning: options.reasoning }),
      });
    
      // Extract sources if available
      const sources = [];
      if (response.output_items) {
        for (const item of response.output_items) {
          if (item.type === 'web_search_call' && item.action) {
            // Handle sources from action.sources
            if (item.action.sources && Array.isArray(item.action.sources)) {
              item.action.sources.forEach(source => {
                // Sources can be strings or objects with url property
                if (typeof source === 'string') {
                  sources.push(source);
                } else if (source && source.url) {
                  sources.push(source.url);
                }
              });
            }
          }
        }
      }
      
      // Stream the output text
      const outputText = response.output_text || '';
      
      // If we have sources, include them in metadata
      if (sources.length > 0) {
        // Yield sources as metadata first (we'll handle this in the IPC layer)
        yield { type: 'metadata', sources };
      }
      
      // Stream the text character by character or in chunks for better UX
      const chunkSize = 10; // Characters per chunk for smoother streaming
      for (let i = 0; i < outputText.length; i += chunkSize) {
        yield outputText.slice(i, i + chunkSize);
      }
      
      // Yield citations if available
      if (response.output_items) {
        const messageItem = response.output_items.find(item => item.type === 'message');
        if (messageItem && messageItem.content && messageItem.content[0] && messageItem.content[0].annotations) {
          const citations = messageItem.content[0].annotations.filter(ann => ann.type === 'url_citation');
          if (citations.length > 0) {
            yield { type: 'metadata', citations };
          }
        }
      }
    } catch (error) {
      console.error('Web search error:', error);
      throw error;
    }
}

module.exports = { streamChat };