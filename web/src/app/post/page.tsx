'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { RichText } from '@atproto/api';
import { useAuthStore } from '@/lib/store/auth-store';
import { useTopicStore } from '@/lib/store/topic-store';
import type { Topic } from '@/types';
import { TOPIC_HASHTAGS } from '@/lib/data/topics';
import Header from '@/components/layout/Header';
import TopicSuggestions from '@/components/topics/TopicSuggestions';
import {
  buildEmbed,
  fetchLinkCard,
  fetchThumbAsFile,
  getLastUrl,
  loadImageInfo,
  uploadImageBlobs,
  type LinkCard,
  type PendingImage,
} from '@/lib/post/composer';

function getBestHashtag(topicId: string): string {
  const tags = TOPIC_HASHTAGS[topicId];
  if (tags && tags.length > 0) return tags[0];
  return topicId;
}

export default function PostPage() {
  const router = useRouter();
  const { isAuthenticated, agent, restoreSession, loading: authLoading } = useAuthStore();
  const topics = useTopicStore((s) => s.topics);
  const followedTopicIds = useTopicStore((s) => s.followedTopicIds);
  const loadFollowedTopics = useTopicStore((s) => s.loadFollowedTopics);

  const [text, setText] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [images, setImages] = useState<PendingImage[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [linkCard, setLinkCard] = useState<LinkCard | null>(null);
  const [fetchingLink, setFetchingLink] = useState(false);
  const linkFetchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    restoreSession();
    loadFollowedTopics().catch(() => {});
  }, [restoreSession, loadFollowedTopics]);

  const followedTopics = topics
    .filter((t) => followedTopicIds.has(t.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Fetch link card when a URL is present in the text
  useEffect(() => {
    if (linkFetchRef.current) clearTimeout(linkFetchRef.current);

    const lastUrl = getLastUrl(text);
    if (!lastUrl) {
      setLinkCard(null);
      return;
    }

    if (linkCard && linkCard.uri === lastUrl) return;

    setFetchingLink(true);
    linkFetchRef.current = setTimeout(async () => {
      const card = await fetchLinkCard(lastUrl);
      if (card) {
        if (card.thumbUrl) {
          const thumbFile = await fetchThumbAsFile(card.thumbUrl);
          if (thumbFile) {
            card.thumbFile = thumbFile;
          }
        }
        setLinkCard(card);
      } else {
        setLinkCard(null);
      }
      setFetchingLink(false);
    }, 500);

    return () => {
      if (linkFetchRef.current) clearTimeout(linkFetchRef.current);
    };
  }, [text, linkCard]);

  const handleTopicSelect = (topic: Topic) => {
    setSelectedTopic(topic);
  };

  const handleRemoveTopic = () => {
    setSelectedTopic(null);
  };

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    setImages((prev) => {
      const remainingSlots = 4 - prev.length;
      const toAdd = imageFiles.slice(0, remainingSlots);
      const newImages: PendingImage[] = [];
      toAdd.forEach((file) => {
        const info = { file, preview: URL.createObjectURL(file), alt: '', width: 0, height: 0 };
        newImages.push(info);
        loadImageInfo(file).then(({ width, height }) => {
          setImages((current) =>
            current.map((img) =>
              img.preview === info.preview ? { ...img, width, height } : img,
            ),
          );
        });
      });
      return [...prev, ...newImages];
    });
  }, []);

  const handleImageInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    e.target.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pastedFiles = Array.from(e.clipboardData.files).filter((f) =>
      f.type.startsWith('image/'),
    );
    if (pastedFiles.length > 0) {
      e.preventDefault();
      const dt = new DataTransfer();
      pastedFiles.forEach((f) => dt.items.add(f));
      handleFiles(dt.files);
    }
  };

  const removeImage = (preview: string) => {
    setImages((prev) => {
      const next = prev.filter((img) => img.preview !== preview);
      prev
        .filter((img) => img.preview === preview)
        .forEach((img) => URL.revokeObjectURL(img.preview));
      return next;
    });
  };

  const removeLinkCard = () => {
    setLinkCard(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agent) return;
    const trimmedText = text.trim();
    if (!trimmedText && images.length === 0) return;

    setSubmitting(true);
    setError(null);

    try {
      let postText = trimmedText;

      if (selectedTopic) {
        const tag = getBestHashtag(selectedTopic.id);
        postText = postText ? `${postText} #${tag}` : `#${tag}`;
      }

      // Build facets for links, mentions, hashtags
      const rt = new RichText({ text: postText });
      try {
        await rt.detectFacets(agent);
      } catch {
        // Facets are optional; continue without them if resolution fails.
      }

      // Upload images if present
      let uploadedImageBlobs: { blob: unknown; alt: string; aspectRatio?: { width: number; height: number } }[] | null = null;
      if (images.length > 0) {
        uploadedImageBlobs = await uploadImageBlobs(agent, images);
      }

      // Upload link card thumbnail if there is one and no images
      let uploadedThumbBlob: unknown | null = null;
      if (images.length === 0 && linkCard?.thumbFile) {
        const uploaded = await agent.uploadBlob(linkCard.thumbFile, {
          encoding: linkCard.thumbFile.type,
        });
        uploadedThumbBlob = uploaded.data.blob;
      }

      const embed = buildEmbed(images, uploadedImageBlobs, linkCard, uploadedThumbBlob);

      await agent.post({
        text: rt.text,
        facets: rt.facets,
        embed: embed as any,
      });

      // Clean up object URLs
      images.forEach((img) => URL.revokeObjectURL(img.preview));

      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post');
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-surface-dark">
        <Header />
        <main className="flex items-center justify-center h-[60vh]">
          <div className="w-8 h-8 border-2 border-dark-700 border-t-sky-500 rounded-full animate-spin" />
        </main>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-surface-dark">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-12 text-center">
          <p className="text-text-500">Sign in to create posts.</p>
        </main>
      </div>
    );
  }

  const imageGridCols =
    images.length === 1 ? 'grid-cols-1' : images.length === 2 ? 'grid-cols-2' : 'grid-cols-2';

  return (
    <div className="min-h-screen bg-surface-dark">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-text-100 mb-6">New Post</h1>

        <form onSubmit={handleSubmit} className="card">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={handlePaste}
            placeholder="What's on your mind?"
            rows={6}
            maxLength={3000}
            className="w-full text-sm bg-transparent border-0 resize-none focus:outline-none placeholder:text-text-600 text-text-200"
          />

          <div className="flex justify-between items-center text-xs text-text-500 mb-4">
            <span>{text.length}/3000</span>
            {text.length >= 2800 && (
              <span className="text-amber-400">Approaching limit</span>
            )}
          </div>

          {/* Image previews */}
          {images.length > 0 && (
            <div className={`grid ${imageGridCols} gap-2 mb-4`}>
              {images.map((img) => (
                <div key={img.preview} className="relative aspect-video rounded-lg overflow-hidden bg-surface-lighter">
                  <img
                    src={img.preview}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(img.preview)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center hover:bg-black/80"
                    aria-label="Remove image"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Link card preview */}
          {linkCard && images.length === 0 && (
            <div className="mb-4 rounded-lg border border-dark-700/50 overflow-hidden bg-surface-lighter relative">
              <button
                type="button"
                onClick={removeLinkCard}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center hover:bg-black/80 z-10"
                aria-label="Remove link card"
              >
                ×
              </button>
              {linkCard.thumbUrl && (
                <img
                  src={linkCard.thumbUrl}
                  alt=""
                  className="w-full h-40 object-cover"
                />
              )}
              <div className="p-3">
                <p className="text-xs text-text-500 truncate">
                  {new URL(linkCard.uri).hostname}
                </p>
                <p className="text-sm font-medium text-text-200 mt-0.5 line-clamp-2">
                  {linkCard.title}
                </p>
                {linkCard.description && (
                  <p className="text-xs text-text-500 mt-1 line-clamp-2">
                    {linkCard.description}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Topic assignment */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-text-500 mb-1.5">
              Assign to a followed topic
            </label>
            <select
              value={selectedTopic?.id || ''}
              onChange={(e) => {
                const topic = topics.find((t) => t.id === e.target.value) || null;
                setSelectedTopic(topic);
              }}
              className="select-dark text-sm w-full"
            >
              <option value="">No topic</option>
              {followedTopics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.name}
                </option>
              ))}
            </select>

            {selectedTopic && (
              <div className="flex items-center gap-2 mt-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-sky-600/20 text-sky-400">
                  {selectedTopic.name}
                  <button
                    type="button"
                    onClick={handleRemoveTopic}
                    className="hover:text-red-400"
                    aria-label="Remove topic"
                  >
                    ×
                  </button>
                </span>
                <span className="text-xs text-text-500">
                  Will add <span className="text-sky-400">#{getBestHashtag(selectedTopic.id)}</span>
                </span>
              </div>
            )}
          </div>

          <TopicSuggestions
            content={text}
            onSelect={handleTopicSelect}
            selectedTopics={selectedTopic ? [selectedTopic] : []}
          />

          {error && (
            <p className="text-sm text-red-400 mt-3">{error}</p>
          )}

          {/* Toolbar */}
          <div className="flex items-center justify-between mt-4 pt-4 divider">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={images.length >= 4 || submitting}
                className="btn-ghost p-2 text-sky-400 disabled:opacity-40"
                title="Attach image"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 0 002 2z" />
                </svg>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageInput}
                className="hidden"
              />
              {fetchingLink && (
                <span className="text-xs text-text-500 flex items-center gap-1">
                  <span className="w-3 h-3 border border-dark-700 border-t-sky-500 rounded-full animate-spin" />
                  Loading link preview…
                </span>
              )}
              {images.length > 0 && (
                <span className="text-xs text-text-500">
                  {images.length}/4 images
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting || (!text.trim() && images.length === 0)}
              className="btn-primary"
            >
              {submitting ? 'Posting...' : 'Post to Bluesky'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
