import { useEffect, useState } from "react";
import {
  Query,
  collection,
  onSnapshot,
  orderBy,
  query,
  limit,
  addDoc,
  serverTimestamp,
  setDoc,
  doc,
  writeBatch,
  DocumentData,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { DEMO_EVENT_ID } from "@/lib/constants";
import { DEMO_ATTENDEES } from "@/lib/demoData";

/**
 * Subscribe to a Firestore collection in real time.
 * Automatically unsubscribes on unmount.
 */
export function useCollection<T extends DocumentData>(
  path: string | null,
  constraints?: {
    orderByField?: string;
    orderDirection?: "asc" | "desc";
    limitCount?: number;
  },
) {
  const [docs, setDocs] = useState<(T & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!path) {
      setDocs([]);
      setLoading(false);
      return;
    }

    const colRef = collection(db, path);
    const parts: Parameters<typeof query>[1][] = [];

    if (constraints?.orderByField) {
      parts.push(orderBy(constraints.orderByField, constraints.orderDirection ?? "desc"));
    }
    if (constraints?.limitCount) {
      parts.push(limit(constraints.limitCount));
    }

    const q: Query = parts.length > 0 ? query(colRef, ...parts) : colRef;

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as (T & { id: string })[];
      setDocs(items);
      setLoading(false);
    });

    return unsubscribe;
  }, [path, constraints?.orderByField, constraints?.orderDirection, constraints?.limitCount]);

  return { docs, loading };
}

/**
 * Add a document to a Firestore collection.
 */
export async function addDocument(path: string, data: DocumentData): Promise<string> {
  const colRef = collection(db, path);
  const docRef = await addDoc(colRef, {
    ...data,
    timestamp: serverTimestamp(),
  });
  return docRef.id;
}

/**
 * Seed demo data into Firestore.
 *
 * Writes are idempotent (`setDoc` with fixed ids) so re-seeding is safe.
 * Attendees are seeded in a single batched write to minimize round-trips;
 * the event doc and sessions are small enough that we keep them sequential
 * for readability.
 */
export async function seedDemoData(): Promise<{ attendees: number }> {
  const eventId = DEMO_EVENT_ID;

  await setDoc(doc(db, "events", eventId), {
    name: "Ignyt Launch Event 2026",
    description: "AI-powered future of events",
    location: "Innovation Hub, Main Campus",
    date: "2026-04-17",
  });

  const sessions = [
    {
      id: "session-1",
      title: "Opening Keynote",
      speaker: "Dr. Sarah Chen",
      time: "09:00",
      room: "Main Hall",
    },
    {
      id: "session-2",
      title: "Building on GCP",
      speaker: "Marcus Johnson",
      time: "10:30",
      room: "Room A",
    },
    {
      id: "session-3",
      title: "Hands-on Workshop: Gemini API",
      speaker: "Priya Patel",
      time: "13:00",
      room: "Room B",
    },
    {
      id: "session-4",
      title: "Demo Showcase",
      speaker: "All Teams",
      time: "15:00",
      room: "Main Hall",
    },
  ];

  for (const s of sessions) {
    const { id, ...data } = s;
    await setDoc(doc(db, `events/${eventId}/sessions`, id), data);
  }

  // Batch attendee writes -- a single commit keeps seeding fast and atomic.
  const batch = writeBatch(db);
  for (const a of DEMO_ATTENDEES) {
    batch.set(doc(db, `events/${eventId}/attendees`, a.id), {
      name: a.name,
      name_lower: a.name_lower,
      email: a.email,
      interests: a.interests,
      checkedIn: a.checkedIn,
    });
  }
  await batch.commit();

  return { attendees: DEMO_ATTENDEES.length };
}
