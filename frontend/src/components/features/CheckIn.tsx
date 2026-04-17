import { useCallback, useEffect, useRef, useState } from "react";

import { apiPost } from "@/lib/api";
import { DEMO_EVENT_ID } from "@/lib/constants";
import {
  CameraIcon,
  CheckCircleIcon,
  LoaderIcon,
  QrCodeIcon,
  ScanLineIcon,
  VideoIcon,
} from "@/components/ui/Icons";
import QrScanner from "./QrScanner";

interface CheckInResult {
  attendee_id: string;
  name: string;
  checked_in: boolean;
  message: string;
}

interface BadgeResult {
  detected_text: string[];
  matched_attendee: string | null;
  confidence: number;
}

type Mode = "scan" | "id" | "badge";

/**
 * Check-in flow.
 *
 * `scan` (rear camera + QR decode) is the default entry point on every
 * device -- it's the fastest path for staffers with a laptop or a phone,
 * and the scanner modal degrades gracefully ("No camera found") so users
 * on camera-less machines can one-tap over to manual ID entry. Badge OCR
 * remains a fallback for attendees arriving without a printed QR.
 */
export default function CheckIn() {
  const [mode, setMode] = useState<Mode>("scan");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [attendeeId, setAttendeeId] = useState("");
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [badgeInfo, setBadgeInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clear transient UI state whenever the user switches modes so they
  // don't see stale success/error banners from a previous attempt.
  useEffect(() => {
    setResult(null);
    setBadgeInfo(null);
    setError(null);
  }, [mode]);

  const submitCheckin = useCallback(async (id: string) => {
    const clean = id.trim();
    if (!clean) return;
    setLoading(true);
    setResult(null);
    setBadgeInfo(null);
    setError(null);
    try {
      const res = await apiPost<CheckInResult>("/v1/checkin/scan", {
        event_id: DEMO_EVENT_ID,
        attendee_id: clean,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check-in failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleScan = useCallback(
    async (decoded: string) => {
      setScannerOpen(false);
      await submitCheckin(decoded);
    },
    [submitCheckin],
  );

  const handleIdSubmit = useCallback(async () => {
    await submitCheckin(attendeeId);
  }, [attendeeId, submitCheckin]);

  const handleBadgeUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setLoading(true);
      setResult(null);
      setBadgeInfo(null);
      setError(null);

      try {
        const buffer = await file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(buffer).reduce(
            (data, byte) => data + String.fromCharCode(byte),
            "",
          ),
        );

        const res = await apiPost<BadgeResult>("/v1/checkin/badge", {
          event_id: DEMO_EVENT_ID,
          image_base64: base64,
        });

        if (res.matched_attendee) {
          // If Vision gave us a match, ride it straight into the check-in
          // endpoint so the operator doesn't have to copy-paste the id.
          setBadgeInfo(
            `Matched: ${res.matched_attendee} (confidence ${(res.confidence * 100).toFixed(0)}%)`,
          );
          await submitCheckin(res.matched_attendee);
        } else {
          setBadgeInfo(
            `Text detected: ${res.detected_text.join(", ") || "none"} — no attendee matched`,
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Badge scan failed");
      } finally {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [submitCheckin],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Check-in</h2>
        <p className="mt-1 text-sm text-gray-500">
          Scan a QR with the camera, type an attendee ID, or snap a photo of
          their badge.
        </p>
      </div>

      <div role="tablist" aria-label="Check-in mode" className="flex flex-wrap gap-2">
        <ModeTab
          active={mode === "scan"}
          onClick={() => setMode("scan")}
          icon={<VideoIcon className="h-4 w-4" />}
          label="Scan QR"
        />
        <ModeTab
          active={mode === "id"}
          onClick={() => setMode("id")}
          icon={<QrCodeIcon className="h-4 w-4" />}
          label="Enter ID"
        />
        <ModeTab
          active={mode === "badge"}
          onClick={() => setMode("badge")}
          icon={<CameraIcon className="h-4 w-4" />}
          label="Badge Photo"
        />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        {mode === "scan" && (
          <div className="flex flex-col items-center justify-center gap-4 py-4 text-center">
            <div className="rounded-full bg-brand-50 p-4 text-brand-600">
              <ScanLineIcon className="h-8 w-8" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">
                Ready to scan
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Opens your device camera. We never upload the video feed — the
                QR is decoded locally in your browser.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-60"
            >
              <VideoIcon className="h-4 w-4" />
              Open camera
            </button>
          </div>
        )}

        {mode === "id" && (
          <div className="space-y-3">
            <label
              htmlFor="attendee-id-input"
              className="block text-sm font-medium text-gray-700"
            >
              Attendee ID (from QR code or badge)
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="attendee-id-input"
                type="text"
                value={attendeeId}
                onChange={(e) => setAttendeeId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleIdSubmit()}
                placeholder="e.g. att-0001"
                autoComplete="off"
                spellCheck={false}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <button
                type="button"
                onClick={handleIdSubmit}
                disabled={loading || !attendeeId.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
              >
                {loading && <LoaderIcon className="h-4 w-4" />}
                Check in
              </button>
            </div>
          </div>
        )}

        {mode === "badge" && (
          <div className="space-y-3">
            <label
              htmlFor="badge-upload"
              className="block text-sm font-medium text-gray-700"
            >
              Upload badge photo — Google Vision OCR will read the name
            </label>
            <input
              id="badge-upload"
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleBadgeUpload}
              disabled={loading}
              className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
            />
            {loading && (
              <p className="inline-flex items-center gap-2 text-xs text-gray-500">
                <LoaderIcon className="h-3 w-3" />
                Analyzing badge with Vision API…
              </p>
            )}
            {badgeInfo && (
              <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                {badgeInfo}
              </p>
            )}
          </div>
        )}
      </div>

      {result && (
        <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
          <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
          <div>
            <p className="text-sm font-semibold text-green-800">
              {result.name}
            </p>
            <p className="text-xs text-green-700">{result.message}</p>
            <p className="mt-0.5 text-[11px] font-mono text-green-600/70">
              {result.attendee_id}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="break-words text-sm font-medium text-red-800">
            {error}
          </p>
        </div>
      )}

      {scannerOpen && (
        <QrScanner onScan={handleScan} onClose={() => setScannerOpen(false)} />
      )}
    </div>
  );
}

interface ModeTabProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function ModeTab({ active, onClick, icon, label }: ModeTabProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-brand-600 text-white shadow-sm"
          : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
