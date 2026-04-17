import { useCallback, useRef, useState } from "react";

import { apiPost } from "@/lib/api";
import { DEMO_EVENT_ID } from "@/lib/constants";

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

export default function CheckIn() {
  const [mode, setMode] = useState<"qr" | "badge">("qr");
  const [attendeeId, setAttendeeId] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleQrCheckin = useCallback(async () => {
    if (!attendeeId.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await apiPost<CheckInResult>("/v1/checkin/scan", {
        event_id: DEMO_EVENT_ID,
        attendee_id: attendeeId.trim(),
      });
      setResult(`${res.name} — ${res.message}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check-in failed");
    } finally {
      setLoading(false);
    }
  }, [attendeeId]);

  const handleBadgeUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setLoading(true);
      setResult(null);
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
          setResult(
            `Matched: ${res.matched_attendee} (confidence: ${(res.confidence * 100).toFixed(0)}%)`,
          );
        } else {
          setResult(
            `Text detected: ${res.detected_text.join(", ") || "none"} — no match found`,
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Badge scan failed");
      } finally {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-800">Check-in</h2>
        <p className="text-sm text-gray-500">
          Scan a QR code or photograph a badge to check in attendees.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setMode("qr")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            mode === "qr"
              ? "bg-brand-600 text-white"
              : "bg-white text-gray-700 border border-gray-200"
          }`}
        >
          QR / ID
        </button>
        <button
          onClick={() => setMode("badge")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            mode === "badge"
              ? "bg-brand-600 text-white"
              : "bg-white text-gray-700 border border-gray-200"
          }`}
        >
          Badge Photo (Vision API)
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        {mode === "qr" ? (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-700">
              Attendee ID (from QR code)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={attendeeId}
                onChange={(e) => setAttendeeId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleQrCheckin()}
                placeholder="e.g. attendee-001"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <button
                onClick={handleQrCheckin}
                disabled={loading || !attendeeId.trim()}
                className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40 transition-colors"
              >
                {loading ? "Checking..." : "Check In"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-700">
              Upload badge photo for OCR
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleBadgeUpload}
              disabled={loading}
              className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
            />
            {loading && (
              <p className="text-sm text-gray-500">Analyzing badge with Vision API...</p>
            )}
          </div>
        )}
      </div>

      {result && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3">
          <p className="text-sm font-medium text-green-800">{result}</p>
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}
    </div>
  );
}
