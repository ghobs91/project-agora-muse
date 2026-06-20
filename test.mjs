import { generateSeedTerms } from './web/src/lib/llm/topic-matcher.js';
import { DEFAULT_TOPICS } from './web/src/lib/store/topic-store.js';

async function test() {
  console.log('Testing generateSeedTerms...');
  try {
    const terms = await generateSeedTerms('Sailing', '', DEFAULT_TOPICS);
    console.log('Result:', terms);
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
