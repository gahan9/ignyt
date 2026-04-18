import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getDocsMock = vi.fn();
const collectionMock = vi.fn((_db, path) => ({ __collectionPath: path }));
const seedDemoDataMock = vi.fn();

vi.mock("firebase/firestore", () => ({
  getDocs: (...args: any[]) => getDocsMock(...(args as any)),
  collection: (...args: any[]) => collectionMock(...(args as any)),
}));

vi.mock("@/lib/firebase", () => ({
  db: { __fake: "db" },
}));

vi.mock("@/hooks/useFirestore", () => ({
  seedDemoData: (...args: any[]) => seedDemoDataMock(...(args as any)),
}));

// EngagementWall has its own Firestore subscriptions; stub it to keep this
// test focused on EventPage's session routing behavior.
vi.mock("@/components/features/EngagementWall", () => ({
  default: ({ eventId, sessionId }: { eventId: string; sessionId: string }) => (
    <div data-testid="engagement-wall">
      engagement for {eventId}/{sessionId}
    </div>
  ),
}));

import EventPage from "../EventPage";

function snap(sessions: Array<{ id: string; title: string }>) {
  return {
    docs: sessions.map((s) => ({
      id: s.id,
      data: () => ({ title: s.title }),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("<EventPage />", () => {
  it("shows a spinner while sessions are loading", () => {
    // getDocs never resolves → stay in loading state forever
    getDocsMock.mockImplementation(() => new Promise(() => {}));
    const { container } = render(<EventPage />);
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("renders empty-state CTA when no sessions exist and seeds on click", async () => {
    const user = userEvent.setup();
    getDocsMock.mockResolvedValueOnce(snap([])); // initial load: empty
    seedDemoDataMock.mockResolvedValueOnce({ attendees: 15 });
    getDocsMock.mockResolvedValueOnce(
      snap([{ id: "kickoff", title: "Keynote" }]),
    ); // refetch after seed

    render(<EventPage />);

    expect(
      await screen.findByRole("heading", { name: /no sessions yet/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /seed demo data/i }));

    // After seeding + refetch, the session tab shows up.
    expect(
      await screen.findByRole("button", { name: /keynote/i }),
    ).toBeInTheDocument();
    expect(seedDemoDataMock).toHaveBeenCalledTimes(1);
    expect(getDocsMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces an error message when seeding fails", async () => {
    const user = userEvent.setup();
    getDocsMock.mockResolvedValueOnce(snap([]));
    seedDemoDataMock.mockRejectedValueOnce(new Error("permission-denied"));

    render(<EventPage />);

    await user.click(
      await screen.findByRole("button", { name: /seed demo data/i }),
    );

    expect(await screen.findByText(/permission-denied/i)).toBeInTheDocument();
  });

  it("renders one tab per session and selects the first by default", async () => {
    getDocsMock.mockResolvedValueOnce(
      snap([
        { id: "kickoff", title: "Keynote" },
        { id: "track-a", title: "AI for Events" },
      ]),
    );

    render(<EventPage />);

    expect(
      await screen.findByRole("button", { name: /keynote/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ai for events/i })).toBeInTheDocument();
    // First session active → EngagementWall renders for that id
    expect(screen.getByTestId("engagement-wall")).toHaveTextContent(
      "engagement for demo-event/kickoff",
    );
  });

  it("switches the active session when a tab is clicked", async () => {
    const user = userEvent.setup();
    getDocsMock.mockResolvedValueOnce(
      snap([
        { id: "kickoff", title: "Keynote" },
        { id: "track-a", title: "AI for Events" },
      ]),
    );

    render(<EventPage />);

    await user.click(
      await screen.findByRole("button", { name: /ai for events/i }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("engagement-wall")).toHaveTextContent(
        "engagement for demo-event/track-a",
      );
    });
  });

  it("treats a failed getDocs as empty (no crash)", async () => {
    getDocsMock.mockRejectedValueOnce(new Error("boom"));

    render(<EventPage />);

    expect(
      await screen.findByRole("heading", { name: /no sessions yet/i }),
    ).toBeInTheDocument();
  });
});
