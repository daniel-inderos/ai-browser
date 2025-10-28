const { OpenAI } = require('openai');

// Main chat model using GPT-5
async function* streamChat(messages) {
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

module.exports = { streamChat };