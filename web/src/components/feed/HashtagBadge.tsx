interface HashtagBadgeProps {
  tag: string;
}

export default function HashtagBadge({ tag }: HashtagBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-surface-lighter text-gray-400">
      #{tag}
    </span>
  );
}
