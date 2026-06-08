import { TOPIC_IDS } from '@/lib/data/topics';
import TopicFeedContent from './TopicFeedContent';

export function generateStaticParams() {
  return TOPIC_IDS.map((topic) => ({ topic }));
}

export default function TopicFeedPage({
  params,
}: {
  params: { topic: string };
}) {
  return <TopicFeedContent topicId={params.topic} />;
}
