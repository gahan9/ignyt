import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

import { AlertCircleIcon, LoaderIcon, XIcon } from "@/components/ui/Icons";

interface QrScannerProps {
  /**
   * Invoked once per accepted decode. The parent is responsible for
   * dismissing the modal (we leave it open so the operator can rescan).
   */
  onScan: (decoded: string) => void;
  onClose: () => void;
  /** Title shown in the top bar. */
  title?: string;
}

const READER_ID = "ignyt-qr-reader";

/**
 * Full-screen QR scanner modal.
 *
 * Design notes:
 * - We instantiate html5-qrcode's non-UI `Html5Qrcode` class (not the
 *   auto-UI variant) so the styling stays consistent with the app shell.
 * - `facingMode: "environment"` prefers the rear camera on mobile; the
 *   library falls back to any available camera if that constraint fails.
 * - Decodes are debounced via `lastScanRef` so a single sustained scan
 *   doesn't flood the parent with duplicate callbacks.
 * - Cleanup on unmount is CRITICAL -- without `scanner.stop()` the
 *   camera LED can stay on until the tab is closed on some browsers.
 */
export default function QrScanner({
  onScan,
  onClose,
  title = "Scan attendee QR",
}: QrScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleDecoded = useCallback(
    (decodedText: string) => {
      const now = Date.now();
      // Debounce 1.5s per unique payload: still allows re-scanning the
      // SAME badge after a short delay if the operator wants to retry.
      if (
        decodedText === lastScanRef.current.text &&
        now - lastScanRef.current.at < 1500
      ) {
        return;
      }
      lastScanRef.current = { text: decodedText, at: now };
      onScan(decodedText);
    },
    [onScan],
  );

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        const scanner = new Html5Qrcode(READER_ID, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
        });
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: (w, h) => {
              const size = Math.min(w, h) * 0.7;
              return { width: size, height: size };
            },
          },
          handleDecoded,
          () => {
            /* decode-miss callback: intentionally quiet */
          },
        );

        if (cancelled) {
          await scanner.stop().catch(() => undefined);
          return;
        }
        setStarting(false);
      } catch (err) {
        const name = (err as { name?: string })?.name ?? "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setError(
            "Camera permission denied. Enable camera access in your browser settings, or use the manual ID entry below.",
          );
        } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          setError("No camera found on this device.");
        } else {
          const msg = err instanceof Error ? err.message : "Unknown error";
          setError(`Could not start the camera: ${msg}`);
        }
        setStarting(false);
      }
    };

    void start();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s && s.isScanning) {
        s.stop()
          .then(() => s.clear())
          .catch(() => undefined);
      }
    };
  }, [handleDecoded]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
    >
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <h2 className="text-sm font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close scanner"
          className="rounded-lg p-2 text-white/90 transition-colors hover:bg-white/10"
        >
          <XIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <div id={READER_ID} className="h-full w-full" />

        {starting && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80">
            <LoaderIcon className="h-6 w-6" />
            <p className="text-xs">Starting camera…</p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center px-6">
            <div className="max-w-sm rounded-xl bg-white/95 p-5 text-center shadow-xl">
              <div className="mx-auto mb-3 inline-flex items-center justify-center rounded-full bg-red-100 p-2.5">
                <AlertCircleIcon className="h-5 w-5 text-red-600" />
              </div>
              <p className="text-sm text-gray-700">{error}</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="border-t border-white/10 px-4 py-3 text-center text-xs text-white/60">
        Point the camera at the attendee's QR code. Scanning happens
        automatically.
      </p>
    </div>
  );
}
