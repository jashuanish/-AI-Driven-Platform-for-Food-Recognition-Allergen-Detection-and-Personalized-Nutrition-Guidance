import Groq from 'groq-sdk';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const models = await groq.models.list();
  models.data.forEach((m) => {
    if (m.id.toLowerCase().includes('vision') || m.id.toLowerCase().includes('llama-3.2')) {
      console.log('Available model:', m.id);
    }
  });
  console.log('All models:', models.data.map(m => m.id).join(', '));
}
main();
