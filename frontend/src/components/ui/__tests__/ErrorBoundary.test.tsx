import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "../ErrorBoundary";

// A child that throws on render the first time then renders normally after
// `reset` flips `shouldThrow` to false via a ref. We flip it by re-rendering
// with a key prop from a wrapper. The explicit `: never` return type tells
// TS the function never produces a value, so JSX accepts it as a component.
function Boom({ message = "synthetic failure" }: { message?: string }): never {
  throw new Error(message);
}

function Ok() {
  return <p>all good</p>;
}

beforeEach(() => {
  // React 18 logs uncaught errors to console.error even inside error boundaries.
  // Suppress for clean test output — we still assert behavior through the UI.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("<ErrorBoundary />", () => {
  it("renders children happy-path when no error is thrown", () => {
    render(
      <ErrorBoundary>
        <Ok />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/all good/i)).toBeInTheDocument();
  });

  it("renders default fallback UI when a child throws", () => {
    render(
      <ErrorBoundary>
        <Boom message="kaboom" />
      </ErrorBoundary>,
    );

    expect(
      screen.getByRole("heading", { name: /something went wrong/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/kaboom/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("uses a custom fallback render-prop when provided", () => {
    render(
      <ErrorBoundary
        fallback={(err, reset) => (
          <div>
            <p>custom:{err.message}</p>
            <button type="button" onClick={reset}>
              retry
            </button>
          </div>
        )}
      >
        <Boom message="boom-custom" />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/custom:boom-custom/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("resets back to children when 'Try again' is clicked", async () => {
    const user = userEvent.setup();
    function Toggle() {
      // Externally-driven throw so Strict-Mode double-invocation and
      // post-reset re-renders don't race a module-scoped flag. We only
      // read the state here; the Harness owns the writable setter.
      const [ok] = useState(false);
      if (!ok) throw new Error("first-only");
      return <p>recovered!</p>;
    }
    function Harness() {
      const [ok, setOk] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOk(true)}>
            recover
          </button>
          <ErrorBoundary>{ok ? <p>recovered!</p> : <Toggle />}</ErrorBoundary>
        </>
      );
    }

    render(<Harness />);

    expect(screen.getByText(/first-only/i)).toBeInTheDocument();

    // First flip the external state so the child will no longer throw,
    // THEN click the ErrorBoundary's "Try again" to clear its error state.
    await user.click(screen.getByRole("button", { name: /recover/i }));
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(screen.getByText(/recovered!/i)).toBeInTheDocument();
  });

  it("falls back to 'Unknown error' when the Error has no message", () => {
    function Silent(): never {
      throw new Error();
    }
    render(
      <ErrorBoundary>
        <Silent />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/unknown error/i)).toBeInTheDocument();
  });
});
