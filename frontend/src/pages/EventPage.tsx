import { useCallback, useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { seedDemoData } from "@/hooks/useFirestore";
import EngagementWall from "@/components/features/EngagementWall";
import { DEMO_EVENT_ID } from "@/lib/constants";
import type { Session } from "@/types";

export default function EventPage() {
  const [sessions, setSessions] = useState<(Session & { id: string })[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const snap = await getDocs(
        collection(db, `events/${DEMO_EVENT_ID}/sessions`),
      );
      const items = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as (Session & { id: string })[];
      setSessions(items);
      if (items.length > 0) setActiveSession((curr) => curr ?? items[0].id);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions]);

  const handleSeed = useCallback(async () => {
    setSeeding(true);
    setSeedError(null);
    try {
      await seedDemoData();
      await fetchSessions();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Seeding failed";
      setSeedError(msg);
    } finally {
      setSeeding(false);
    }
  }, [fetchSessions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center" id="empty-state">
        <h2 className="text-lg font-semibold text-gray-700">No sessions yet</h2>
        <p className="mt-2 text-sm text-gray-500">
          The database is empty. Click below to populate it with demo data.
        </p>
        <button
          id="seed-button"
          onClick={handleSeed}
          disabled={seeding}
          className="mt-6 rounded-lg bg-brand-600 px-6 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 transition-colors disabled:opacity-60"
        >
          {seeding ? "Seeding..." : "Seed Demo Data"}
        </button>
        {seedError && (
          <p className="mx-auto mt-4 max-w-md break-words rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            {seedError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2 overflow-x-auto pb-2">
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSession(s.id)}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeSession === s.id
                ? "bg-brand-600 text-white shadow"
                : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            {s.title}
          </button>
        ))}
      </div>

      {activeSession && (
        <EngagementWall eventId={DEMO_EVENT_ID} sessionId={activeSession} />
      )}
    </div>
  );
}
