import { useCallback, useRef, useState } from "react";
import { Link, NavLink, Route, Routes } from "react-router-dom";
import type { FirebaseError } from "firebase/app";

import { useAuth } from "@/hooks/useAuth";
import {
  AlertCircleIcon,
  BotIcon,
  CameraIcon,
  EyeIcon,
  EyeOffIcon,
  GoogleIcon,
  LoaderIcon,
  LockIcon,
  LogOutIcon,
  MailIcon,
  MenuIcon,
  ScanLineIcon,
  UserIcon,
  XIcon,
  ZapIcon,
} from "@/components/ui/Icons";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import CheckIn from "@/components/features/CheckIn";
import ConciergeChat from "@/components/features/ConciergeChat";
import PhotoBoard from "@/components/features/PhotoBoard";
import EventPage from "@/pages/EventPage";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

function friendlyAuthError(error: unknown): string {
  const code = (error as FirebaseError)?.code ?? "";
  switch (code) {
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Invalid email or password.";
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/weak-password":
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/too-many-requests":
      return "Too many attempts. Please try again later.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "";
    default:
      return "Something went wrong. Please try again.";
  }
}

function AuthGate({ children }: { children: React.ReactNode }) {
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
              {/* Email */}
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

              {/* Password */}
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

              {/* Confirm password (sign-up only) */}
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

              {/* Server error */}
              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
                  <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-60"
              >
                {busy && <LoaderIcon className="h-4 w-4" />}
                {isSignUp ? "Create account" : "Sign in"}
              </button>
            </form>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-3 text-gray-400">
                  or continue with
                </span>
              </div>
            </div>

            {/* Google */}
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

            {/* Toggle */}
            <p className="mt-6 text-center text-sm text-gray-500">
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

const NAV_LINKS = [
  { to: "/", label: "Engage", icon: ZapIcon },
  { to: "/concierge", label: "Concierge", icon: BotIcon },
  { to: "/checkin", label: "Check-in", icon: ScanLineIcon },
  { to: "/photos", label: "Photos", icon: CameraIcon },
] as const;

function UserAvatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/[\s@]+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 ${className ?? "h-8 w-8"}`}
    >
      {initials || <UserIcon className="h-4 w-4" />}
    </div>
  );
}

function AppShell() {
  const { user, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const handleSignOut = useCallback(async () => {
    setUserMenuOpen(false);
    await signOut();
  }, [signOut]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          {/* Left: logo + nav */}
          <div className="flex items-center gap-6">
            <NavLink to="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
                <ZapIcon className="h-4 w-4 text-white" />
              </div>
              <span className="text-lg font-bold tracking-tight text-gray-900">
                Ig<span className="text-brand-600">nyt</span>
              </span>
            </NavLink>

            {/* Desktop nav */}
            <nav className="hidden items-center gap-1 sm:flex">
              {NAV_LINKS.map(({ to, label, icon: IconComp }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-brand-50 text-brand-700"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    }`
                  }
                >
                  <IconComp className="h-4 w-4" />
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>

          {/* Right: user menu (desktop) + hamburger (mobile) */}
          <div className="flex items-center gap-2">
            {/* Desktop user menu */}
            <div className="relative hidden sm:block" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-gray-100"
              >
                <UserAvatar name={user?.displayName ?? user?.email ?? ""} />
                <span className="max-w-[140px] truncate text-gray-600">
                  {user?.displayName ?? user?.email}
                </span>
              </button>

              {userMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setUserMenuOpen(false)}
                  />
                  <div className="absolute right-0 z-50 mt-1 w-56 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                    <div className="border-b border-gray-100 px-4 py-2.5">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {user?.displayName ?? "User"}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        {user?.email}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      <LogOutIcon className="h-4 w-4" />
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Mobile hamburger */}
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              className="rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 sm:hidden"
            >
              {mobileOpen ? (
                <XIcon className="h-5 w-5" />
              ) : (
                <MenuIcon className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <nav className="border-t border-gray-100 bg-white px-4 pb-4 pt-2 sm:hidden">
            <div className="space-y-1">
              {NAV_LINKS.map(({ to, label, icon: IconComp }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-brand-50 text-brand-700"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    }`
                  }
                >
                  <IconComp className="h-5 w-5" />
                  {label}
                </NavLink>
              ))}
            </div>
            <div className="mt-3 border-t border-gray-100 pt-3">
              <div className="flex items-center gap-3 px-3 py-1">
                <UserAvatar
                  name={user?.displayName ?? user?.email ?? ""}
                  className="h-9 w-9"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {user?.displayName ?? "User"}
                  </p>
                  <p className="truncate text-xs text-gray-500">{user?.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
              >
                <LogOutIcon className="h-5 w-5" />
                Sign out
              </button>
            </div>
          </nav>
        )}
      </header>

      {/* Content */}
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<EventPage />} />
            <Route path="/concierge" element={<ConciergeChat />} />
            <Route path="/checkin" element={<CheckIn />} />
            <Route path="/photos" element={<PhotoBoard />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ErrorBoundary>
      </main>
    </div>
  );
}

function NotFound() {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
      <div className="mx-auto mb-3 inline-flex items-center justify-center rounded-full bg-gray-100 p-3">
        <AlertCircleIcon className="h-6 w-6 text-gray-500" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900">Page not found</h2>
      <p className="mt-1 text-sm text-gray-500">
        The page you're looking for doesn't exist.
      </p>
      <Link
        to="/"
        className="mt-5 inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        Back to Engage
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthGate>
        <AppShell />
      </AuthGate>
    </ErrorBoundary>
  );
}
