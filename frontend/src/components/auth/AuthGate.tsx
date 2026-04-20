import { useCallback, useRef, useState } from "react";

import {
  EMAIL_RE,
  MIN_PASSWORD_LENGTH,
  friendlyAuthError,
} from "@/lib/authErrors";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertCircleIcon,
  EyeIcon,
  EyeOffIcon,
  GoogleIcon,
  LoaderIcon,
  LockIcon,
  MailIcon,
  ZapIcon,
} from "@/components/ui/Icons";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, signInWithGoogle, signInWithEmail, signUpWithEmail } =
    useAuth();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  const validate = useCallback((): boolean => {
    const errs: Record<string, string> = {};

    if (!email.trim()) {
      errs.email = "Email is required.";
    } else if (!EMAIL_RE.test(email)) {
      errs.email = "Enter a valid email address.";
    }

    if (!password) {
      errs.password = "Password is required.";
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      errs.password = `At least ${MIN_PASSWORD_LENGTH} characters.`;
    }

    if (isSignUp && password !== confirmPassword) {
      errs.confirm = "Passwords do not match.";
    }

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }, [email, password, confirmPassword, isSignUp]);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      setError("");
      if (!validate()) return;

      setBusy(true);
      try {
        if (isSignUp) {
          await signUpWithEmail(email, password);
        } else {
          await signInWithEmail(email, password);
        }
      } catch (err) {
        const msg = friendlyAuthError(err);
        if (msg) setError(msg);
      } finally {
        setBusy(false);
      }
    },
    [email, password, isSignUp, validate, signInWithEmail, signUpWithEmail],
  );

  const handleGoogle = useCallback(async () => {
    setError("");
    setGoogleBusy(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      const msg = friendlyAuthError(err);
      if (msg) setError(msg);
    } finally {
      setGoogleBusy(false);
    }
  }, [signInWithGoogle]);

  const toggleMode = useCallback(() => {
    setIsSignUp((v) => !v);
    setError("");
    setFieldErrors({});
    setConfirmPassword("");
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <LoaderIcon className="h-8 w-8 text-brand-600" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-brand-50 p-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mb-3 inline-flex items-center justify-center rounded-2xl bg-brand-600 p-3 shadow-lg shadow-brand-200">
              <ZapIcon className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              Ig<span className="text-brand-600">nyt</span>
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Live engagement, smart check-in, AI concierge.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl shadow-gray-100/50 sm:p-8">
            <h2 className="mb-6 text-center text-lg font-semibold text-gray-900">
              {isSignUp ? "Create your account" : "Sign in to your account"}
            </h2>

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <div>
                <label
                  htmlFor="auth-email"
                  className="mb-1.5 block text-sm font-medium text-gray-700"
                >
                  Email
                </label>
                <div className="relative">
                  <MailIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    id="auth-email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setFieldErrors((f) => ({ ...f, email: "" }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        passwordRef.current?.focus();
                      }
                    }}
                    placeholder="you@example.com"
                    autoComplete="email"
                    aria-invalid={!!fieldErrors.email}
                    className={`w-full rounded-lg border py-2.5 pl-10 pr-3 text-sm outline-none transition-colors focus:ring-2 focus:ring-brand-500/20 ${
                      fieldErrors.email
                        ? "border-red-300 focus:border-red-400"
                        : "border-gray-300 focus:border-brand-500"
                    }`}
                  />
                </div>
                {fieldErrors.email && (
                  <p className="mt-1 text-xs text-red-500">{fieldErrors.email}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="auth-password"
                  className="mb-1.5 block text-sm font-medium text-gray-700"
                >
                  Password
                </label>
                <div className="relative">
                  <LockIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    ref={passwordRef}
                    id="auth-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setFieldErrors((f) => ({ ...f, password: "" }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && isSignUp) {
                        e.preventDefault();
                        confirmRef.current?.focus();
                      }
                    }}
                    placeholder="••••••••"
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                    aria-invalid={!!fieldErrors.password}
                    className={`w-full rounded-lg border py-2.5 pl-10 pr-10 text-sm outline-none transition-colors focus:ring-2 focus:ring-brand-500/20 ${
                      fieldErrors.password
                        ? "border-red-300 focus:border-red-400"
                        : "border-gray-300 focus:border-brand-500"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? (
                      <EyeOffIcon className="h-4 w-4" />
                    ) : (
                      <EyeIcon className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p className="mt-1 text-xs text-red-500">
                    {fieldErrors.password}
                  </p>
                )}
              </div>

              {isSignUp && (
                <div>
                  <label
                    htmlFor="auth-confirm"
                    className="mb-1.5 block text-sm font-medium text-gray-700"
                  >
                    Confirm password
                  </label>
                  <div className="relative">
                    <LockIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      ref={confirmRef}
                      id="auth-confirm"
                      type={showPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        setFieldErrors((f) => ({ ...f, confirm: "" }));
                      }}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      aria-invalid={!!fieldErrors.confirm}
                      className={`w-full rounded-lg border py-2.5 pl-10 pr-3 text-sm outline-none transition-colors focus:ring-2 focus:ring-brand-500/20 ${
                        fieldErrors.confirm
                          ? "border-red-300 focus:border-red-400"
                          : "border-gray-300 focus:border-brand-500"
                      }`}
                    />
                  </div>
                  {fieldErrors.confirm && (
                    <p className="mt-1 text-xs text-red-500">
                      {fieldErrors.confirm}
                    </p>
                  )}
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700"
                >
                  <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-60"
              >
                {busy && <LoaderIcon className="h-4 w-4" />}
                {isSignUp ? "Create account" : "Sign in"}
              </button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-3 text-gray-500">
                  or continue with
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGoogle}
              disabled={googleBusy}
              className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-gray-300 bg-white py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400 disabled:opacity-60"
            >
              {googleBusy ? (
                <LoaderIcon className="h-4 w-4" />
              ) : (
                <GoogleIcon className="h-4 w-4" />
              )}
              Google
            </button>

            <p className="mt-6 text-center text-sm text-gray-600">
              {isSignUp
                ? "Already have an account?"
                : "Don't have an account?"}
              <button
                type="button"
                onClick={toggleMode}
                className="ml-1 font-semibold text-brand-600 hover:text-brand-700"
              >
                {isSignUp ? "Sign in" : "Create one"}
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
