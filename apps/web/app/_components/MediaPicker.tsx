'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadMedia, fetchMedia, deleteMedia } from '../_lib/api';
import type { MediaRecord } from '../_lib/api';

const API_PORT = '4001';
function mediaUrl(path: string): string {
  return `http://${typeof document !== 'undefined' ? document.location.hostname : 'localhost'}:${API_PORT}${path}`;
}

/* ------------------------------------------------------------------ */
/* Lightbox — click-to-preview overlay                                 */
/* ------------------------------------------------------------------ */
function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="lightboxOverlay" onClick={onClose}>
      <img
        src={src}
        alt={alt}
        className="lightboxImg"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Compose toolbar — attaches below textarea                           */
/* ------------------------------------------------------------------ */

interface MediaToolbarProps {
  mediaIds: string[];
  onChange: (ids: string[]) => void;
  max?: number;
}

export function MediaToolbar({ mediaIds, onChange, max = 4 }: MediaToolbarProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [media, setMedia] = useState<MediaRecord[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<{ src: string; alt: string } | null>(null);

  useEffect(() => {
    if (mediaIds.length === 0) { setMedia([]); return; }
    let cancelled = false;
    fetchMedia().then((res) => {
      if (cancelled) return;
      setMedia(res.media.filter((m) => mediaIds.includes(m.id)));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [mediaIds]);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    if (mediaIds.length + arr.length > max) {
      setError(`Maximum ${max} files allowed`);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const uploaded: MediaRecord[] = [];
      for (const file of arr) {
        const res = await uploadMedia(file);
        uploaded.push(res.media);
      }
      const newIds = [...mediaIds, ...uploaded.map((m) => m.id)];
      setMedia((prev) => [...prev, ...uploaded]);
      onChange(newIds);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [mediaIds, onChange, max]);

  const handleRemove = useCallback(async (id: string) => {
    try { await deleteMedia(id); } catch { /* ok */ }
    const newIds = mediaIds.filter((mid) => mid !== id);
    setMedia((prev) => prev.filter((m) => m.id !== id));
    onChange(newIds);
  }, [mediaIds, onChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const isImage = (mime: string) => mime.startsWith('image/');
  const canAdd = mediaIds.length < max;

  return (
    <div
      className="composeToolbar"
      onDragOver={(e) => { if (canAdd) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={canAdd ? handleDrop : undefined}
      data-dragover={dragOver || undefined}
    >
      {/* Thumbnails row */}
      {media.length > 0 && (
        <div className="composeToolbarThumbs">
          {media.map((m) => (
            <div key={m.id} className="composeThumb">
              {isImage(m.mimeType) ? (
                <img
                  src={mediaUrl(m.url)}
                  alt={m.originalName}
                  onClick={() => setPreviewSrc({ src: mediaUrl(m.url), alt: m.originalName })}
                  style={{ cursor: 'pointer' }}
                />
              ) : (
                <span className="composeThumbFile">{m.mimeType.split('/')[1]}</span>
              )}
              <button
                type="button"
                className="composeThumbRemove"
                onClick={() => handleRemove(m.id)}
                title="Remove"
              >×</button>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar icons row */}
      <div className="composeToolbarRow">
        <button
          type="button"
          className="composeToolbarBtn"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || !canAdd}
          title={uploading ? 'Uploading...' : canAdd ? 'Add image or video' : `Max ${max} files`}
        >
          {uploading ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="composeToolbarSpin">
              <path d="M21 12a9 9 0 1 1-6.22-8.56" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          )}
        </button>

        {media.length > 0 && (
          <span className="composeToolbarCount">{media.length}/{max}</span>
        )}

        {dragOver && (
          <span className="composeToolbarDrop">Drop files here</span>
        )}
      </div>

      {error && (
        <div className="composeToolbarError">{error}</div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/avif,video/mp4,video/quicktime"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ''; }}
      />

      {previewSrc && (
        <Lightbox src={previewSrc.src} alt={previewSrc.alt} onClose={() => setPreviewSrc(null)} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Read-only thumbnail strip for Review/Queue pages                    */
/* ------------------------------------------------------------------ */

export function MediaThumbs({ mediaIds }: { mediaIds: string[] }) {
  const [media, setMedia] = useState<MediaRecord[]>([]);
  const [previewSrc, setPreviewSrc] = useState<{ src: string; alt: string } | null>(null);

  useEffect(() => {
    if (mediaIds.length === 0) return;
    let cancelled = false;
    fetchMedia().then((res) => {
      if (cancelled) return;
      setMedia(res.media.filter((m) => mediaIds.includes(m.id)));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [mediaIds]);

  if (media.length === 0) return null;

  return (
    <>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        {media.map((m) => (
          m.mimeType.startsWith('image/') ? (
            <img
              key={m.id}
              src={mediaUrl(m.url)}
              alt={m.originalName}
              onClick={() => setPreviewSrc({ src: mediaUrl(m.url), alt: m.originalName })}
              style={{
                width: 56, height: 56, objectFit: 'cover', borderRadius: 4,
                border: '1px solid var(--border)', cursor: 'pointer',
              }}
            />
          ) : (
            <div
              key={m.id}
              style={{
                width: 56, height: 56, borderRadius: 4, border: '1px solid var(--border)',
                background: 'var(--panel)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '0.65rem', color: 'var(--muted)',
              }}
            >
              {m.mimeType.split('/')[1]}
            </div>
          )
        ))}
      </div>
      {previewSrc && (
        <Lightbox src={previewSrc.src} alt={previewSrc.alt} onClose={() => setPreviewSrc(null)} />
      )}
    </>
  );
}
