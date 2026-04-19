import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../firebase", () => ({
  auth: { currentUser: null },
}));

import { ApiError, apiGet, apiPost, apiStreamPost } from "../api";

function mockFetch(body: unknown, status = 200, statusText?: string) {
  // toApiError reads the body as text first, so we need text() to resolve to
  // the stringified body; json() is only used on the happy path.
  const resolvedStatusText =
    statusText ?? (status === 200 ? "OK" : status >= 500 ? "Internal Server Error" : "Error");
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: resolvedStatusText,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(body == null ? "" : JSON.stringify(body)),
    body: null,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("apiGet", () => {
  it("fetches and returns JSON", async () => {
    globalThis.fetch = mockFetch({ status: "healthy" });

    const result = await apiGet<{ status: string }>("/health");

    expect(result).toEqual({ status: "healthy" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("prepends API base to path", async () => {
    globalThis.fetch = mockFetch({});

    await apiGet("/v1/budget");

    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("/v1/budget");
  });

  it("throws ApiError with status and statusText on non-ok response", async () => {
    globalThis.fetch = mockFetch(null, 500);

    await expect(apiGet("/fail")).rejects.toThrow("500 Internal Server Error");
  });

  it("throws ApiError exposing numeric status", async () => {
    globalThis.fetch = mockFetch(null, 404, "Not Found");

    try {
      await apiGet("/fail");
      expect.fail("expected apiGet to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(404);
      expect((err as ApiError).statusText).toBe("Not Found");
    }
  });

  it("surfaces server detail from JSON body in error message", async () => {
    globalThis.fetch = mockFetch({ detail: "bad token" }, 401, "Unauthorized");

    await expect(apiGet("/fail")).rejects.toThrow("401 Unauthorized: bad token");
  });

  it("includes Content-Type header", async () => {
    globalThis.fetch = mockFetch({});

    await apiGet("/test");

    const headers = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]?.headers;
    expect(headers).toHaveProperty("Content-Type", "application/json");
  });
});

describe("apiPost", () => {
  it("sends POST with JSON body", async () => {
    globalThis.fetch = mockFetch({ id: "123" });

    const result = await apiPost<{ id: string }>("/create", { name: "test" });

    expect(result).toEqual({ id: "123" });

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[1].method).toBe("POST");
    expect(JSON.parse(fetchCall[1].body)).toEqual({ name: "test" });
  });

  it("throws on non-ok response with rich error message", async () => {
    globalThis.fetch = mockFetch({ detail: "validation failed" }, 422, "Unprocessable Entity");

    await expect(apiPost("/fail", {})).rejects.toThrow(
      "422 Unprocessable Entity: validation failed",
    );
  });

  it("sends Bearer token when firebase user is signed in", async () => {
    const { auth } = await import("../firebase");
    (auth as unknown as { currentUser: unknown }).currentUser = {
      getIdToken: vi.fn().mockResolvedValue("fake-token"),
    };

    globalThis.fetch = mockFetch({ ok: true });
    await apiPost("/secured", {});

    const headers = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]?.headers as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBe("Bearer fake-token");

    (auth as unknown as { currentUser: unknown }).currentUser = null;
  });

  it("forwards an AbortSignal to fetch so callers can cancel", async () => {
    globalThis.fetch = mockFetch({ ok: true });
    const controller = new AbortController();

    await apiPost("/cancellable", { x: 1 }, controller.signal);

    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(init.signal).toBe(controller.signal);
  });
});

describe("apiStreamPost", () => {
  it("calls onChunk for each streamed chunk", async () => {
    const encoder = new TextEncoder();
    const chunks = [encoder.encode("Hello "), encoder.encode("world")];
    let callIndex = 0;

    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (callIndex < chunks.length) {
          return Promise.resolve({ done: false, value: chunks[callIndex++] });
        }
        return Promise.resolve({ done: true, value: undefined });
      }),
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: { getReader: () => mockReader },
    });

    const received: string[] = [];
    await apiStreamPost("/stream", {}, (text) => received.push(text));

    expect(received).toEqual(["Hello ", "world"]);
  });

  it("throws ApiError when response is not ok", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: () => Promise.resolve(""),
    });

    await expect(apiStreamPost("/fail", {}, vi.fn())).rejects.toThrow("500 Internal Server Error");
  });

  it("throws when body is null", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: null,
    });

    await expect(apiStreamPost("/nobody", {}, vi.fn())).rejects.toThrow("No response body");
  });

  it("cancels the reader when the abort signal fires", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    // ``read`` returns a never-settling promise so the loop is waiting
    // when we abort. Without the abort handler the test would hang.
    let resolveRead: ((v: { done: boolean; value?: Uint8Array }) => void) | undefined;
    const readPromise = new Promise<{ done: boolean; value?: Uint8Array }>(
      (resolve) => {
        resolveRead = resolve;
      },
    );
    const mockReader = {
      read: vi.fn().mockReturnValue(readPromise),
      cancel,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: { getReader: () => mockReader },
    });

    const controller = new AbortController();
    const promise = apiStreamPost("/stream", {}, vi.fn(), controller.signal);

    // Give the awaited fetch + getReader microtasks a turn so the
    // abort listener is registered before we trip it. Without this the
    // abort fires before the listener exists and ``cancel`` is never
    // called — the same race that would bite a real component.
    await Promise.resolve();
    await Promise.resolve();

    controller.abort();
    expect(cancel).toHaveBeenCalledTimes(1);

    resolveRead?.({ done: true });
    await promise;
  });
});
