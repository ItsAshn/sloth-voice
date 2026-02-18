import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-text-muted bg-surface-lowest p-8">
          <span className="text-4xl">⚠</span>
          <p className="text-text-normal font-mono text-lg">
            something went wrong
          </p>
          <pre className="text-xs text-danger font-mono max-w-lg text-center whitespace-pre-wrap">
            {(this.state.error as Error).message}
          </pre>
          <button
            className="mt-2 px-4 py-2 border border-surface-highest text-text-muted hover:text-text-normal text-sm font-mono transition-colors"
            onClick={() => this.setState({ error: null })}
          >
            retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <App />
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
