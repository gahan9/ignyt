import { AuthGate } from "@/components/auth/AuthGate";
import { AppShell } from "@/components/layout/AppShell";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

export default function App() {
  return (
    <ErrorBoundary>
      <AuthGate>
        <AppShell />
      </AuthGate>
    </ErrorBoundary>
  );
}
