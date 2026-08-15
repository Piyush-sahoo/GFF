"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Sign out from anywhere. DELETE /api/auth clears the session cookie. */
export default function SignOutButton({ label = "sign out" }: { label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      className="clearfilters"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/auth", { method: "DELETE" }).catch(() => {});
        // refresh() re-runs the server components so every "signed in as"
        // on the page updates, not just this one.
        router.refresh();
        setBusy(false);
      }}
    >
      {busy ? "signing out…" : label}
    </button>
  );
}
