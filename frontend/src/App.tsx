import { Route, Routes } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";

function HomePage() {
  const { user, loading, signInWithGoogle, signOut } = useAuth();

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

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur px-6 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold">
          Event<span className="text-brand-600">Pulse</span>
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{user.email}</span>
          <button
            onClick={signOut}
            className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-6">
        <p className="text-gray-600">Welcome! Features coming in next commits.</p>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
    </Routes>
  );
}
