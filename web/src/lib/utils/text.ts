const HASHTAG_RE = /#(\w[\w-]*)/g;

export function extractHashtags(text: string): { cleanText: string; hashtags: string[] } {
  const hashtags: string[] = [];
  for (const match of text.matchAll(HASHTAG_RE)) {
    hashtags.push(match[1]);
  }
  const cleanText = text
    .replace(HASHTAG_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { cleanText, hashtags };
}
