import { useCallback, useEffect, useId, useRef, useState } from "react";

import { apiPost } from "@/lib/api";
import { useCollection } from "@/hooks/useFirestore";
import { DEMO_EVENT_ID } from "@/lib/constants";
import type { Photo } from "@/types";

const STATUS_AUTO_CLEAR_MS = 5000;

export default function PhotoBoard() {
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileInputId = useId();
  const statusId = useId();
  // Track the in-flight controller and the auto-clear timeout so we
  // can cancel both on unmount or when a fresh upload starts. Without
  // this an in-flight upload kept reading bytes after the user
  // navigated away, and the dangling ``setTimeout`` fired ``setStatus``
  // on an unmounted tree (React warning + memory leak).
  const abortRef = useRef<AbortController | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { docs: photos, loading } = useCollection<Photo>(
    `events/${DEMO_EVENT_ID}/photos`,
    { orderByField: "timestamp", orderDirection: "desc", limitCount: 30 },
  );

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (clearTimerRef.current !== null) {
        clearTimeout(clearTimerRef.current);
      }
    };
  }, []);

  const scheduleStatusClear = useCallback(() => {
    if (clearTimerRef.current !== null) {
      clearTimeout(clearTimerRef.current);
    }
    clearTimerRef.current = setTimeout(() => {
      setStatus(null);
      clearTimerRef.current = null;
    }, STATUS_AUTO_CLEAR_MS);
  }, []);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setUploading(true);
      setStatus("Getting upload URL...");

      try {
        const { upload_url, gcs_uri } = await apiPost<{
          upload_url: string;
          gcs_uri: string;
        }>(
          "/v1/photos/upload-url",
          {
            event_id: DEMO_EVENT_ID,
            filename: file.name,
            content_type: file.type || "image/jpeg",
          },
          controller.signal,
        );

        setStatus("Uploading to Cloud Storage...");
        await fetch(upload_url, {
          method: "PUT",
          headers: { "Content-Type": file.type || "image/jpeg" },
          body: file,
          signal: controller.signal,
        });

        setStatus("Analyzing with Vision API...");
        const { labels } = await apiPost<{ labels: string[]; photo_id: string }>(
          "/v1/photos/label",
          { event_id: DEMO_EVENT_ID, gcs_uri },
          controller.signal,
        );

        setStatus(`Done! Labels: ${labels.join(", ") || "none detected"}`);
      } catch (err) {
        if (controller.signal.aborted) {
          // The user navigated away or kicked off a fresh upload. Don't
          // overwrite UI state — the new flow owns ``status`` now.
          return;
        }
        setStatus(err instanceof Error ? err.message : "Upload failed");
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setUploading(false);
          if (fileRef.current) fileRef.current.value = "";
          scheduleStatusClear();
        }
      }
    },
    [scheduleStatusClear],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-800">Photo Board</h2>
        <p className="text-sm text-gray-500">
          Share event photos — Vision API auto-tags each one.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <label
          htmlFor={fileInputId}
          className="mb-2 block text-sm font-medium text-gray-700"
        >
          Choose a photo to upload
        </label>
        <input
          id={fileInputId}
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleUpload}
          disabled={uploading}
          aria-describedby={status ? statusId : undefined}
          aria-busy={uploading || undefined}
          className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100 disabled:opacity-50"
        />
        {status && (
          <p
            id={statusId}
            role="status"
            aria-live="polite"
            className="mt-2 text-sm text-gray-600"
          >
            {status}
          </p>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading photos...</p>
      ) : photos.length === 0 ? (
        <p className="text-sm text-gray-400">No photos yet. Upload the first one!</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm"
            >
              <div className="aspect-video bg-gray-100 flex items-center justify-center">
                <span className="text-3xl" role="img" aria-label="Photo placeholder">
                  📷
                </span>
              </div>
              <div className="p-3">
                {photo.labels && photo.labels.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {photo.labels.map((label) => (
                      <span
                        key={`${photo.id}:${label}`}
                        className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No labels</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
