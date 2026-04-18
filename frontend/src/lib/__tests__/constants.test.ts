import { describe, expect, it } from "vitest";

import { DEMO_EVENT_ID } from "../constants";

describe("DEMO_EVENT_ID", () => {
  it("matches the hard-coded value referenced by firestore.rules isDemoEvent()", () => {
    // firestore.rules:
    //   function isDemoEvent(eventId) { return eventId == 'demo-event'; }
    // If we ever rename this constant without updating the rules, the demo
    // seed flow breaks silently. This assertion is an intentional tripwire.
    expect(DEMO_EVENT_ID).toBe("demo-event");
  });

  it("is a stable string (not a Symbol or mutable reference)", () => {
    expect(typeof DEMO_EVENT_ID).toBe("string");
  });
});
