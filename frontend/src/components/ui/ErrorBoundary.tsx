import { Component, type ReactNode } from "react";

import { AlertCircleIcon } from "@/components/ui/Icons";

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // React logs to console by default; keep this hook so we can wire a
    // real sink (Sentry, Cloud Logging, etc.) without touching callers.
    console.error("ErrorBoundary caught:", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-red-100 bg-white p-6 text-center shadow-lg">
          <div className="mb-3 inline-flex items-center justify-center rounded-full bg-red-50 p-3">
            <AlertCircleIcon className="h-6 w-6 text-red-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">
            Something went wrong
          </h2>
          <p className="mt-1 break-words text-sm text-gray-500">
            {error.message || "Unknown error"}
          </p>
          <button
            type="button"
            onClick={this.reset}
            className="mt-5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
