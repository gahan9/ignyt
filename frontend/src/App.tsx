import { useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import CheckIn from "@/components/features/CheckIn";
import ConciergeChat from "@/components/features/ConciergeChat";
import PhotoBoard from "@/components/features/PhotoBoard";
import EventPage from "@/pages/EventPage";

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");

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
          Ig<span className="text-brand-600">nyt</span>
        </h1>
        
        <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
          <h2 className="mb-4 text-xl font-semibold text-center">
            {isSignUp ? "Create Account" : "Sign In"}
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 outline-none"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 outline-none"
                placeholder="••••••••"
              />
            </div>
            
            {error && <p className="text-xs text-red-500">{error}</p>}

            <button
              onClick={async () => {
                setError("");
                try {
                  if (isSignUp) await signUpWithEmail(email, password);
                  else await signInWithEmail(email, password);
                } catch (e: any) {
                  setError(e.message);
                }
              }}
              className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-bold text-white shadow-md hover:bg-brand-700 transition-all"
            >
              {isSignUp ? "Register" : "Sign In"}
            </button>
            
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-gray-400">Or continue with</span></div>
            </div>

            <button
              onClick={signInWithGoogle}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81.38z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google
            </button>
            
            <p className="mt-4 text-center text-sm text-gray-500">
              {isSignUp ? "Already have an account?" : "Don't have an account?"}
              <button
                onClick={() => setIsSignUp(!isSignUp)}
                className="ml-1 font-semibold text-brand-600 hover:text-brand-700"
              >
                {isSignUp ? "Sign In" : "Register"}
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
  { to: "/", label: "Engage" },
  { to: "/concierge", label: "Concierge" },
  { to: "/checkin", label: "Check-in" },
  { to: "/photos", label: "Photos" },
];

function AppShell() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-bold">
            Ig<span className="text-brand-600">nyt</span>
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
          <Route path="/concierge" element={<ConciergeChat />} />
          <Route path="/checkin" element={<CheckIn />} />
          <Route path="/photos" element={<PhotoBoard />} />
        </Routes>
      </main>
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
