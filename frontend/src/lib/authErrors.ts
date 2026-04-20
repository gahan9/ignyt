/**
 * Map a Firebase Auth error to a user-facing message.
 *
 * Centralised so every entry-point (sign-in form, Google button, future
 * SSO providers) renders the same copy and so the screens never leak raw
 * SDK error codes to end users.
 */

import type { FirebaseError } from "firebase/app";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD_LENGTH = 6;

export function friendlyAuthError(error: unknown): string {
  const code = (error as FirebaseError)?.code ?? "";
  switch (code) {
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Invalid email or password.";
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/weak-password":
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/too-many-requests":
      return "Too many attempts. Please try again later.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "";
    default:
      return "Something went wrong. Please try again.";
  }
}
