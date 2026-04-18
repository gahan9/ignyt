import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---- Hoisted firestore mocks ----------------------------------------------
// seedDemoData touches many firestore APIs. Rather than spin up a full
// emulator for a unit test, we stub the SDK at the import boundary and
// assert that seedDemoData produces the *right sequence* of writes.

const mockSetDoc = vi.fn();
const mockAddDoc = vi.fn();
const mockDoc = vi.fn((_db: unknown, path: string, id?: string) => ({
  __path: id ? `${path}/${id}` : path,
}));
const mockCollection = vi.fn((_db: unknown, path: string) => ({ __coll: path }));
const mockQuery = vi.fn((colRef, ...parts) => ({ __query: colRef, parts }));
const mockOrderBy = vi.fn((field, dir) => ({ __orderBy: field, dir }));
const mockLimit = vi.fn((n) => ({ __limit: n }));
const mockServerTimestamp = vi.fn(() => "__server_ts__");

type SnapshotCb = (snapshot: {
  docs: Array<{ id: string; data: () => Record<string, unknown> }>;
}) => void;

const onSnapshotState = {
  callback: null as SnapshotCb | null,
  unsubscribe: vi.fn(),
};

const mockOnSnapshot = vi.fn((_q, cb: SnapshotCb) => {
  onSnapshotState.callback = cb;
  return onSnapshotState.unsubscribe;
});

const batchSetSpy = vi.fn();
const batchCommitSpy = vi.fn().mockResolvedValue(undefined);
const mockWriteBatch = vi.fn(() => ({
  set: batchSetSpy,
  commit: batchCommitSpy,
}));

vi.mock("firebase/firestore", () => ({
  collection: (...args: unknown[]) => mockCollection(...args),
  doc: (...args: unknown[]) => mockDoc(...args),
  query: (...args: unknown[]) => mockQuery(...(args as [unknown, ...unknown[]])),
  orderBy: (...args: unknown[]) => mockOrderBy(...(args as [string, string?])),
  limit: (...args: unknown[]) => mockLimit(...(args as [number])),
  onSnapshot: (...args: unknown[]) =>
    mockOnSnapshot(...(args as [unknown, SnapshotCb])),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  addDoc: (...args: unknown[]) => mockAddDoc(...args),
  serverTimestamp: () => mockServerTimestamp(),
  writeBatch: (...args: unknown[]) => mockWriteBatch(...args),
}));

vi.mock("@/lib/firebase", () => ({
  db: { __fake: "firestore-instance" },
}));

// Import AFTER mocks are registered.
import { DEMO_ATTENDEES } from "@/lib/demoData";
import { DEMO_EVENT_ID } from "@/lib/constants";
import { addDocument, seedDemoData, useCollection } from "../useFirestore";

beforeEach(() => {
  vi.clearAllMocks();
  mockSetDoc.mockResolvedValue(undefined);
  mockAddDoc.mockResolvedValue({ id: "new-doc-id" });
  batchCommitSpy.mockResolvedValue(undefined);
  onSnapshotState.callback = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// =============================================================================
// useCollection
// =============================================================================
describe("useCollection", () => {
  it("subscribes to the path and returns docs as {id, ...data}", async () => {
    const { result } = renderHook(() => useCollection("events/demo-event/attendees"));

    expect(result.current.loading).toBe(true);
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1);

    act(() => {
      onSnapshotState.callback?.({
        docs: [
          { id: "a1", data: () => ({ name: "Alice", checkedIn: false }) },
          { id: "a2", data: () => ({ name: "Bob", checkedIn: true }) },
        ],
      });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.docs).toEqual([
        { id: "a1", name: "Alice", checkedIn: false },
        { id: "a2", name: "Bob", checkedIn: true },
      ]);
    });
  });

  it("skips subscription and returns empty when path is null", () => {
    const { result } = renderHook(() => useCollection(null));
    expect(mockOnSnapshot).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.docs).toEqual([]);
  });

  it("applies orderBy and limit constraints when provided", () => {
    renderHook(() =>
      useCollection("events/demo-event/questions", {
        orderByField: "upvotes",
        orderDirection: "desc",
        limitCount: 10,
      }),
    );

    expect(mockOrderBy).toHaveBeenCalledWith("upvotes", "desc");
    expect(mockLimit).toHaveBeenCalledWith(10);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes on unmount", () => {
    const { unmount } = renderHook(() => useCollection("events/demo-event/attendees"));
    unmount();
    expect(onSnapshotState.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("re-subscribes when path changes", () => {
    const { rerender } = renderHook(
      ({ path }: { path: string }) => useCollection(path),
      { initialProps: { path: "events/a/attendees" } },
    );
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1);

    rerender({ path: "events/b/attendees" });
    expect(mockOnSnapshot).toHaveBeenCalledTimes(2);
    expect(onSnapshotState.unsubscribe).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// addDocument
// =============================================================================
describe("addDocument", () => {
  it("writes to the target collection with a server timestamp", async () => {
    const id = await addDocument("events/demo-event/reactions", { emoji: "\uD83D\uDD25" });

    expect(mockCollection).toHaveBeenCalledWith(
      { __fake: "firestore-instance" },
      "events/demo-event/reactions",
    );
    expect(mockAddDoc).toHaveBeenCalledWith(
      { __coll: "events/demo-event/reactions" },
      { emoji: "\uD83D\uDD25", timestamp: "__server_ts__" },
    );
    expect(id).toBe("new-doc-id");
  });

  it("propagates firestore errors (e.g. permission-denied)", async () => {
    const err = Object.assign(new Error("Missing or insufficient permissions"), {
      code: "permission-denied",
    });
    mockAddDoc.mockRejectedValueOnce(err);

    await expect(
      addDocument("events/demo-event/reactions", { emoji: "\uD83D\uDC4D" }),
    ).rejects.toThrow("Missing or insufficient permissions");
  });
});

// =============================================================================
// seedDemoData — the function whose permission failure triggered this whole
// test suite. These tests lock in the write shape so a future refactor
// can't silently break the demo path.
// =============================================================================
describe("seedDemoData", () => {
  it("returns the attendee count when seeding succeeds", async () => {
    const result = await seedDemoData();
    expect(result).toEqual({ attendees: DEMO_ATTENDEES.length });
  });

  it("writes the event document under /events/{DEMO_EVENT_ID}", async () => {
    await seedDemoData();

    const eventWrite = mockSetDoc.mock.calls.find(
      ([docRef]) => (docRef as { __path: string }).__path === `events/${DEMO_EVENT_ID}`,
    );
    expect(eventWrite).toBeDefined();

    const [, data] = eventWrite!;
    expect(data).toMatchObject({
      name: expect.stringContaining("Ignyt"),
      description: expect.any(String),
      location: expect.any(String),
      date: expect.any(String),
    });
  });

  it("writes exactly 4 session documents under /events/{id}/sessions", async () => {
    await seedDemoData();

    const sessionWrites = mockSetDoc.mock.calls.filter(([docRef]) =>
      (docRef as { __path: string }).__path.startsWith(
        `events/${DEMO_EVENT_ID}/sessions/`,
      ),
    );
    expect(sessionWrites).toHaveLength(4);

    const ids = sessionWrites.map(
      ([docRef]) => (docRef as { __path: string }).__path.split("/").pop(),
    );
    expect(ids).toEqual(["session-1", "session-2", "session-3", "session-4"]);

    sessionWrites.forEach(([, data]) => {
      expect(data).toMatchObject({
        title: expect.any(String),
        speaker: expect.any(String),
        time: expect.any(String),
        room: expect.any(String),
      });
    });
  });

  it("batches every attendee write into a single commit with name_lower preserved", async () => {
    await seedDemoData();

    expect(mockWriteBatch).toHaveBeenCalledTimes(1);
    expect(batchCommitSpy).toHaveBeenCalledTimes(1);
    expect(batchSetSpy).toHaveBeenCalledTimes(DEMO_ATTENDEES.length);

    // Every attendee MUST ship with name_lower because the backend attendee
    // repo runs range queries against that field. If a refactor drops it,
    // this assertion screams.
    batchSetSpy.mock.calls.forEach((call, idx) => {
      const [docRef, data] = call;
      const expected = DEMO_ATTENDEES[idx];
      expect((docRef as { __path: string }).__path).toBe(
        `events/${DEMO_EVENT_ID}/attendees/${expected.id}`,
      );
      expect(data).toEqual({
        name: expected.name,
        name_lower: expected.name_lower,
        email: expected.email,
        interests: expected.interests,
        checkedIn: expected.checkedIn,
      });
    });
  });

  it("commits writes in order: event → sessions → attendee batch", async () => {
    const order: string[] = [];
    mockSetDoc.mockImplementation((docRef: { __path: string }) => {
      order.push(`set:${docRef.__path}`);
      return Promise.resolve();
    });
    batchCommitSpy.mockImplementation(() => {
      order.push("batch:commit");
      return Promise.resolve();
    });

    await seedDemoData();

    expect(order[0]).toBe(`set:events/${DEMO_EVENT_ID}`);
    expect(order.slice(1, 5)).toEqual([
      `set:events/${DEMO_EVENT_ID}/sessions/session-1`,
      `set:events/${DEMO_EVENT_ID}/sessions/session-2`,
      `set:events/${DEMO_EVENT_ID}/sessions/session-3`,
      `set:events/${DEMO_EVENT_ID}/sessions/session-4`,
    ]);
    expect(order.at(-1)).toBe("batch:commit");
  });

  it("propagates permission-denied from the batch commit (regression guard)", async () => {
    // This is the exact failure mode that prompted the whole test suite:
    // a signed-in but non-organizer user writing to Firestore and being
    // rejected by security rules. We simulate the *symptom* so that if
    // someone swaps batch.commit for a different API, the regression test
    // still protects the error-propagation contract.
    const err = Object.assign(new Error("Missing or insufficient permissions."), {
      code: "permission-denied",
      name: "FirebaseError",
    });
    batchCommitSpy.mockRejectedValueOnce(err);

    await expect(seedDemoData()).rejects.toMatchObject({
      code: "permission-denied",
      message: expect.stringContaining("insufficient permissions"),
    });
  });

  it("propagates errors from the event write (catches rules regressions at root doc)", async () => {
    mockSetDoc.mockImplementationOnce(() =>
      Promise.reject(
        Object.assign(new Error("denied at /events/demo-event"), {
          code: "permission-denied",
        }),
      ),
    );

    await expect(seedDemoData()).rejects.toThrow(/denied at/);
    // If the event write fails, we must NOT proceed to attendees.
    expect(batchCommitSpy).not.toHaveBeenCalled();
  });
});
