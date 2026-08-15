"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        // Whatever the server says is already generic — pass it through
        // rather than inventing a more specific message here.
        setErr(d.error || "Could not sign you in.");
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setErr("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className="objform" onSubmit={submit} style={{ maxWidth: 460 }}>
        <div>
          <label className="objlabel" htmlFor="email">Email</label>
          <input
            id="email"
            className="search"
            style={{ paddingLeft: 16 }}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </div>
        <div>
          <label className="objlabel" htmlFor="password">Password</label>
          <input
            id="password"
            className="search"
            style={{ paddingLeft: 16 }}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="objrow">
          <button type="submit" disabled={busy || !email || !password}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <Link className="mlink" href="/register">Create an account →</Link>
        </div>
        {err && <p className="mthin" style={{ color: "#ff9b9b" }} role="alert">{err}</p>}
      </form>

      <p className="coverage" style={{ maxWidth: 620 }}>
        There is no password reset in this build. If you forget it, the account cannot be recovered.
      </p>
    </>
  );
}
