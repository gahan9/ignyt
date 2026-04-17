import { NavLink, Route, Routes } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import EventPage from "@/pages/EventPage";

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, signInWithGoogle } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
        <h1 className="text-5xl font-bold tracking-tight">
          Event<span className="text-brand-600">Pulse</span>
        </h1>
        <p className="max-w-md text-center text-lg text-gray-600">
          AI-powered event experience — live engagement, smart check-in, and a
          personal concierge for every attendee.
        </p>
        <button
          onClick={signInWithGoogle}
          className="rounded-lg bg-brand-600 px-6 py-3 text-white font-medium shadow-md hover:bg-brand-700 transition-colors"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  return <>{children}</>;
}

const NAV_LINKS = [
  { to: "/", label: "Engage" },
  { to: "/concierge", label: "Concierge" },
  { to: "/checkin", label: "Check-in" },
];

function AppShell() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-bold">
            Event<span className="text-brand-600">Pulse</span>
          </h1>
          <nav className="hidden sm:flex gap-1">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === "/"}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-brand-50 text-brand-700"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{user?.email}</span>
          <button
            onClick={signOut}
            className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-6">
        <Routes>
          <Route path="/" element={<EventPage />} />
          <Route path="/concierge" element={<Placeholder name="AI Concierge" />} />
          <Route path="/checkin" element={<Placeholder name="Check-in" />} />
        </Routes>
      </main>
    </div>
  );
}

function Placeholder({ name }: { name: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-12 text-center">
      <p className="text-gray-500">{name} — coming in a future commit.</p>
    </div>
  );
}

export default function App() {
  return (
    <AuthGate>
      <AppShell />
    </AuthGate>
  );
}
