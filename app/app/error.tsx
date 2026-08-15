"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[route error]", error);
  }, [error]);

  return (
    <main className="shell">
      <section className="section">
        <div className="pending">
          <div className="pending-mark">Something went wrong</div>
          <h3>This page failed to load.</h3>
          <p>
            The rest of the site is unaffected — the agenda, speakers and exhibitor directory are static
            pages and load independently of this one.
          </p>
          <p>
            If you have this page open in an old tab, a hard refresh usually fixes it: the site was
            rebuilt and your browser may be holding a stale copy.
          </p>
          <div className="objrow" style={{ marginTop: 18 }}>
            <button onClick={() => reset()}>Try again</button>
            <Link className="mlink" href="/">Back to home</Link>
          </div>
          {error?.digest && <p className="mthin">Reference: {error.digest}</p>}
        </div>
      </section>
    </main>
  );
}
