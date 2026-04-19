import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks. The component reads Firestore via useCollection and writes via
// addDocument; we swap both so tests don't need the Firestore emulator.
// ---------------------------------------------------------------------------
const useCollectionMock = vi.fn();
const addDocumentMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock("@/hooks/useFirestore", () => ({
  useCollection: (...args: unknown[]) => useCollectionMock(...args),
  addDocument: (...args: unknown[]) => addDocumentMock(...args),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => useAuthMock(),
}));

import EngagementWall from "../EngagementWall";

beforeEach(() => {
  vi.clearAllMocks();
  addDocumentMock.mockResolvedValue({ id: "doc-1" });
  useAuthMock.mockReturnValue({
    user: { uid: "user-123", displayName: "Ada Lovelace" },
  });
  // Default: both collections empty.
  useCollectionMock.mockImplementation((path: string) => {
    if (path.includes("/reactions")) return { docs: [], loading: false };
    return { docs: [], loading: false };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("<EngagementWall />", () => {
  // Accessible names emitted by the React bar — kept in sync with
  // EMOJI_OPTIONS in EngagementWall.tsx. Emojis themselves are marked
  // ``aria-hidden`` so screen-reader users hear human labels instead.
  const EMOJI_LABELS: Record<string, RegExp> = {
    "👏": /react with applause/i,
    "🔥": /react with fire/i,
    "💡": /react with insightful/i,
    "❤️": /react with love/i,
    "😂": /react with funny/i,
    "🎉": /react with celebrate/i,
  };

  it("renders React bar, Q&A, and empty states", () => {
    render(<EngagementWall eventId="demo-event" sessionId="kickoff" />);

    expect(screen.getByText(/live engagement/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /react/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /q&a/i })).toBeInTheDocument();
    expect(
      screen.getByText(/no questions yet\. be the first/i),
    ).toBeInTheDocument();
    for (const label of Object.values(EMOJI_LABELS)) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("writes a reaction doc when an emoji is clicked", async () => {
    const user = userEvent.setup();
    render(<EngagementWall eventId="demo-event" sessionId="kickoff" />);

    await user.click(screen.getByRole("button", { name: EMOJI_LABELS["🔥"] }));

    await waitFor(() => {
      expect(addDocumentMock).toHaveBeenCalledWith(
        "events/demo-event/sessions/kickoff/reactions",
        { emoji: "🔥", userId: "user-123" },
      );
    });
  });

  it("does not write a reaction when user is not signed in", async () => {
    useAuthMock.mockReturnValue({ user: null });
    const user = userEvent.setup();

    render(<EngagementWall eventId="demo-event" sessionId="kickoff" />);
    await user.click(screen.getByRole("button", { name: EMOJI_LABELS["👏"] }));

    expect(addDocumentMock).not.toHaveBeenCalled();
  });

  it("aggregates emoji counts in the reactions bar", () => {
    useCollectionMock.mockImplementation((path: string) => {
      if (path.includes("/reactions")) {
        return {
          docs: [
            { id: "r1", emoji: "🔥" },
            { id: "r2", emoji: "🔥" },
            { id: "r3", emoji: "👏" },
          ],
          loading: false,
        };
      }
      return { docs: [], loading: false };
    });

    render(<EngagementWall eventId="demo-event" sessionId="kickoff" />);

    expect(
      screen.getByRole("button", { name: EMOJI_LABELS["🔥"] }),
    ).toHaveTextContent(/2/);
    expect(
      screen.getByRole("button", { name: EMOJI_LABELS["👏"] }),
    ).toHaveTextContent(/1/);
  });

  it("surfaces an error message when reaction write fails", async () => {
    addDocumentMock.mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();
    render(<EngagementWall eventId="demo-event" sessionId="kickoff" />);

    await user.click(screen.getByRole("button", { name: EMOJI_LABELS["🔥"] }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/network down/i);
  });

  it("submits a question on Enter key and clears the input", async () => {
    const user = userEvent.setup();
    render(<EngagementWall eventId="demo-event" sessionId="kickoff" />);

    const input = screen.getByPlaceholderText(/ask a question/i);
    await user.type(input, "when's lunch?{Enter}");

    await waitFor(() => {
      expect(addDocumentMock).toHaveBeenCalledWith(
        "events/demo-event/sessions/kickoff/questions",
        {
          text: "when's lunch?",
          userId: "user-123",
          userName: "Ada Lovelace",
          upvotes: 0,
        },
      );
    });
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("submits a question via the Ask button", async () => {
    const user = userEvent.setup();
    render(<EngagementWall eventId="demo-event" sessionId="kickoff" />);

    await user.type(
      screen.getByPlaceholderText(/ask a question/i),
      "who's speaking next?",
    );
    await user.click(screen.getByRole("button", { name: /^ask$/i }));

    await waitFor(() => {
      expect(addDocumentMock).toHaveBeenCalledTimes(1);
    });
  });

  it("disables the Ask button when the question is empty or whitespace", async () => {
    const user = userEvent.setup();
    render(<EngagementWall eventId="demo-event" sessionId="kickoff" />);

    const btn = screen.getByRole("button", { name: /^ask$/i });
    expect(btn).toBeDisabled();

    await user.type(screen.getByPlaceholderText(/ask a question/i), "   ");
    expect(btn).toBeDisabled();
  });

  it("falls back to 'Anonymous' when the user has no displayName", async () => {
    useAuthMock.mockReturnValue({
      user: { uid: "user-123", displayName: null },
    });
    const user = userEvent.setup();

    render(<EngagementWall eventId="demo-event" sessionId="kickoff" />);
    await user.type(
      screen.getByPlaceholderText(/ask a question/i),
      "test{Enter}",
    );

    await waitFor(() => {
      expect(addDocumentMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ userName: "Anonymous" }),
      );
    });
  });

  it("lists existing questions with author names", () => {
    useCollectionMock.mockImplementation((path: string) => {
      if (path.includes("/questions")) {
        return {
          docs: [
            { id: "q1", text: "Will slides be shared?", userName: "Ada" },
            { id: "q2", text: "Is there a recording?", userName: "Bob" },
          ],
          loading: false,
        };
      }
      return { docs: [], loading: false };
    });

    render(<EngagementWall eventId="demo-event" sessionId="kickoff" />);
    expect(screen.getByText(/will slides be shared/i)).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText(/is there a recording/i)).toBeInTheDocument();
  });

  it("shows a loading indicator while questions are loading", () => {
    useCollectionMock.mockImplementation((path: string) => {
      if (path.includes("/questions")) return { docs: [], loading: true };
      return { docs: [], loading: false };
    });

    render(<EngagementWall eventId="demo-event" sessionId="kickoff" />);
    expect(screen.getByText(/loading questions/i)).toBeInTheDocument();
  });
});
