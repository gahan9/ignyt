import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiPostMock = vi.fn();
vi.mock("@/lib/api", () => ({
  apiPost: (...args: unknown[]) => apiPostMock(...args),
}));

// Neutralize the camera scanner: render a trivial panel with a "decode" button
// so tests can drive the onScan callback without instantiating html5-qrcode.
vi.mock("../QrScanner", () => ({
  default: ({
    onScan,
    onClose,
  }: {
    onScan: (id: string) => void;
    onClose: () => void;
  }) => (
    <div data-testid="qr-scanner">
      <button type="button" onClick={() => onScan("att-0007")}>
        simulate decode
      </button>
      <button type="button" onClick={onClose}>
        close
      </button>
    </div>
  ),
}));

import CheckIn from "../CheckIn";

function makeFile(content: string, name = "badge.jpg", type = "image/jpeg"): File {
  const file = new File([content], name, { type });
  // jsdom ≤ 24 doesn't implement File.arrayBuffer; polyfill just for the test.
  if (typeof file.arrayBuffer !== "function") {
    const buf = new TextEncoder().encode(content).buffer;
    Object.defineProperty(file, "arrayBuffer", {
      value: () => Promise.resolve(buf),
    });
  }
  return file;
}

beforeEach(() => {
  vi.clearAllMocks();
  apiPostMock.mockResolvedValue({
    attendee_id: "att-0007",
    name: "Grace Hopper",
    checked_in: true,
    message: "Welcome, Grace!",
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("<CheckIn />", () => {
  it("defaults to Scan QR mode with camera CTA", () => {
    render(<CheckIn />);
    expect(screen.getByRole("heading", { name: /check-in/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /scan qr/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("button", { name: /open camera/i })).toBeInTheDocument();
  });

  it("opens the scanner modal and submits when a QR is decoded", async () => {
    const user = userEvent.setup();
    render(<CheckIn />);

    await user.click(screen.getByRole("button", { name: /open camera/i }));
    expect(screen.getByTestId("qr-scanner")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /simulate decode/i }));

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith("/v1/checkin/scan", {
        event_id: "demo-event",
        attendee_id: "att-0007",
      });
    });
    expect(await screen.findByText(/grace hopper/i)).toBeInTheDocument();
    expect(screen.queryByTestId("qr-scanner")).not.toBeInTheDocument();
  });

  it("closes the scanner modal without submitting when close is clicked", async () => {
    const user = userEvent.setup();
    render(<CheckIn />);

    await user.click(screen.getByRole("button", { name: /open camera/i }));
    await user.click(screen.getByRole("button", { name: /^close$/i }));

    expect(screen.queryByTestId("qr-scanner")).not.toBeInTheDocument();
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it("submits the typed attendee ID in Enter ID mode", async () => {
    const user = userEvent.setup();
    render(<CheckIn />);

    await user.click(screen.getByRole("tab", { name: /enter id/i }));
    const input = screen.getByLabelText(/attendee id/i);
    await user.type(input, "att-0007");
    await user.click(screen.getByRole("button", { name: /^check in$/i }));

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith("/v1/checkin/scan", {
        event_id: "demo-event",
        attendee_id: "att-0007",
      });
    });
    expect(await screen.findByText(/welcome, grace/i)).toBeInTheDocument();
  });

  it("submits on Enter key in Enter ID mode", async () => {
    const user = userEvent.setup();
    render(<CheckIn />);

    await user.click(screen.getByRole("tab", { name: /enter id/i }));
    await user.type(screen.getByLabelText(/attendee id/i), "att-0007{Enter}");

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledTimes(1);
    });
  });

  it("shows an error banner when the API rejects", async () => {
    const user = userEvent.setup();
    apiPostMock.mockRejectedValueOnce(new Error("404 Not Found"));
    render(<CheckIn />);

    await user.click(screen.getByRole("tab", { name: /enter id/i }));
    await user.type(screen.getByLabelText(/attendee id/i), "att-9999");
    await user.click(screen.getByRole("button", { name: /^check in$/i }));

    expect(await screen.findByText(/404 not found/i)).toBeInTheDocument();
  });

  it("disables the submit button when ID is empty", async () => {
    const user = userEvent.setup();
    render(<CheckIn />);
    await user.click(screen.getByRole("tab", { name: /enter id/i }));
    expect(screen.getByRole("button", { name: /^check in$/i })).toBeDisabled();
  });

  describe("badge OCR mode", () => {
    beforeEach(() => {
      // btoa exists in jsdom, but Uint8Array path in the component does byte-by-byte
      // String.fromCharCode → we just need File.arrayBuffer to work.
    });

    it("uploads a badge, matches attendee, and chains into a check-in", async () => {
      const user = userEvent.setup();
      apiPostMock.mockReset();
      apiPostMock
        .mockResolvedValueOnce({
          detected_text: ["GRACE HOPPER"],
          matched_attendee: "att-0007",
          confidence: 0.92,
        })
        .mockResolvedValueOnce({
          attendee_id: "att-0007",
          name: "Grace Hopper",
          checked_in: true,
          message: "Welcome, Grace!",
        });

      render(<CheckIn />);
      await user.click(screen.getByRole("tab", { name: /badge photo/i }));

      const file = makeFile("fake-image-bytes");
      await user.upload(screen.getByLabelText(/upload badge photo/i), file);

      await waitFor(() => {
        expect(apiPostMock).toHaveBeenNthCalledWith(
          1,
          "/v1/checkin/badge",
          expect.objectContaining({
            event_id: "demo-event",
            image_base64: expect.any(String),
          }),
        );
      });
      await waitFor(() => {
        expect(apiPostMock).toHaveBeenNthCalledWith(2, "/v1/checkin/scan", {
          event_id: "demo-event",
          attendee_id: "att-0007",
        });
      });
      // After the chained check-in completes, the final success banner shows.
      // The transient "Matched: …" note is cleared by submitCheckin's reset.
      expect(await screen.findByText(/welcome, grace/i)).toBeInTheDocument();
    });

    it("shows detected text when Vision cannot find a matching attendee", async () => {
      const user = userEvent.setup();
      apiPostMock.mockReset();
      apiPostMock.mockResolvedValueOnce({
        detected_text: ["ILLEGIBLE"],
        matched_attendee: null,
        confidence: 0.1,
      });

      render(<CheckIn />);
      await user.click(screen.getByRole("tab", { name: /badge photo/i }));

      const file = makeFile("x", "blurry.jpg");
      await user.upload(screen.getByLabelText(/upload badge photo/i), file);

      expect(
        await screen.findByText(/illegible.*no attendee matched/i),
      ).toBeInTheDocument();
      expect(apiPostMock).toHaveBeenCalledTimes(1); // badge only — no scan follow-up
    });
  });

  it("clears stale banners when switching modes", async () => {
    const user = userEvent.setup();
    render(<CheckIn />);

    await user.click(screen.getByRole("tab", { name: /enter id/i }));
    await user.type(screen.getByLabelText(/attendee id/i), "att-0007");
    await user.click(screen.getByRole("button", { name: /^check in$/i }));
    expect(await screen.findByText(/welcome, grace/i)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /badge photo/i }));
    expect(screen.queryByText(/welcome, grace/i)).not.toBeInTheDocument();
  });
});
