import { describe, expect, it } from "vitest";

import { DEMO_ATTENDEES, attendeeQrPayload } from "../demoData";

describe("DEMO_ATTENDEES roster", () => {
  it("contains exactly 15 attendees (matches UI copy in Admin.tsx)", () => {
    expect(DEMO_ATTENDEES).toHaveLength(15);
  });

  it("every attendee has a stable att-NNNN id", () => {
    DEMO_ATTENDEES.forEach((a, idx) => {
      expect(a.id).toBe(`att-${String(idx + 1).padStart(4, "0")}`);
    });
  });

  it("ids are unique", () => {
    const ids = DEMO_ATTENDEES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("emails are unique (no duplicate rows that would collide in search)", () => {
    const emails = DEMO_ATTENDEES.map((a) => a.email);
    expect(new Set(emails).size).toBe(emails.length);
  });

  it("every attendee has name_lower == name.toLowerCase()", () => {
    // name_lower is the field the backend range-queries. Drift between name
    // and name_lower breaks the OCR search path.
    DEMO_ATTENDEES.forEach((a) => {
      expect(a.name_lower).toBe(a.name.toLowerCase());
    });
  });

  it("every attendee starts with checkedIn=false so demo resets cleanly", () => {
    DEMO_ATTENDEES.forEach((a) => expect(a.checkedIn).toBe(false));
  });

  it("every attendee has at least one interest tag", () => {
    DEMO_ATTENDEES.forEach((a) => {
      expect(a.interests.length).toBeGreaterThan(0);
    });
  });

  it("emails use the example.com TLD (not real addresses)", () => {
    DEMO_ATTENDEES.forEach((a) => {
      expect(a.email).toMatch(/@example\.com$/);
    });
  });
});

describe("attendeeQrPayload", () => {
  it("returns the attendee id as-is for the current single-tenant prototype", () => {
    expect(attendeeQrPayload("att-0001")).toBe("att-0001");
  });

  it("handles arbitrary ids without mutating them", () => {
    expect(attendeeQrPayload("custom-id-xyz")).toBe("custom-id-xyz");
  });

  it("is pure (same input -> same output)", () => {
    expect(attendeeQrPayload("att-0007")).toBe(attendeeQrPayload("att-0007"));
  });
});
