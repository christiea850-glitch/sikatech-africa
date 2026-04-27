// src/components/ErrorBoundary.tsx
import React from "react";

type Props = { children: React.ReactNode };
type State = { hasError: boolean; message?: string };

class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(err: any) {
    return { hasError: true, message: err?.message ?? String(err) };
  }

  componentDidCatch(error: any, info: any) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16 }}>
          <h2>App crashed</h2>
          <pre style={{ whiteSpace: "pre-wrap" }}>{this.state.message}</pre>
          <p>Open DevTools → Console for the full error.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
// ✅ also export named, so both import styles work
export { ErrorBoundary };

