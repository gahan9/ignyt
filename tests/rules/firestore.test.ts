import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Security-rules tests.
 *
 * These verify the SAME rules that ship in production (firestore.rules). The
 * emulator is spun up in-memory — no network calls, no real Firebase project
 * touched.
 *
 * Three principal identities are exercised:
 *   1. `anon`       — no auth at all (should be denied everywhere).
 *   2. `user`       — signed in, no custom claims.
 *   3. `organizer`  — signed in with { role: 'organizer' }.
 *
 * Every test re-seeds with security rules disabled (withSecurityRulesDisabled)
 * so setup data is not subject to the rules under test — isolates assertions
 * to the specific access being exercised.
 */

const DEMO_EVENT = "demo-event";
const REAL_EVENT = "ignyt-paid-2026";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "ignyt-rules-test",
    firestore: {
      rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8"),
      // host/port default to localhost:8080 — start emulator via
      // `firebase emulators:start --only firestore` before `npm test`.
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

afterEach(async () => {
  await env.clearFirestore();
});

function anon() {
  return env.unauthenticatedContext().firestore();
}
function user(uid = "user-123") {
  return env.authenticatedContext(uid).firestore();
}
function organizer(uid = "org-1") {
  return env
    .authenticatedContext(uid, { role: "organizer" })
    .firestore();
}

async function seedEvent(eventId: string, data: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "events", eventId), {
      name: eventId,
      createdAt: new Date(),
      ...data,
    });
  });
}

describe("events collection", () => {
  beforeEach(async () => {
    await seedEvent(DEMO_EVENT);
    await seedEvent(REAL_EVENT);
  });

  it("denies reads to anonymous users", async () => {
    await assertFails(getDoc(doc(anon(), "events", DEMO_EVENT)));
  });

  it("allows signed-in users to read any event doc", async () => {
    await assertSucceeds(getDoc(doc(user(), "events", DEMO_EVENT)));
    await assertSucceeds(getDoc(doc(user(), "events", REAL_EVENT)));
  });

  it("allows any signed-in user to write the demo event", async () => {
    await assertSucceeds(
      setDoc(doc(user(), "events", DEMO_EVENT), { name: "patched" }),
    );
  });

  it("denies non-organizer writes to real events", async () => {
    await assertFails(
      setDoc(doc(user(), "events", REAL_EVENT), { name: "tamper" }),
    );
  });

  it("allows organizer writes to real events", async () => {
    await assertSucceeds(
      setDoc(doc(organizer(), "events", REAL_EVENT), { name: "updated" }),
    );
  });
});

describe("attendees subcollection", () => {
  beforeEach(async () => {
    await seedEvent(DEMO_EVENT);
    await seedEvent(REAL_EVENT);
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `events/${DEMO_EVENT}/attendees/att-0001`), {
        name: "Alice",
        checkedIn: false,
      });
      await setDoc(doc(db, `events/${REAL_EVENT}/attendees/att-real`), {
        name: "Bob",
        checkedIn: false,
      });
    });
  });

  it("denies reads to anonymous users", async () => {
    await assertFails(
      getDoc(doc(anon(), `events/${DEMO_EVENT}/attendees/att-0001`)),
    );
  });

  it("allows any signed-in user to write demo attendees (seedDemoData)", async () => {
    await assertSucceeds(
      setDoc(doc(user(), `events/${DEMO_EVENT}/attendees/att-0999`), {
        name: "Claire",
        email: "claire@example.com",
        checkedIn: false,
      }),
    );
  });

  it("denies random users from writing real-event attendees", async () => {
    await assertFails(
      updateDoc(
        doc(user("rando"), `events/${REAL_EVENT}/attendees/att-real`),
        { checkedIn: true },
      ),
    );
  });

  it("allows an attendee to update their own doc (isOwner)", async () => {
    // attendeeId === uid is the isOwner check.
    const uid = "att-real";
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `events/${REAL_EVENT}/attendees/${uid}`), {
        name: "Self",
      });
    });
    await assertSucceeds(
      updateDoc(
        doc(user(uid), `events/${REAL_EVENT}/attendees/${uid}`),
        { checkedIn: true },
      ),
    );
  });

  it("allows an organizer to update any attendee", async () => {
    await assertSucceeds(
      updateDoc(
        doc(organizer(), `events/${REAL_EVENT}/attendees/att-real`),
        { checkedIn: true },
      ),
    );
  });
});

describe("sessions + reactions + questions", () => {
  beforeEach(async () => {
    await seedEvent(DEMO_EVENT);
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `events/${DEMO_EVENT}/sessions/kickoff`), {
        title: "Keynote",
      });
    });
  });

  it("allows any signed-in user to post a reaction", async () => {
    await assertSucceeds(
      addDoc(
        collection(user(), `events/${DEMO_EVENT}/sessions/kickoff/reactions`),
        { emoji: "🔥", userId: "user-123" },
      ),
    );
  });

  it("denies reactions from anonymous users", async () => {
    await assertFails(
      addDoc(
        collection(anon(), `events/${DEMO_EVENT}/sessions/kickoff/reactions`),
        { emoji: "🔥" },
      ),
    );
  });

  it("allows signed-in users to create questions but NOT update them", async () => {
    const questions = collection(
      user(),
      `events/${DEMO_EVENT}/sessions/kickoff/questions`,
    );
    const ref = await addDoc(questions, {
      text: "Is lunch included?",
      userId: "user-123",
      userName: "Ada",
      upvotes: 0,
    });
    // An attendee cannot bump upvotes on their own question (or anyone's).
    await assertFails(updateDoc(ref, { upvotes: 1 }));
  });

  it("allows organizers to update questions (moderation / upvote tally)", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `events/${DEMO_EVENT}/sessions/kickoff/questions/q1`),
        { text: "pre-seeded", upvotes: 0 },
      );
    });
    await assertSucceeds(
      updateDoc(
        doc(organizer(), `events/${DEMO_EVENT}/sessions/kickoff/questions/q1`),
        { upvotes: 10 },
      ),
    );
  });
});

describe("photos subcollection", () => {
  beforeEach(async () => {
    await seedEvent(DEMO_EVENT);
  });

  it("allows any signed-in user to create a photo", async () => {
    await assertSucceeds(
      addDoc(collection(user(), `events/${DEMO_EVENT}/photos`), {
        userId: "user-123",
        gcs_uri: "gs://bucket/p.jpg",
      }),
    );
  });

  it("denies delete by non-organizer", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `events/${DEMO_EVENT}/photos/p1`), {
        userId: "someone",
      });
    });
    // signed-in but no organizer claim
    await assertFails(deleteDoc(doc(user(), `events/${DEMO_EVENT}/photos/p1`)));
  });

  it("allows organizer to delete a photo (moderation)", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `events/${DEMO_EVENT}/photos/p1`), {
        userId: "someone",
      });
    });
    await assertSucceeds(
      deleteDoc(doc(organizer(), `events/${DEMO_EVENT}/photos/p1`)),
    );
  });

  it("denies reads to anonymous users", async () => {
    await assertFails(getDocs(collection(anon(), `events/${DEMO_EVENT}/photos`)));
  });
});
