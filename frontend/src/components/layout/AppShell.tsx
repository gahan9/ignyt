import { useCallback, useRef, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import {
  BotIcon,
  CameraIcon,
  LogOutIcon,
  MenuIcon,
  ScanLineIcon,
  ShieldIcon,
  UserIcon,
  XIcon,
  ZapIcon,
} from "@/components/ui/Icons";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import CheckIn from "@/components/features/CheckIn";
import ConciergeChat from "@/components/features/ConciergeChat";
import PhotoBoard from "@/components/features/PhotoBoard";
import AdminPage from "@/pages/Admin";
import EventPage from "@/pages/EventPage";
import NotFound from "@/pages/NotFound";

const NAV_LINKS = [
  { to: "/", label: "Engage", icon: ZapIcon },
  { to: "/concierge", label: "Concierge", icon: BotIcon },
  { to: "/checkin", label: "Check-in", icon: ScanLineIcon },
  { to: "/photos", label: "Photos", icon: CameraIcon },
  { to: "/admin", label: "Admin", icon: ShieldIcon },
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

export function AppShell() {
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
      {/*
        Skip-link: WCAG 2.4.1 (Bypass Blocks). Hidden until a keyboard
        user tabs onto it; first focusable element on the page lets
        screen-reader and motor-impaired users jump past the nav.
      */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-brand-600 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-brand-700"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <NavLink to="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
                <ZapIcon className="h-4 w-4 text-white" />
              </div>
              <span className="text-lg font-bold tracking-tight text-gray-900">
                Ig<span className="text-brand-600">nyt</span>
              </span>
            </NavLink>

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
                        : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                    }`
                  }
                >
                  <IconComp className="h-4 w-4" />
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative hidden sm:block" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-gray-100"
              >
                <UserAvatar name={user?.displayName ?? user?.email ?? ""} />
                <span className="max-w-[140px] truncate text-gray-700">
                  {user?.displayName ?? user?.email}
                </span>
              </button>

              {userMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setUserMenuOpen(false)}
                    aria-hidden="true"
                  />
                  <div
                    role="menu"
                    aria-label="Account menu"
                    className="absolute right-0 z-50 mt-1 w-56 rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
                  >
                    <div className="border-b border-gray-100 px-4 py-2.5">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {user?.displayName ?? "User"}
                      </p>
                      <p className="truncate text-xs text-gray-600">
                        {user?.email}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="menuitem"
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

            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav"
              className="rounded-lg p-2 text-gray-700 transition-colors hover:bg-gray-100 sm:hidden"
            >
              {mobileOpen ? (
                <XIcon className="h-5 w-5" />
              ) : (
                <MenuIcon className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <nav
            id="mobile-nav"
            className="border-t border-gray-100 bg-white px-4 pb-4 pt-2 sm:hidden"
          >
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
                        : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
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
                  <p className="truncate text-xs text-gray-600">{user?.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
              >
                <LogOutIcon className="h-5 w-5" />
                Sign out
              </button>
            </div>
          </nav>
        )}
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto max-w-5xl px-4 py-6 sm:px-6 focus:outline-none"
      >
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<EventPage />} />
            <Route path="/concierge" element={<ConciergeChat />} />
            <Route path="/checkin" element={<CheckIn />} />
            <Route path="/photos" element={<PhotoBoard />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ErrorBoundary>
      </main>
    </div>
  );
}
