import { act, renderHook, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mocks — the modules under test import these eagerly, so the mock
// factory must run before the module graph is evaluated.
const mockUnsubscribe = vi.fn();
const mockOnAuthStateChanged = vi.fn();
const mockSignInWithPopup = vi.fn();
const mockSignInWithEmailAndPassword = vi.fn();
const mockCreateUserWithEmailAndPassword = vi.fn();
const mockSignOut = vi.fn();

vi.mock("firebase/auth", () => {
  class FakeGoogleAuthProvider {}
  return {
    GoogleAuthProvider: FakeGoogleAuthProvider,
    onAuthStateChanged: (
      ...args: Parameters<typeof import("firebase/auth").onAuthStateChanged>
    ) => mockOnAuthStateChanged(...args),
    signInWithPopup: (...args: unknown[]) => mockSignInWithPopup(...args),
    signInWithEmailAndPassword: (...args: unknown[]) =>
      mockSignInWithEmailAndPassword(...args),
    createUserWithEmailAndPassword: (...args: unknown[]) =>
      mockCreateUserWithEmailAndPassword(...args),
    signOut: (...args: unknown[]) => mockSignOut(...args),
  };
});

vi.mock("@/lib/firebase", () => ({
  auth: { __fake: "auth-instance" },
}));

// Import under test *after* mocks so the mocked firebase/auth is what it sees.
import { useAuth } from "../useAuth";

type AuthCallback = (user: User | null) => void;

function makeFakeUser(overrides: Partial<User> = {}): User {
  return {
    uid: "u-123",
    email: "test@example.com",
    displayName: "Test User",
    getIdToken: vi.fn().mockResolvedValue("fake-id-token"),
    ...overrides,
  } as unknown as User;
}

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: never fires a callback, stays in loading until test triggers it.
    mockOnAuthStateChanged.mockImplementation(() => mockUnsubscribe);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initial state and auth subscription", () => {
    it("starts in loading=true with no user", () => {
      const { result } = renderHook(() => useAuth());
      expect(result.current.user).toBeNull();
      expect(result.current.loading).toBe(true);
    });

    it("subscribes to onAuthStateChanged on mount", () => {
      renderHook(() => useAuth());
      expect(mockOnAuthStateChanged).toHaveBeenCalledTimes(1);
      expect(mockOnAuthStateChanged.mock.calls[0][0]).toEqual({ __fake: "auth-instance" });
    });

    it("unsubscribes on unmount", () => {
      const { unmount } = renderHook(() => useAuth());
      unmount();
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    });

    it("transitions to loading=false with user when auth resolves signed-in", async () => {
      let cb: AuthCallback | undefined;
      mockOnAuthStateChanged.mockImplementation((_auth, callback: AuthCallback) => {
        cb = callback;
        return mockUnsubscribe;
      });

      const { result } = renderHook(() => useAuth());
      const fakeUser = makeFakeUser();
      act(() => cb?.(fakeUser));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.user).toBe(fakeUser);
      });
    });

    it("transitions to loading=false with null user when signed out", async () => {
      let cb: AuthCallback | undefined;
      mockOnAuthStateChanged.mockImplementation((_auth, callback: AuthCallback) => {
        cb = callback;
        return mockUnsubscribe;
      });

      const { result } = renderHook(() => useAuth());
      act(() => cb?.(null));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.user).toBeNull();
      });
    });
  });

  describe("sign-in actions", () => {
    it("signInWithGoogle calls signInWithPopup with the auth instance", async () => {
      mockSignInWithPopup.mockResolvedValue({ user: makeFakeUser() });
      const { result } = renderHook(() => useAuth());

      await act(() => result.current.signInWithGoogle());

      expect(mockSignInWithPopup).toHaveBeenCalledTimes(1);
      const [authArg, providerArg] = mockSignInWithPopup.mock.calls[0];
      expect(authArg).toEqual({ __fake: "auth-instance" });
      // GoogleAuthProvider is a class from our mock; instanceof check is enough.
      expect(providerArg).toBeDefined();
      expect(providerArg.constructor.name).toBe("FakeGoogleAuthProvider");
    });

    it("signInWithEmail forwards credentials to firebase", async () => {
      mockSignInWithEmailAndPassword.mockResolvedValue({ user: makeFakeUser() });
      const { result } = renderHook(() => useAuth());

      await act(() => result.current.signInWithEmail("alice@example.com", "hunter2"));

      expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(
        { __fake: "auth-instance" },
        "alice@example.com",
        "hunter2",
      );
    });

    it("signUpWithEmail forwards credentials to firebase", async () => {
      mockCreateUserWithEmailAndPassword.mockResolvedValue({ user: makeFakeUser() });
      const { result } = renderHook(() => useAuth());

      await act(() => result.current.signUpWithEmail("bob@example.com", "secure-pass"));

      expect(mockCreateUserWithEmailAndPassword).toHaveBeenCalledWith(
        { __fake: "auth-instance" },
        "bob@example.com",
        "secure-pass",
      );
    });

    it("bubbles up errors from sign-in failures", async () => {
      mockSignInWithEmailAndPassword.mockRejectedValue(
        new Error("auth/wrong-password"),
      );
      const { result } = renderHook(() => useAuth());

      await expect(
        result.current.signInWithEmail("alice@example.com", "bad"),
      ).rejects.toThrow("auth/wrong-password");
    });
  });

  describe("signOut", () => {
    it("delegates to firebase signOut", async () => {
      mockSignOut.mockResolvedValue(undefined);
      const { result } = renderHook(() => useAuth());

      await act(() => result.current.signOut());

      expect(mockSignOut).toHaveBeenCalledWith({ __fake: "auth-instance" });
    });
  });

  describe("getIdToken", () => {
    it("returns null when there is no signed-in user", async () => {
      const { result } = renderHook(() => useAuth());
      await expect(result.current.getIdToken()).resolves.toBeNull();
    });

    it("returns the firebase id token when signed in", async () => {
      let cb: AuthCallback | undefined;
      mockOnAuthStateChanged.mockImplementation((_auth, callback: AuthCallback) => {
        cb = callback;
        return mockUnsubscribe;
      });
      const fakeUser = makeFakeUser({
        getIdToken: vi.fn().mockResolvedValue("token-xyz"),
      } as Partial<User>);

      const { result } = renderHook(() => useAuth());
      act(() => cb?.(fakeUser));
      await waitFor(() => expect(result.current.user).toBe(fakeUser));

      await expect(result.current.getIdToken()).resolves.toBe("token-xyz");
      expect(fakeUser.getIdToken).toHaveBeenCalled();
    });

    it("bubbles up getIdToken errors", async () => {
      let cb: AuthCallback | undefined;
      mockOnAuthStateChanged.mockImplementation((_auth, callback: AuthCallback) => {
        cb = callback;
        return mockUnsubscribe;
      });
      const fakeUser = makeFakeUser({
        getIdToken: vi.fn().mockRejectedValue(new Error("network")),
      } as Partial<User>);

      const { result } = renderHook(() => useAuth());
      act(() => cb?.(fakeUser));
      await waitFor(() => expect(result.current.user).toBe(fakeUser));

      await expect(result.current.getIdToken()).rejects.toThrow("network");
    });
  });
});
