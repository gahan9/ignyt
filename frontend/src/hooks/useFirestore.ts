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
  DocumentData,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

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
 */
export async function seedDemoData() {
  const eventId = "demo-event";
  
  // Create Event
  await setDoc(doc(db, "events", eventId), {
    name: "Ignyt Launch Event 2026",
    description: "AI-powered future of events",
    location: "Innovation Hub",
    date: "2026-04-17"
  });

  const sessions = [
    {
      id: "session-1",
      title: "Opening Keynote",
      speaker: "Jane Doe",
      time: "09:00",
      room: "Main Hall"
    },
    {
      id: "session-2",
      title: "The Future of AI in Events",
      speaker: "John Smith",
      time: "10:30",
      room: "Hall A"
    },
    {
      id: "session-3",
      title: "Interactive Physical Experiences",
      speaker: "Alice Green",
      time: "13:00",
      room: "Creative Lab"
    }
  ];

  for (const s of sessions) {
    const { id, ...data } = s;
    await setDoc(doc(db, `events/${eventId}/sessions`, id), data);
  }
}
