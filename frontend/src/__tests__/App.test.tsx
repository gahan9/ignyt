import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks. Every major page hits Firestore/Auth internally; we render
// the top-level App but stub those pages to tiny sentinels so the App test
// stays focused on AuthGate + routing + shell chrome.
// ---------------------------------------------------------------------------
const useAuthMock = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/pages/EventPage", () => ({
  default: () => <div>event-page-stub</div>,
}));
vi.mock("@/pages/Admin", () => ({
  default: () => <div>admin-page-stub</div>,
}));
vi.mock("@/components/features/ConciergeChat", () => ({
  default: () => <div>concierge-stub</div>,
}));
vi.mock("@/components/features/CheckIn", () => ({
  default: () => <div>checkin-stub</div>,
}));
vi.mock("@/components/features/PhotoBoard", () => ({
  default: () => <div>photos-stub</div>,
}));

import App from "../App";

function renderWithRouter(initial = "/") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <App />
    </MemoryRouter>,
  );
}

function authReady(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      uid: "user-123",
      email: "ada@example.com",
      displayName: "Ada Lovelace",
    },
    loading: false,
    signInWithGoogle: vi.fn().mockResolvedValue(undefined),
    signInWithEmail: vi.fn().mockResolvedValue(undefined),
    signUpWithEmail: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    getIdToken: vi.fn().mockResolvedValue("tok"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("<App /> auth gate", () => {
  it("shows a loading indicator while auth is resolving", () => {
    useAuthMock.mockReturnValue(authReady({ user: null, loading: true }));
    renderWithRouter();
    expect(screen.getByText(/loading\.\.\./i)).toBeInTheDocument();
  });

  it("renders the sign-in form for unauthenticated users", () => {
    useAuthMock.mockReturnValue(authReady({ user: null }));
    renderWithRouter();
    expect(
      screen.getByRole("heading", { name: /sign in to your account/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /google/i })).toBeInTheDocument();
  });

  it("validates required email/password before calling the auth hook", async () => {
    const user = userEvent.setup();
    const auth = authReady({ user: null });
    useAuthMock.mockReturnValue(auth);
    renderWithRouter();

    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(screen.getByText(/email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    expect(auth.signInWithEmail).not.toHaveBeenCalled();
  });

  it("calls signInWithEmail with valid credentials", async () => {
    const user = userEvent.setup();
    const auth = authReady({ user: null });
    useAuthMock.mockReturnValue(auth);
    renderWithRouter();

    await user.type(screen.getByLabelText(/^email$/i), "ada@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "hunter2x");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() =>
      expect(auth.signInWithEmail).toHaveBeenCalledWith(
        "ada@example.com",
        "hunter2x",
      ),
    );
  });

  it("surfaces a friendly error when the server returns invalid-credential", async () => {
    const user = userEvent.setup();
    const auth = authReady({ user: null });
    auth.signInWithEmail.mockRejectedValueOnce({ code: "auth/invalid-credential" });
    useAuthMock.mockReturnValue(auth);
    renderWithRouter();

    await user.type(screen.getByLabelText(/^email$/i), "ada@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "bad-password");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(
      await screen.findByText(/invalid email or password/i),
    ).toBeInTheDocument();
  });

  it("switches to sign-up mode and requires confirm password match", async () => {
    const user = userEvent.setup();
    const auth = authReady({ user: null });
    useAuthMock.mockReturnValue(auth);
    renderWithRouter();

    await user.click(screen.getByRole("button", { name: /create one/i }));

    expect(
      screen.getByRole("heading", { name: /create your account/i }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^email$/i), "new@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "hunter2x");
    await user.type(screen.getByLabelText(/confirm password/i), "different");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    expect(auth.signUpWithEmail).not.toHaveBeenCalled();
  });

  it("calls signInWithGoogle when the Google button is clicked", async () => {
    const user = userEvent.setup();
    const auth = authReady({ user: null });
    useAuthMock.mockReturnValue(auth);
    renderWithRouter();

    await user.click(screen.getByRole("button", { name: /google/i }));
    expect(auth.signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it("toggles the show/hide password eye", async () => {
    const user = userEvent.setup();
    useAuthMock.mockReturnValue(authReady({ user: null }));
    renderWithRouter();

    const pw = screen.getByLabelText(/^password$/i) as HTMLInputElement;
    expect(pw.type).toBe("password");

    await user.click(screen.getByRole("button", { name: /show password/i }));
    expect(pw.type).toBe("text");
  });
});

describe("<App /> shell + routing", () => {
  it("renders AppShell with nav + event page at / for an authenticated user", () => {
    useAuthMock.mockReturnValue(authReady());
    renderWithRouter("/");
    // Nav present.
    expect(screen.getByRole("link", { name: /engage/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /concierge/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /check-in/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^photos$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /admin/i })).toBeInTheDocument();
    // Event page (stub) rendered.
    expect(screen.getByText(/event-page-stub/i)).toBeInTheDocument();
  });

  it("routes /concierge to the concierge feature", () => {
    useAuthMock.mockReturnValue(authReady());
    renderWithRouter("/concierge");
    expect(screen.getByText(/concierge-stub/i)).toBeInTheDocument();
  });

  it("routes /checkin to CheckIn", () => {
    useAuthMock.mockReturnValue(authReady());
    renderWithRouter("/checkin");
    expect(screen.getByText(/checkin-stub/i)).toBeInTheDocument();
  });

  it("routes /photos to PhotoBoard", () => {
    useAuthMock.mockReturnValue(authReady());
    renderWithRouter("/photos");
    expect(screen.getByText(/photos-stub/i)).toBeInTheDocument();
  });

  it("routes /admin to the admin console", () => {
    useAuthMock.mockReturnValue(authReady());
    renderWithRouter("/admin");
    expect(screen.getByText(/admin-page-stub/i)).toBeInTheDocument();
  });

  it("falls back to a 404 page for unknown routes", () => {
    useAuthMock.mockReturnValue(authReady());
    renderWithRouter("/does-not-exist");
    expect(
      screen.getByRole("heading", { name: /page not found/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /back to engage/i }),
    ).toBeInTheDocument();
  });

  it("signs out from the desktop user menu", async () => {
    const user = userEvent.setup();
    const auth = authReady();
    useAuthMock.mockReturnValue(auth);
    renderWithRouter("/");

    // Open the user menu (avatar button is the only button with the user's name).
    await user.click(screen.getByRole("button", { name: /ada lovelace/i }));
    await user.click(screen.getByRole("button", { name: /sign out/i }));

    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });
});
