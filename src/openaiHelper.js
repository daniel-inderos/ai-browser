const OpenAI = require('openai');

let client;
function getClient() {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('Missing OPENAI_API_KEY');
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

async function* streamChat(messages) {
  const openai = getClient();
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    stream: true,
    messages,
  });
  for await (const chunk of completion) {
    const token = chunk.choices?.[0]?.delta?.content;
    if (token) {
      yield token;
    }
  }
}

module.exports = {
  streamChat,
}; 