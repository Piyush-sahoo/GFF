import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * SIGNED SESSION COOKIE.
 *
 * The cookie carries the email plus an issue time and a nonce, HMAC-signed
 * with SESSION_SECRET. Signing is what stops a visitor typing someone else's
 * address into their own cookie — the previous gff_email cookie let anyone
 * be anyone. It is still a bearer token with no server-side revocation list:
 * logout clears the browser's copy, and the value is only good for
 * SESSION_TTL_MS, but a copy stolen before then would still verify.
 *
 * What it does NOT prove is address ownership. Registration sends no
 * verification mail, so an account proves someone knows a password, not that
 * they own the inbox. Do not label anything "verified" on the back of it.
 */
const COOKIE = "gff_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

/**
 * No SESSION_SECRET => a random per-process key. Sessions then die on every
 * restart, which is loud and annoying and therefore honest; silently signing
 * with a hardcoded default would be worse.
 */
const secret = (() => {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[session] SESSION_SECRET is unset or too short — using an ephemeral key. Every restart signs out every user.",
    );
  }
  return randomBytes(32).toString("hex");
})();

function sign(payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** email|issuedAtMs|nonce.signature */
function mint(email: string): string {
  const payload = `${email}|${Date.now()}|${randomBytes(9).toString("base64url")}`;
  return `${payload}.${sign(payload)}`;
}

function verify(token: string | undefined): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const got = Buffer.from(token.slice(dot + 1));
  const want = Buffer.from(sign(payload));
  // Constant-time so a signature cannot be guessed byte by byte.
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;

  const [email, issuedAt] = payload.split("|");
  if (!email || !email.includes("@")) return null;
  const at = Number(issuedAt);
  if (!Number.isFinite(at) || Date.now() - at > SESSION_TTL_MS) return null;
  return email.toLowerCase();
}

export type SessionCookie = {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    secure: true;
    sameSite: "lax";
    path: string;
    maxAge: number;
  };
};

/** A fresh cookie for this email. Called on login — every login rotates it. */
export function sessionCookie(email: string): SessionCookie {
  return {
    name: COOKIE,
    value: mint(email.toLowerCase()),
    options: {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    },
  };
}

/** The cookie that ends a session. maxAge 0 tells the browser to drop it. */
export function clearedCookie(): SessionCookie {
  return {
    name: COOKIE,
    value: "",
    options: { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 },
  };
}

/** The signed-in email, or null. The one way any surface learns who this is. */
export async function currentEmail(): Promise<string | null> {
  const c = await cookies();
  return verify(c.get(COOKIE)?.value);
}

export const COOKIE_NAME = COOKIE;

/* ------------------------------------------------------------------ *
 * Rate limiting — in-memory, per process.                            *
 *                                                                    *
 * Enough to stop a script grinding passwords from one browser. It is  *
 * NOT enough for a real deployment: a restart clears it and several   *
 * instances each get their own window.                                *
 * ------------------------------------------------------------------ */

const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const cur = hits.get(key);
  if (!cur || now > cur.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  cur.count += 1;
  if (hits.size > 5000) {
    // Cheap bound so a spray of unique keys cannot grow the map forever.
    for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
  }
  return cur.count <= limit;
}

/** Best-effort client identity for rate limiting. Spoofable; a speed bump. */
export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : "") || req.headers.get("x-real-ip") || "local";
}
