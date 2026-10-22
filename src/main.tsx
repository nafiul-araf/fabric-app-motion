import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "react-error-boundary";
import { MotionConfig } from "framer-motion";
import "@fontsource-variable/geist";

import { Stage } from "./components/stage/stage";
import { ThemeContext, useAppTheme } from "./lib/theme";
import "./global.css";

function ErrorFallback({ error, resetErrorBoundary }: { error: unknown; resetErrorBoundary: () => void }) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <div className="w-full max-w-md text-center">
                <h2 className="mb-2 text-lg font-semibold text-foreground">Something went wrong</h2>
                <pre className="mb-4 max-h-32 overflow-auto rounded border border-border bg-muted p-3 text-left text-sm text-muted-foreground">
                    {error instanceof Error ? error.message : String(error)}
                </pre>
                <button onClick={resetErrorBoundary} className="rounded border border-border px-4 py-2 text-sm text-foreground hover:bg-accent">
                    Try again
                </button>
            </div>
        </div>
    );
}

function Root() {
    const theme = useAppTheme();
    return (
        <ThemeContext.Provider value={theme}>
            {/* reducedMotion="user": transforms off for reduced-motion users. */}
            <MotionConfig reducedMotion="user">
                <ErrorBoundary FallbackComponent={ErrorFallback}>
                    <Stage />
                </ErrorBoundary>
            </MotionConfig>
        </ThemeContext.Provider>
    );
}

createRoot(document.getElementById("root")!).render(<Root />);
