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

async function getHeaders(): Promise<HeadersInit> {
  const headers: HeadersInit = { "Content-Type": "application/json" };

  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    headers["Authorization"] = `Bearer ${token}`;
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

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: await getHeaders() });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: await getHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export async function apiStreamPost(
  path: string,
  body: unknown,
  onChunk: (text: string) => void,
): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: await getHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await toApiError(res);

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
}
