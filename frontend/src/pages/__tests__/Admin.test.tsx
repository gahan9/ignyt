import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks must register BEFORE module import graph resolves.
// ---------------------------------------------------------------------------
const useCollectionMock = vi.fn();
const seedDemoDataMock = vi.fn();
const updateDocMock = vi.fn();
const docMock = vi.fn((_db, path, id) => ({ __docPath: `${path}/${id}` }));
const serverTimestampMock = vi.fn(() => "__ts__");

// Permissive variadic signature so spread arguments satisfy
// `tsc -b --noEmit` without losing the typed implementation behaviour.
type AnyFn = (...args: unknown[]) => unknown;

vi.mock("@/hooks/useFirestore", () => ({
  useCollection: (...args: unknown[]) => (useCollectionMock as AnyFn)(...args),
  seedDemoData: (...args: unknown[]) => (seedDemoDataMock as AnyFn)(...args),
}));

vi.mock("firebase/firestore", () => ({
  doc: (...args: unknown[]) => (docMock as AnyFn)(...args),
  serverTimestamp: () => serverTimestampMock(),
  updateDoc: (...args: unknown[]) => (updateDocMock as AnyFn)(...args),
}));

vi.mock("@/lib/firebase", () => ({
  db: { __fake: "db" },
}));

// qrcode is an async IO-ish module; stub it so tests don't depend on canvas.
const qrToDataURLMock = vi.fn(() =>
  Promise.resolve("data:image/png;base64,FAKEQR"),
);
vi.mock("qrcode", () => ({
  default: {
    toDataURL: (...args: unknown[]) => (qrToDataURLMock as AnyFn)(...args),
  },
}));

import AdminPage from "../Admin";

function buildAttendee(overrides = {}) {
  return {
    id: "att-0001",
    name: "Alice Chen",
    name_lower: "alice chen",
    email: "alice@example.com",
    interests: ["AI", "Design"],
    checkedIn: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  updateDocMock.mockResolvedValue(undefined);
  seedDemoDataMock.mockResolvedValue({ attendees: 15 });
  useCollectionMock.mockReturnValue({ docs: [], loading: false });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("<AdminPage />", () => {
  describe("empty state", () => {
    it("renders the seed CTA when roster is empty and not loading", () => {
      render(<AdminPage />);

      expect(
        screen.getByRole("heading", { name: /admin — attendees/i }),
      ).toBeInTheDocument();
      expect(screen.getByText(/no attendees yet/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /seed demo data/i })).toBeEnabled();
    });

    it("renders a loading spinner while the collection is loading", () => {
      useCollectionMock.mockReturnValue({ docs: [], loading: true });
      const { container } = render(<AdminPage />);

      // Loading state does not render the "No attendees yet" empty copy.
      expect(screen.queryByText(/no attendees yet/i)).not.toBeInTheDocument();
      // The loader spinner is present.
      expect(container.querySelector("svg")).toBeTruthy();
    });
  });

  describe("seeding", () => {
    it("calls seedDemoData and shows a success banner on click", async () => {
      const user = userEvent.setup();
      render(<AdminPage />);

      await user.click(screen.getByRole("button", { name: /seed demo data/i }));

      await waitFor(() => {
        expect(seedDemoDataMock).toHaveBeenCalledTimes(1);
      });
      expect(await screen.findByText(/seeded 15 attendees/i)).toBeInTheDocument();
    });

    it("shows an error banner if seedDemoData throws permission-denied", async () => {
      const user = userEvent.setup();
      seedDemoDataMock.mockRejectedValueOnce(
        new Error("Missing or insufficient permissions"),
      );
      render(<AdminPage />);

      await user.click(screen.getByRole("button", { name: /seed demo data/i }));

      expect(
        await screen.findByText(/missing or insufficient permissions/i),
      ).toBeInTheDocument();
    });

    it("disables the re-seed button while seeding is in flight", async () => {
      const user = userEvent.setup();
      // Never resolve to lock the in-flight state.
      seedDemoDataMock.mockImplementation(() => new Promise(() => {}));
      render(<AdminPage />);

      const btn = screen.getByRole("button", { name: /seed demo data/i });
      await user.click(btn);

      await waitFor(() => {
        expect(btn).toBeDisabled();
      });
    });
  });

  describe("roster rendering", () => {
    it("renders stats, attendee cards, and checked-in pills", async () => {
      useCollectionMock.mockReturnValue({
        docs: [
          buildAttendee({ id: "att-0001", name: "Alice Chen", checkedIn: true }),
          buildAttendee({
            id: "att-0002",
            name: "Bob Patel",
            email: "bob@example.com",
            checkedIn: false,
          }),
        ],
        loading: false,
      });

      render(<AdminPage />);

      // Stats: 2 total, 1 checked, 1 pending (tabular-nums makes them big numbers).
      const statValues = screen.getAllByText(/^[012]$/);
      expect(statValues.length).toBeGreaterThanOrEqual(3);

      expect(screen.getByText("Alice Chen")).toBeInTheDocument();
      expect(screen.getByText("Bob Patel")).toBeInTheDocument();
      // StatusPill: checked-in attendee shows "In"; pending shows "Pending".
      expect(screen.getAllByText("In").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/pending/i).length).toBeGreaterThanOrEqual(1);
    });

    it("filters by search term (name/email/id)", async () => {
      const user = userEvent.setup();
      useCollectionMock.mockReturnValue({
        docs: [
          buildAttendee({ id: "att-0001", name: "Alice Chen" }),
          buildAttendee({
            id: "att-0002",
            name: "Bob Patel",
            email: "bob@example.com",
          }),
        ],
        loading: false,
      });

      render(<AdminPage />);

      await user.type(screen.getByPlaceholderText(/search by name/i), "bob");

      expect(screen.queryByText("Alice Chen")).not.toBeInTheDocument();
      expect(screen.getByText("Bob Patel")).toBeInTheDocument();
    });

    it("filters by status pill (Pending / Checked in)", async () => {
      const user = userEvent.setup();
      useCollectionMock.mockReturnValue({
        docs: [
          buildAttendee({ id: "att-0001", name: "Alice Chen", checkedIn: true }),
          buildAttendee({ id: "att-0002", name: "Bob Patel", checkedIn: false }),
        ],
        loading: false,
      });

      render(<AdminPage />);

      await user.click(screen.getByRole("button", { name: /^pending$/i }));
      expect(screen.queryByText("Alice Chen")).not.toBeInTheDocument();
      expect(screen.getByText("Bob Patel")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /^checked in$/i }));
      expect(screen.getByText("Alice Chen")).toBeInTheDocument();
      expect(screen.queryByText("Bob Patel")).not.toBeInTheDocument();
    });

    it("shows 'no attendees match your filters' when roster non-empty but filter excludes all", async () => {
      const user = userEvent.setup();
      useCollectionMock.mockReturnValue({
        docs: [buildAttendee({ id: "att-0001", name: "Alice Chen" })],
        loading: false,
      });

      render(<AdminPage />);

      await user.type(
        screen.getByPlaceholderText(/search by name/i),
        "zzz-no-such-name",
      );

      expect(screen.getByText(/no attendees match your filters/i)).toBeInTheDocument();
    });
  });

  describe("manual toggle", () => {
    it("calls updateDoc when Mark checked in is clicked", async () => {
      const user = userEvent.setup();
      useCollectionMock.mockReturnValue({
        docs: [buildAttendee({ id: "att-0001", name: "Alice Chen", checkedIn: false })],
        loading: false,
      });

      render(<AdminPage />);

      const card = screen.getByText("Alice Chen").closest("article")!;
      await user.click(
        within(card).getByRole("button", { name: /mark checked in/i }),
      );

      await waitFor(() => {
        expect(updateDocMock).toHaveBeenCalledTimes(1);
      });
      const [, patch] = updateDocMock.mock.calls[0];
      expect(patch).toMatchObject({ checkedIn: true, checkinTime: "__ts__" });
    });

    it("surfaces a failure banner when the update throws", async () => {
      const user = userEvent.setup();
      useCollectionMock.mockReturnValue({
        docs: [buildAttendee({ id: "att-0001", name: "Alice Chen", checkedIn: false })],
        loading: false,
      });
      updateDocMock.mockRejectedValueOnce(new Error("permission-denied"));

      render(<AdminPage />);

      const card = screen.getByText("Alice Chen").closest("article")!;
      await user.click(
        within(card).getByRole("button", { name: /mark checked in/i }),
      );

      expect(await screen.findByText(/failed to update alice chen/i)).toBeInTheDocument();
    });
  });

  describe("print badges", () => {
    it("disables the Print badges button when there are no attendees", () => {
      render(<AdminPage />);
      expect(screen.getByRole("button", { name: /print badges/i })).toBeDisabled();
    });

    it("triggers window.print when clicked with attendees present", async () => {
      const user = userEvent.setup();
      useCollectionMock.mockReturnValue({
        docs: [buildAttendee({ id: "att-0001", name: "Alice Chen" })],
        loading: false,
      });

      const printSpy = vi.fn();
      vi.stubGlobal("print", printSpy);

      render(<AdminPage />);
      await user.click(screen.getByRole("button", { name: /print badges/i }));

      expect(printSpy).toHaveBeenCalledTimes(1);
      vi.unstubAllGlobals();
    });
  });
});
