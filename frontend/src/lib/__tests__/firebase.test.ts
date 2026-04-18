import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// firebase.ts reads `import.meta.env.VITE_FIREBASE_*` at module load and
// hands that config to initializeApp. We want to verify:
//   1. It forwards every VITE_FIREBASE_* var to firebase/app.
//   2. It exports auth/db/storage instances derived from the initialized app.
//
// Module-level side effects make this test a bit delicate — we use
// vi.resetModules() between tests to re-evaluate firebase.ts with different
// env stubs.

const initializeAppSpy = vi.fn();
const getAuthSpy = vi.fn();
const getFirestoreSpy = vi.fn();
const getStorageSpy = vi.fn();

vi.mock("firebase/app", () => ({
  initializeApp: initializeAppSpy,
}));
vi.mock("firebase/auth", () => ({
  getAuth: getAuthSpy,
}));
vi.mock("firebase/firestore", () => ({
  getFirestore: getFirestoreSpy,
}));
vi.mock("firebase/storage", () => ({
  getStorage: getStorageSpy,
}));

describe("firebase.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Setup mocks to return consistent handles
    initializeAppSpy.mockReturnValue({ __app: "fake-app-instance" });
    getAuthSpy.mockReturnValue({ __auth: "fake-auth" });
    getFirestoreSpy.mockReturnValue({ __db: "fake-firestore" });
    getStorageSpy.mockReturnValue({ __storage: "fake-storage" });

    // Stub environment variables correctly (bypass read-only constraint)
    vi.stubEnv("VITE_FIREBASE_API_KEY", "fake-key");
    vi.stubEnv("VITE_FIREBASE_AUTH_DOMAIN", "fake.firebaseapp.com");
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "fake-project");
    vi.stubEnv("VITE_FIREBASE_STORAGE_BUCKET", "fake.appspot.com");
    vi.stubEnv("VITE_FIREBASE_MESSAGING_SENDER_ID", "123456");
    vi.stubEnv("VITE_FIREBASE_APP_ID", "1:123:web:abc");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("forwards every VITE_FIREBASE_* env var to initializeApp", async () => {
    await import("../firebase");

    expect(initializeAppSpy).toHaveBeenCalledTimes(1);
    expect(initializeAppSpy).toHaveBeenCalledWith({
      apiKey: "fake-key",
      authDomain: "fake.firebaseapp.com",
      projectId: "fake-project",
      storageBucket: "fake.appspot.com",
      messagingSenderId: "123456",
      appId: "1:123:web:abc",
    });
  });

  it("instantiates auth, db, and storage from the same app instance", async () => {
    await import("../firebase");

    expect(getAuthSpy).toHaveBeenCalledWith({ __app: "fake-app-instance" });
    expect(getFirestoreSpy).toHaveBeenCalledWith({ __app: "fake-app-instance" });
    expect(getStorageSpy).toHaveBeenCalledWith({ __app: "fake-app-instance" });
  });

  it("exports auth, db, storage handles for consumers", async () => {
    const mod = await import("../firebase");

    expect(mod.auth).toEqual({ __auth: "fake-auth" });
    expect(mod.db).toEqual({ __db: "fake-firestore" });
    expect(mod.storage).toEqual({ __storage: "fake-storage" });
  });
});
