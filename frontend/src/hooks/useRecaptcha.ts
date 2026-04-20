import { useCallback, useEffect, useRef } from "react";

const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
    };
  }
}

let scriptLoaded = false;

function ensureScript(): void {
  if (scriptLoaded || !SITE_KEY || typeof document === "undefined") return;
  scriptLoaded = true;

  const s = document.createElement("script");
  s.src = `https://www.google.com/recaptcha/api.js?render=${SITE_KEY}`;
  s.async = true;
  document.head.appendChild(s);
}

/**
 * Returns a function that resolves a reCAPTCHA v3 token for a given action.
 * Returns `null` when `VITE_RECAPTCHA_SITE_KEY` is unset (local dev).
 */
export function useRecaptcha(): (action: string) => Promise<string | null> {
  const mountedRef = useRef(true);

  useEffect(() => {
    ensureScript();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return useCallback(
    (action: string): Promise<string | null> => {
      if (!SITE_KEY || !window.grecaptcha) return Promise.resolve(null);

      return new Promise((resolve) => {
        window.grecaptcha!.ready(async () => {
          if (!mountedRef.current) {
            resolve(null);
            return;
          }
          try {
            const token = await window.grecaptcha!.execute(SITE_KEY, { action });
            resolve(token);
          } catch {
            resolve(null);
          }
        });
      });
    },
    [],
  );
}
