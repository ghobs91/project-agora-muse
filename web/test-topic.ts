import { useAuthStore } from './src/lib/store/auth-store';
import { useTopicStore } from './src/lib/store/topic-store';

// Mock agent with a fake putRecord
const fakeAgent = {
  assertDid: 'did:fake:123',
  com: {
    atproto: {
      repo: {
        putRecord: async () => ({ data: { uri: 'at://fake', cid: 'fake' } }),
      },
    },
  },
} as any;

useAuthStore.setState({ agent: fakeAgent, isAuthenticated: true, did: 'did:fake:123', handle: 'fake.bsky.social' });

async function test() {
  console.log('Testing addCustomTopic...');
  try {
    const topic = await useTopicStore.getState().addCustomTopic('Sailing', '');
    console.log('Created topic:', topic);
    const topics = useTopicStore.getState().topics;
    console.log('Topics count:', topics.length);
    console.log('Custom topics:', topics.filter(t => t.isCustom).map(t => t.id));
    const followedIds = useTopicStore.getState().followedTopicIds;
    console.log('Followed IDs:', Array.from(followedIds));
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
