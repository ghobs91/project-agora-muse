import { generateSeedTerms, matchFeedsToTopic } from './web/src/lib/llm/topic-matcher';
import { DEFAULT_TOPICS } from './web/src/lib/store/topic-store';
import type { FeedGenerator, Topic } from './web/src/types';

async function runSeedTermCase(name: string, description: string) {
  console.log(`\nTesting generateSeedTerms for "${name}"...`);
  const terms = await generateSeedTerms(name, description, DEFAULT_TOPICS);
  console.log('Result:', terms);

  const normalizedName = name.toLowerCase().trim();
  const hasPhrase = terms.includes(normalizedName);
  const nameWords = normalizedName.split(/\s+/);
  const hasLooseSingleWords =
    nameWords.length > 1 &&
    nameWords.some((w) => w.length > 2 && terms.includes(w) && !terms.includes(normalizedName));

  if (!hasPhrase) {
    console.error('FAIL: topic name phrase is missing');
    process.exit(1);
  }
  if (hasLooseSingleWords) {
    console.error('FAIL: overly broad single-word terms from topic name are present');
    process.exit(1);
  }
  console.log('PASS');
}

async function runFeedMatchCase() {
  console.log('\nTesting matchFeedsToTopic fallback for "Open Source"...');
  const topic: Topic = {
    id: 'open-source',
    name: 'Open Source',
    description: 'Open source software',
    seedTerms: ['open source'],
    followerCount: 0,
    isCustom: true,
  };

  const feeds: FeedGenerator[] = [
    { uri: 'at://good', displayName: 'Open Source Software', description: 'FOSS and OSS news' },
    { uri: 'at://bad1', displayName: 'Open Mic Night', description: 'Live music' },
    { uri: 'at://bad2', displayName: 'Source Code Leaks', description: 'Security news' },
  ];

  const matched = await matchFeedsToTopic(feeds, topic);
  const matchedUris = matched.map((f) => f.uri);
  console.log('Matched feeds:', matchedUris);

  if (!matchedUris.includes('at://good')) {
    console.error('FAIL: relevant feed was not matched');
    process.exit(1);
  }
  if (matchedUris.includes('at://bad1') || matchedUris.includes('at://bad2')) {
    console.error('FAIL: irrelevant feed matched on broad single words');
    process.exit(1);
  }
  console.log('PASS');
}

async function test() {
  try {
    await runSeedTermCase('Open Source', '');
    await runSeedTermCase('Open Source', 'Open Source discussion');
    await runSeedTermCase('Machine Learning', 'Machine learning frameworks and research');
    await runSeedTermCase('Sailing', '');
    await runFeedMatchCase();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

test();
