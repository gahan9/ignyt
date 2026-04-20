import { auth } from "./firebase";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function getHeaders(recaptchaToken?: string | null): Promise<HeadersInit> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (recaptchaToken) {
    headers["X-Recaptcha-Token"] = recaptchaToken;
  }

  return headers;
}

async function toApiError(res: Response): Promise<ApiError> {
  // Try to pull a useful message out of the response body before giving up.
  let detail = "";
  try {
    const text = await res.text();
    if (text) {
      try {
        const parsed = JSON.parse(text);
        detail =
          typeof parsed.detail === "string"
            ? parsed.detail
            : JSON.stringify(parsed);
      } catch {
        detail = text.slice(0, 200);
      }
    }
  } catch {
    // ignore — we'll fall back to statusText
  }

  const message = detail
    ? `${res.status} ${res.statusText}: ${detail}`
    : `${res.status} ${res.statusText}`;
  return new ApiError(res.status, res.statusText, message);
}

export async function apiGet<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: await getHeaders(),
    signal,
  });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
  recaptchaToken?: string | null,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: await getHeaders(recaptchaToken),
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export async function apiStreamPost(
  path: string,
  body: unknown,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
  recaptchaToken?: string | null,
): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: await getHeaders(recaptchaToken),
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw await toApiError(res);

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  // ``signal.aborted`` short-circuits the read loop on cancel; without
  // this the reader keeps draining bytes after the consumer is gone,
  // wasting bandwidth and emitting state updates into an unmounted tree.
  const onAbort = (): void => {
    void reader.cancel().catch(() => {
      // Cancelling an already-closed reader is fine, ignore.
    });
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal?.aborted) break;
      onChunk(decoder.decode(value, { stream: true }));
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}
