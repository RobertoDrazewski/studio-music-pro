// Lists the models available to the configured OpenAI key, so you can copy the exact name
// into OPENAI_MODEL. Usage: npm run ai:models
import { loadConfig } from '../server/config.js';

const { openai } = loadConfig();
if (!openai.apiKey) {
  console.error('OPENAI_API_KEY is not set (check your .env file).');
  process.exit(1);
}

const res = await fetch(`${openai.baseUrl}/models`, { headers: { Authorization: `Bearer ${openai.apiKey}` } });
if (!res.ok) {
  console.error(`OpenAI answered HTTP ${res.status}. Check the key.`);
  process.exit(1);
}
const { data } = await res.json();
const ids = data
  .map((m) => m.id)
  .filter((id) => /^(gpt|o\d)/.test(id) && !/(audio|realtime|tts|transcribe|image|embedding|moderation|search|codex)/.test(id))
  .sort();
console.log(`Current OPENAI_MODEL: ${openai.model}\n`);
console.log('Chat models available to this key:');
for (const id of ids) console.log(`  ${id}`);
