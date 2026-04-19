import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiPostMock = vi.fn();
const useCollectionMock = vi.fn();

vi.mock("@/lib/api", () => ({
  apiPost: (...args: unknown[]) => apiPostMock(...args),
}));

vi.mock("@/hooks/useFirestore", () => ({
  useCollection: (...args: unknown[]) => useCollectionMock(...args),
}));

import PhotoBoard from "../PhotoBoard";

beforeEach(() => {
  vi.clearAllMocks();
  useCollectionMock.mockReturnValue({ docs: [], loading: false });
  // Stub global.fetch for the direct GCS PUT.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, status: 200 } as unknown as Response),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("<PhotoBoard />", () => {
  it("renders header, uploader, and empty state", () => {
    render(<PhotoBoard />);
    expect(screen.getByRole("heading", { name: /photo board/i })).toBeInTheDocument();
    expect(screen.getByText(/no photos yet/i)).toBeInTheDocument();
  });

  it("walks through upload → PUT → label and prints the final label status", async () => {
    const user = userEvent.setup();
    apiPostMock
      .mockResolvedValueOnce({
        upload_url: "https://signed.example/put",
        gcs_uri: "gs://bucket/photos/xyz.jpg",
      })
      .mockResolvedValueOnce({
        labels: ["People", "Stage", "Applause"],
        photo_id: "photo-1",
      });

    render(<PhotoBoard />);
    const file = new File(["bytes"], "crowd.jpg", { type: "image/jpeg" });

    // The file input has no accessible label in the UI; locate via file type.
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenNthCalledWith(
        1,
        "/v1/photos/upload-url",
        {
          event_id: "demo-event",
          filename: "crowd.jpg",
          content_type: "image/jpeg",
        },
        expect.any(AbortSignal),
      );
    });
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "https://signed.example/put",
        expect.objectContaining({
          method: "PUT",
          headers: { "Content-Type": "image/jpeg" },
          signal: expect.any(AbortSignal),
        }),
      );
    });
    await waitFor(() => {
      expect(apiPostMock).toHaveBeenNthCalledWith(
        2,
        "/v1/photos/label",
        {
          event_id: "demo-event",
          gcs_uri: "gs://bucket/photos/xyz.jpg",
        },
        expect.any(AbortSignal),
      );
    });
    expect(
      await screen.findByText(/done! labels: people, stage, applause/i),
    ).toBeInTheDocument();
  });

  it("shows 'none detected' when Vision returns an empty label array", async () => {
    const user = userEvent.setup();
    apiPostMock
      .mockResolvedValueOnce({
        upload_url: "https://signed.example/put",
        gcs_uri: "gs://bucket/photos/x.jpg",
      })
      .mockResolvedValueOnce({ labels: [], photo_id: "p" });

    render(<PhotoBoard />);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(
      input,
      new File(["b"], "blank.jpg", { type: "image/jpeg" }),
    );

    expect(await screen.findByText(/none detected/i)).toBeInTheDocument();
  });

  it("surfaces an error message when the upload URL request fails", async () => {
    const user = userEvent.setup();
    apiPostMock.mockRejectedValueOnce(new Error("502 bad gateway"));

    render(<PhotoBoard />);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(input, new File(["x"], "fail.jpg", { type: "image/jpeg" }));

    expect(await screen.findByText(/502 bad gateway/i)).toBeInTheDocument();
  });

  it("resets the file input after a successful upload", async () => {
    const user = userEvent.setup();
    apiPostMock
      .mockResolvedValueOnce({
        upload_url: "https://x",
        gcs_uri: "gs://b/z.jpg",
      })
      .mockResolvedValueOnce({ labels: ["x"], photo_id: "p" });

    render(<PhotoBoard />);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(input, new File(["x"], "z.jpg", { type: "image/jpeg" }));

    await screen.findByText(/done! labels: x/i);
    // Input is cleared so the same file can be re-uploaded.
    expect(input.value).toBe("");
  });

  it("renders a grid of existing photos with their labels", () => {
    useCollectionMock.mockReturnValue({
      docs: [
        { id: "p1", labels: ["People", "Stage"] },
        { id: "p2", labels: [] },
      ],
      loading: false,
    });

    render(<PhotoBoard />);
    expect(screen.getByText("People")).toBeInTheDocument();
    expect(screen.getByText("Stage")).toBeInTheDocument();
    expect(screen.getByText(/no labels/i)).toBeInTheDocument();
  });

  it("shows a loading indicator while the collection is hydrating", () => {
    useCollectionMock.mockReturnValue({ docs: [], loading: true });
    render(<PhotoBoard />);
    expect(screen.getByText(/loading photos/i)).toBeInTheDocument();
  });
});
