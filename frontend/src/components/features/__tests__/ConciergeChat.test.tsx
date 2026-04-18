import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiStreamPostMock = vi.fn();

vi.mock("@/lib/api", () => ({
  apiStreamPost: (...args: unknown[]) => apiStreamPostMock(...args),
}));

import ConciergeChat from "../ConciergeChat";

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom doesn't implement scrollIntoView; stub it so no warnings escape.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("<ConciergeChat />", () => {
  it("renders the empty-state greeting when there are no messages", () => {
    render(<ConciergeChat />);
    expect(
      screen.getByText(/hi! i know everything about this event/i),
    ).toBeInTheDocument();
  });

  it("disables the Send button when input is empty or whitespace", async () => {
    const user = userEvent.setup();
    render(<ConciergeChat />);
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();

    await user.type(screen.getByPlaceholderText(/ask about the event/i), "   ");
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });

  it("sends a message and streams assistant chunks into a single bubble", async () => {
    const user = userEvent.setup();
    apiStreamPostMock.mockImplementation(async (_url, _body, onChunk) => {
      onChunk("Hel");
      onChunk("lo, ");
      onChunk("world!");
    });

    render(<ConciergeChat />);
    const input = screen.getByPlaceholderText(/ask about the event/i);

    await user.type(input, "what is this event?");
    await user.click(screen.getByRole("button", { name: /send/i }));

    // Streamed assistant content accumulates into one bubble.
    expect(await screen.findByText(/hello, world!/i)).toBeInTheDocument();
    // User's message still visible.
    expect(screen.getByText(/what is this event\?/i)).toBeInTheDocument();

    // Streaming indicator cleared once the stream resolves.
    await waitFor(() => {
      expect(input).not.toBeDisabled();
    });
    expect(apiStreamPostMock).toHaveBeenCalledWith(
      "/v1/concierge/chat",
      {
        messages: [{ role: "user", content: "what is this event?" }],
      },
      expect.any(Function),
    );
  });

  it("submits when the Enter key is pressed (without shift)", async () => {
    const user = userEvent.setup();
    apiStreamPostMock.mockImplementation(async (_url, _body, onChunk) => {
      onChunk("ok");
    });

    render(<ConciergeChat />);
    await user.type(
      screen.getByPlaceholderText(/ask about the event/i),
      "ping{Enter}",
    );

    await waitFor(() => expect(apiStreamPostMock).toHaveBeenCalledTimes(1));
  });

  it("does NOT submit when Shift+Enter is pressed (newline only)", async () => {
    const user = userEvent.setup();
    render(<ConciergeChat />);
    const input = screen.getByPlaceholderText(/ask about the event/i);

    // Simulate Shift+Enter keydown — component should ignore it.
    await user.type(input, "multi");
    await user.keyboard("{Shift>}{Enter}{/Shift}");

    expect(apiStreamPostMock).not.toHaveBeenCalled();
  });

  it("appends an error bracket when the stream throws", async () => {
    const user = userEvent.setup();
    apiStreamPostMock.mockRejectedValueOnce(new Error("429 rate limit"));

    render(<ConciergeChat />);
    await user.type(
      screen.getByPlaceholderText(/ask about the event/i),
      "blow up{Enter}",
    );

    expect(await screen.findByText(/429 rate limit/)).toBeInTheDocument();
  });

  it("disables the input while a response is streaming", async () => {
    const user = userEvent.setup();
    // Never resolve to lock the streaming state.
    apiStreamPostMock.mockImplementation(() => new Promise(() => {}));

    render(<ConciergeChat />);
    const input = screen.getByPlaceholderText(/ask about the event/i);
    await user.type(input, "hello{Enter}");

    await waitFor(() => expect(input).toBeDisabled());
  });
});
