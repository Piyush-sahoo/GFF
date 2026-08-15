"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const PASSWORD_MIN = 10;

export default function RegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("+91");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Mirrors the server's E.164 check so the button explains itself before a
  // round trip. The server is still the one that decides.
  const phoneOk = /^\+[1-9]\d{7,14}$/.test(phone.replace(/[\s()-]/g, ""));
  const passwordOk = password.length >= PASSWORD_MIN;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, phone }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setErr(d.error || "Could not create your account.");
        return;
      }
      // Registration signs you in, so go straight to the plan.
      router.push("/my-plan");
      router.refresh();
    } catch {
      setErr("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
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
        <label className="objlabel" htmlFor="password">
          Password — at least {PASSWORD_MIN} characters
        </label>
        <input
          id="password"
          className="search"
          style={{ paddingLeft: 16 }}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {password.length > 0 && !passwordOk && (
          <p className="mthin">{PASSWORD_MIN - password.length} more character(s) needed.</p>
        )}
      </div>

      <div>
        <label className="objlabel" htmlFor="phone">Mobile number, with country code</label>
        <input
          id="phone"
          className="search"
          style={{ paddingLeft: 16 }}
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+919876543210"
        />
        <p className="mthin">
          Used only if you ask the concierge to call you with a day of your plan. We never call you
          unprompted. {phone.length > 3 && !phoneOk && <strong>Include the + and country code.</strong>}
        </p>
      </div>

      <div className="objrow">
        <button type="submit" disabled={busy || !emailOk || !passwordOk || !phoneOk}>
          {busy ? "Creating…" : "Create account"}
        </button>
        <Link className="mlink" href="/login">Already have one? Sign in →</Link>
      </div>

      {err && <p className="mthin" style={{ color: "#ff9b9b" }} role="alert">{err}</p>}
    </form>
  );
}
