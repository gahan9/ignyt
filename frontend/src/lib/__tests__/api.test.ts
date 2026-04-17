import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../firebase", () => ({
  auth: { currentUser: null },
}));

import { apiGet, apiPost, apiStreamPost } from "../api";

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(body),
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

  it("throws on non-ok response", async () => {
    globalThis.fetch = mockFetch(null, 500);

    await expect(apiGet("/fail")).rejects.toThrow("API 500");
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

  it("throws on non-ok response", async () => {
    globalThis.fetch = mockFetch(null, 422);

    await expect(apiPost("/fail", {})).rejects.toThrow("API 422");
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

  it("throws when response is not ok", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    await expect(apiStreamPost("/fail", {}, vi.fn())).rejects.toThrow("API 500");
  });

  it("throws when body is null", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: null,
    });

    await expect(apiStreamPost("/nobody", {}, vi.fn())).rejects.toThrow("No response body");
  });
});
