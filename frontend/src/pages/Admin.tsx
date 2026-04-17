import { useCallback, useEffect, useMemo, useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import QRCode from "qrcode";

import { db } from "@/lib/firebase";
import { DEMO_EVENT_ID } from "@/lib/constants";
import { attendeeQrPayload } from "@/lib/demoData";
import { seedDemoData, useCollection } from "@/hooks/useFirestore";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  LoaderIcon,
  PrinterIcon,
  RefreshIcon,
  SearchIcon,
  ShieldIcon,
} from "@/components/ui/Icons";

interface AttendeeDoc {
  name: string;
  name_lower?: string;
  email: string;
  interests?: string[];
  checkedIn: boolean;
  checkinTime?: string;
}

type Attendee = AttendeeDoc & { id: string };

/**
 * Operator-facing admin console for the demo event.
 *
 * Subscribes in real time to the attendees collection so any check-in from
 * the Check-in page -- phone camera, manual ID, or Vision OCR -- reflects
 * here immediately without a refresh.
 *
 * NOTE: This page trusts Firestore security rules to enforce who can flip
 * check-in flags. The current rules are permissive for the demo; for prod,
 * lock writes behind an `organizer` custom claim (see firestore.rules).
 */
export default function AdminPage() {
  const attendeesPath = `events/${DEMO_EVENT_ID}/attendees`;
  const { docs: attendees, loading } = useCollection<AttendeeDoc>(attendeesPath, {
    orderByField: "name_lower",
    orderDirection: "asc",
  });

  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState<"all" | "checked" | "pending">("all");
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const stats = useMemo(() => {
    const total = attendees.length;
    const checked = attendees.filter((a) => a.checkedIn).length;
    return { total, checked, pending: total - checked };
  }, [attendees]);

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return attendees.filter((a) => {
      if (status === "checked" && !a.checkedIn) return false;
      if (status === "pending" && a.checkedIn) return false;
      if (!needle) return true;
      return (
        a.name.toLowerCase().includes(needle) ||
        a.email.toLowerCase().includes(needle) ||
        a.id.toLowerCase().includes(needle)
      );
    });
  }, [attendees, filter, status]);

  const handleSeed = useCallback(async () => {
    setSeeding(true);
    setSeedError(null);
    setBanner(null);
    try {
      const res = await seedDemoData();
      setBanner(`Seeded ${res.attendees} attendees + sessions`);
    } catch (err) {
      setSeedError(err instanceof Error ? err.message : "Seeding failed");
    } finally {
      setSeeding(false);
    }
  }, []);

  const handleToggle = useCallback(
    async (a: Attendee) => {
      try {
        await updateDoc(doc(db, attendeesPath, a.id), {
          checkedIn: !a.checkedIn,
          checkinTime: a.checkedIn ? null : serverTimestamp(),
        });
      } catch (err) {
        setBanner(
          `Failed to update ${a.name}: ${err instanceof Error ? err.message : "error"}`,
        );
      }
    },
    [attendeesPath],
  );

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center rounded-xl bg-brand-100 p-2 text-brand-700">
            <ShieldIcon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Admin — Attendees
            </h2>
            <p className="text-xs text-gray-500">
              Real-time roster for {DEMO_EVENT_ID}.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 print:hidden">
          <button
            type="button"
            onClick={handlePrint}
            disabled={attendees.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40"
          >
            <PrinterIcon className="h-4 w-4" />
            Print badges
          </button>
          <button
            type="button"
            onClick={handleSeed}
            disabled={seeding}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-60"
          >
            {seeding ? (
              <LoaderIcon className="h-4 w-4" />
            ) : (
              <RefreshIcon className="h-4 w-4" />
            )}
            {seeding ? "Seeding…" : "Re-seed demo"}
          </button>
        </div>
      </header>

      {seedError && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 print:hidden">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="break-words text-sm text-red-800">{seedError}</p>
        </div>
      )}
      {banner && !seedError && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 print:hidden">
          {banner}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-3 print:hidden">
        <StatCard label="Total" value={stats.total} tone="neutral" />
        <StatCard label="Checked in" value={stats.checked} tone="positive" />
        <StatCard label="Pending" value={stats.pending} tone="pending" />
      </section>

      <section className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="relative flex-1 min-w-[220px]">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search by name, email, or ID"
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div className="flex rounded-lg border border-gray-200 bg-white p-1 text-xs">
          {(["all", "pending", "checked"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setStatus(opt)}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                status === opt
                  ? "bg-brand-600 text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {opt === "all" ? "All" : opt === "pending" ? "Pending" : "Checked in"}
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-gray-500">
          <LoaderIcon className="h-5 w-5" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState onSeed={handleSeed} seeding={seeding} hasAny={attendees.length > 0} />
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 print:grid-cols-2">
          {filtered.map((a) => (
            <AttendeeCard key={a.id} attendee={a} onToggle={handleToggle} />
          ))}
        </section>
      )}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  tone: "neutral" | "positive" | "pending";
}

function StatCard({ label, value, tone }: StatCardProps) {
  const toneClass = {
    neutral: "bg-white border-gray-200 text-gray-900",
    positive: "bg-green-50 border-green-200 text-green-900",
    pending: "bg-amber-50 border-amber-200 text-amber-900",
  }[tone];
  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">
        {label}
      </p>
      <p className="mt-0.5 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

interface AttendeeCardProps {
  attendee: Attendee;
  onToggle: (a: Attendee) => void | Promise<void>;
}

function AttendeeCard({ attendee, onToggle }: AttendeeCardProps) {
  const [qr, setQr] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(attendeeQrPayload(attendee.id), {
      margin: 1,
      width: 180,
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [attendee.id]);

  const handleClick = useCallback(async () => {
    setToggling(true);
    try {
      await onToggle(attendee);
    } finally {
      setToggling(false);
    }
  }, [attendee, onToggle]);

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm print:break-inside-avoid print:shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-gray-900">
            {attendee.name}
          </h3>
          <p className="truncate text-xs text-gray-500">{attendee.email}</p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-gray-400">
            {attendee.id}
          </p>
        </div>
        <StatusPill checkedIn={attendee.checkedIn} />
      </div>

      {attendee.interests && attendee.interests.length > 0 && (
        <div className="flex flex-wrap gap-1 print:hidden">
          {attendee.interests.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-center rounded-lg bg-gray-50 p-3 print:bg-white">
        {qr ? (
          <img
            src={qr}
            alt={`QR code for ${attendee.name}`}
            className="h-36 w-36"
          />
        ) : (
          <div className="flex h-36 w-36 items-center justify-center text-xs text-gray-400">
            generating…
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={handleClick}
        disabled={toggling}
        className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors print:hidden ${
          attendee.checkedIn
            ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
            : "bg-brand-600 text-white hover:bg-brand-700"
        } disabled:opacity-60`}
      >
        {toggling && <LoaderIcon className="h-3 w-3" />}
        {attendee.checkedIn ? "Undo check-in" : "Mark checked in"}
      </button>
    </article>
  );
}

function StatusPill({ checkedIn }: { checkedIn: boolean }) {
  if (checkedIn) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-800">
        <CheckCircleIcon className="h-3 w-3" />
        In
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
      Pending
    </span>
  );
}

interface EmptyStateProps {
  onSeed: () => void | Promise<void>;
  seeding: boolean;
  hasAny: boolean;
}

function EmptyState({ onSeed, seeding, hasAny }: EmptyStateProps) {
  if (hasAny) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
        No attendees match your filters.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
      <p className="text-sm font-medium text-gray-900">
        No attendees yet.
      </p>
      <p className="mt-1 text-xs text-gray-500">
        Seed 15 demo attendees to explore the check-in flow end-to-end.
      </p>
      <button
        type="button"
        onClick={onSeed}
        disabled={seeding}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {seeding ? <LoaderIcon className="h-4 w-4" /> : <RefreshIcon className="h-4 w-4" />}
        Seed demo data
      </button>
    </div>
  );
}
