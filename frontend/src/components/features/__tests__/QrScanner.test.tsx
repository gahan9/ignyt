import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock html5-qrcode. We capture the `decode` callback handed to `start()` so
// tests can drive it directly without a real camera.
// ---------------------------------------------------------------------------
type DecodeCb = (text: string) => void;

const lastInstance: {
  scanner: null | {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
    isScanning: boolean;
    decodeCb: DecodeCb | null;
  };
  startBehavior: "ok" | "denied" | "notfound" | "generic";
} = { scanner: null, startBehavior: "ok" };

vi.mock("html5-qrcode", () => {
  class Html5Qrcode {
    isScanning = false;
    decodeCb: DecodeCb | null = null;
    start = vi.fn(async (_cam, _cfg, onDecode: DecodeCb) => {
      this.decodeCb = onDecode;
      if (lastInstance.startBehavior === "denied") {
        const e = new Error("denied");
        (e as { name?: string }).name = "NotAllowedError";
        throw e;
      }
      if (lastInstance.startBehavior === "notfound") {
        const e = new Error("no camera");
        (e as { name?: string }).name = "NotFoundError";
        throw e;
      }
      if (lastInstance.startBehavior === "generic") {
        throw new Error("boom");
      }
      this.isScanning = true;
      lastInstance.scanner = this as unknown as (typeof lastInstance)["scanner"];
    });
    stop = vi.fn(async () => {
      this.isScanning = false;
    });
    clear = vi.fn();
  }
  return {
    Html5Qrcode,
    Html5QrcodeSupportedFormats: { QR_CODE: 0 },
  };
});

import QrScanner from "../QrScanner";

beforeEach(() => {
  lastInstance.scanner = null;
  lastInstance.startBehavior = "ok";
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("<QrScanner />", () => {
  it("shows the 'Starting camera…' loader before start() resolves", async () => {
    const onScan = vi.fn();
    const onClose = vi.fn();

    render(<QrScanner onScan={onScan} onClose={onClose} />);

    // Before start() microtask flush, loader is visible.
    expect(screen.getByText(/starting camera/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(lastInstance.scanner).not.toBeNull();
    });
  });

  it("forwards decoded QR payloads to onScan and debounces identical scans", async () => {
    const onScan = vi.fn();
    const onClose = vi.fn();

    render(<QrScanner onScan={onScan} onClose={onClose} />);

    await waitFor(() => {
      expect(lastInstance.scanner?.decodeCb).toBeTruthy();
    });

    const decode = lastInstance.scanner!.decodeCb!;
    decode("att-0001");
    decode("att-0001"); // debounced duplicate within 1500ms
    decode("att-0002");

    expect(onScan).toHaveBeenCalledTimes(2);
    expect(onScan).toHaveBeenNthCalledWith(1, "att-0001");
    expect(onScan).toHaveBeenNthCalledWith(2, "att-0002");
  });

  it("renders a permission-denied message when the user blocks camera access", async () => {
    lastInstance.startBehavior = "denied";
    const onScan = vi.fn();
    const onClose = vi.fn();

    render(<QrScanner onScan={onScan} onClose={onClose} />);

    expect(
      await screen.findByText(/camera permission denied/i),
    ).toBeInTheDocument();
  });

  it("renders a 'No camera found' message on devices without a camera", async () => {
    lastInstance.startBehavior = "notfound";
    render(<QrScanner onScan={vi.fn()} onClose={vi.fn()} />);
    expect(
      await screen.findByText(/no camera found/i),
    ).toBeInTheDocument();
  });

  it("calls onClose when the user clicks the close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<QrScanner onScan={vi.fn()} onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: /close scanner/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stops the scanner on unmount (prevents hanging camera LED)", async () => {
    const { unmount } = render(<QrScanner onScan={vi.fn()} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(lastInstance.scanner?.isScanning).toBe(true);
    });
    const stopSpy = lastInstance.scanner!.stop;

    unmount();

    expect(stopSpy).toHaveBeenCalled();
  });
});
