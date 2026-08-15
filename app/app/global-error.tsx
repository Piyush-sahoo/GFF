"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ background: "#0a0b0f", color: "#eef0f5", fontFamily: "system-ui, sans-serif", padding: "48px 24px" }}>
        <div style={{ maxWidth: 620, margin: "0 auto" }}>
          <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "#f5a524" }}>
            Something went wrong
          </p>
          <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 30, marginTop: 14 }}>
            The page failed to load.
          </h1>
          <p style={{ color: "#99a0b3", lineHeight: 1.65 }}>
            Try a hard refresh — if this page has been open a while, your browser may be holding a stale
            copy of the site. Otherwise use the links below.
          </p>
          <p style={{ marginTop: 22, display: "flex", gap: 16 }}>
            <button onClick={() => reset()} style={{ padding: "11px 20px", borderRadius: 9, border: "none", background: "#f5a524", color: "#17120a", fontWeight: 650, cursor: "pointer" }}>
              Try again
            </button>
            <a href="/" style={{ color: "#f5a524", alignSelf: "center" }}>Back to home</a>
          </p>
          {error?.digest && <p style={{ color: "#6c7488", fontSize: 12, marginTop: 18 }}>Reference: {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}
