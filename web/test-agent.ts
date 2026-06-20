import { Agent } from '@atproto/api';

async function test() {
  const requests: any[] = [];

  const sessionManager = {
    did: 'did:fake:123',
    fetchHandler: async (url: string, init?: RequestInit) => {
      requests.push({ url, init });
      return new Response(JSON.stringify({ uri: 'at://fake', cid: 'fake' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  };

  const agent = new Agent(sessionManager);

  try {
    await agent.com.atproto.repo.putRecord({
      repo: 'did:fake:123',
      collection: 'app.agora.muse.topicFollow',
      rkey: 'topic-sailing',
      record: {
        $type: 'app.agora.muse.topicFollow',
        topicId: 'sailing',
        followedAt: new Date().toISOString(),
      } as any,
    });
    console.log('putRecord succeeded');
    console.log('Requests:', JSON.stringify(requests, null, 2));
  } catch (err) {
    console.error('putRecord failed:', err);
  }
}

test();
