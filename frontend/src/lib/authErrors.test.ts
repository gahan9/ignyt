import { describe, expect, it } from "vitest";

import {
  EMAIL_RE,
  MIN_PASSWORD_LENGTH,
  friendlyAuthError,
} from "./authErrors";

describe("EMAIL_RE", () => {
  it.each([
    "user@example.com",
    "first.last+tag@sub.domain.io",
    "x@y.z",
  ])("accepts %s", (email) => {
    expect(EMAIL_RE.test(email)).toBe(true);
  });

  it.each([
    "",
    "no-at-sign",
    "trailing@dot.",
    "spaces in@between.com",
    "leading.dot@.com",
  ])("rejects %s", (email) => {
    expect(EMAIL_RE.test(email)).toBe(false);
  });
});

describe("friendlyAuthError", () => {
  it("collapses bad-credential variants to a single message", () => {
    const codes = [
      "auth/user-not-found",
      "auth/wrong-password",
      "auth/invalid-credential",
    ];
    for (const code of codes) {
      expect(friendlyAuthError({ code })).toBe("Invalid email or password.");
    }
  });

  it("references MIN_PASSWORD_LENGTH for weak-password", () => {
    expect(friendlyAuthError({ code: "auth/weak-password" })).toContain(
      String(MIN_PASSWORD_LENGTH),
    );
  });

  it("returns empty string for user-cancelled popup flows", () => {
    expect(friendlyAuthError({ code: "auth/popup-closed-by-user" })).toBe("");
    expect(friendlyAuthError({ code: "auth/cancelled-popup-request" })).toBe(
      "",
    );
  });

  it("falls back to a generic message for unknown errors", () => {
    expect(friendlyAuthError(new Error("boom"))).toBe(
      "Something went wrong. Please try again.",
    );
    expect(friendlyAuthError(undefined)).toBe(
      "Something went wrong. Please try again.",
    );
  });
});
