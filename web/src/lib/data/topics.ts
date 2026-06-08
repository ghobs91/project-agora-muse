/**
 * Topic catalog — shared between server (generateStaticParams) and client (store).
 * This file must NOT import client-only modules (Zustand, React, etc.).
 */

export const TOPIC_IDS = [
  'technology',
  'science',
  'art',
  'music',
  'gaming',
  'politics',
  'cooking',
  'photography',
  'books',
  'fitness',
  'movies',
  'sports',
  'nature',
  'philosophy',
  'humor',
] as const;

export type TopicId = (typeof TOPIC_IDS)[number];
