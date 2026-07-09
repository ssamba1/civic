"use client";

import { useCallback, useEffect, useState } from "react";

interface PhotoGalleryProps {
  /** Public URLs of the blurred photos, ordered by idx. */
  urls: string[];
  /** Alt text prefix — index is appended automatically. */
  altPrefix?: string;
}

/**
 * PhotoGallery — responsive thumbnail grid with a click-to-enlarge lightbox.
 *
 * No new dependencies: uses plain React state + a fixed overlay for the
 * lightbox. Keyboard-navigable (Escape to close, arrow keys to advance).
 */
export default function PhotoGallery({
  urls,
  altPrefix = "Report photo",
}: PhotoGalleryProps) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const openLightbox = useCallback((idx: number) => {
    setLightboxIdx(idx);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxIdx(null);
  }, []);

  const goPrev = useCallback(() => {
    setLightboxIdx((i) => (i !== null && i > 0 ? i - 1 : i));
  }, []);

  const goNext = useCallback(() => {
    setLightboxIdx((i) => (i !== null && i < urls.length - 1 ? i + 1 : i));
  }, [urls.length]);

  // Keyboard navigation
  useEffect(() => {
    if (lightboxIdx === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxIdx, closeLightbox, goPrev, goNext]);

  // Lock body scroll while lightbox is open
  useEffect(() => {
    if (lightboxIdx !== null) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [lightboxIdx]);

  if (urls.length === 0) return null;

  return (
    <>
      {/* Thumbnail grid */}
      <ul
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${Math.min(urls.length, 3)}, 1fr)`,
        }}
        aria-label="Report photos"
      >
        {urls.map((url, i) => (
          <li key={url} className="contents">
            <button
              type="button"
              aria-label={`${altPrefix} ${i + 1} — tap to enlarge`}
              onClick={() => openLightbox(i)}
              className="group relative aspect-square overflow-hidden rounded-lg border border-hairline bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-primary)_60%,transparent)]"
            >
              {/* biome-ignore lint/performance/noImgElement: signed Supabase Storage URLs rotate; next/image loader cannot cache them */}
              <img
                src={url}
                alt={`${altPrefix} ${i + 1}`}
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                loading={i === 0 ? "eager" : "lazy"}
              />
              {/* Overlay hint */}
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                <svg
                  className="h-8 w-8 text-white drop-shadow"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.75}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6"
                  />
                </svg>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* Lightbox overlay */}
      {lightboxIdx !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Photo ${lightboxIdx + 1} of ${urls.length}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeLightbox();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") closeLightbox();
          }}
        >
          {/* Backdrop click (target === currentTarget) closes; clicks on the
              image or nav buttons don't reach here. */}
          <div className="relative max-h-full max-w-full">
            {/* biome-ignore lint/performance/noImgElement: signed Supabase Storage URLs rotate; next/image loader cannot cache them */}
            <img
              src={urls[lightboxIdx]}
              alt={`${altPrefix} ${lightboxIdx + 1}`}
              className="max-h-[85dvh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
            />

            {/* Counter badge */}
            {urls.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-[12px] font-medium text-white">
                {lightboxIdx + 1} / {urls.length}
              </div>
            )}
          </div>

          {/* Close */}
          <button
            type="button"
            aria-label="Close photo"
            onClick={closeLightbox}
            className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          {/* Prev */}
          {lightboxIdx > 0 && (
            <button
              type="button"
              aria-label="Previous photo"
              onClick={(e) => {
                e.stopPropagation();
                goPrev();
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 19.5L8.25 12l7.5-7.5"
                />
              </svg>
            </button>
          )}

          {/* Next */}
          {lightboxIdx < urls.length - 1 && (
            <button
              type="button"
              aria-label="Next photo"
              onClick={(e) => {
                e.stopPropagation();
                goNext();
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.25 4.5l7.5 7.5-7.5 7.5"
                />
              </svg>
            </button>
          )}
        </div>
      )}
    </>
  );
}
