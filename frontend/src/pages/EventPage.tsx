import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { seedDemoData } from "@/hooks/useFirestore";
import EngagementWall from "@/components/features/EngagementWall";
import type { Session } from "@/types";

const DEMO_EVENT_ID = "demo-event";

export default function EventPage() {
  const [sessions, setSessions] = useState<(Session & { id: string })[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSessions() {
      try {
        const snap = await getDocs(
          collection(db, `events/${DEMO_EVENT_ID}/sessions`),
        );
        const items = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as (Session & { id: string })[];
        setSessions(items);
        if (items.length > 0) setActiveSession(items[0].id);
      } catch {
        setSessions([]);
      } finally {
        setLoading(false);
      }
    }
    fetchSessions();
  }, []);

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
          onClick={async () => {
            setLoading(true);
            await seedDemoData();
            window.location.reload();
          }}
          className="mt-6 rounded-lg bg-brand-600 px-6 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 transition-colors"
        >
          Seed Demo Data
        </button>
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
