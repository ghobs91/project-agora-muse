import { memo } from 'react';

interface HashtagBadgeProps {
  tag: string;
}

const HashtagBadge = memo(function HashtagBadge({ tag }: HashtagBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-surface-lighter text-text-400">
      #{tag}
    </span>
  );
});

export default HashtagBadge;
