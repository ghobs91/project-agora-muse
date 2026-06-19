'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import TopicFeedContent from '@/app/topics/[topic]/TopicFeedContent';

function CustomTopicFeed() {
  const searchParams = useSearchParams();
  const topicId = searchParams.get('id') || '';

  if (!topicId) {
    return (
      <div className="min-h-screen bg-surface-dark">
        <main className="max-w-2xl mx-auto px-4 py-12 text-center">
          <p className="text-text-500">No topic specified.</p>
        </main>
      </div>
    );
  }

  return <TopicFeedContent topicId={topicId} />;
}

export default function CustomTopicPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-surface-dark">
          <main className="flex items-center justify-center h-[60vh]">
            <div className="w-8 h-8 border-2 border-dark-700 border-t-sky-500 rounded-full animate-spin" />
          </main>
        </div>
      }
    >
      <CustomTopicFeed />
    </Suspense>
  );
}
