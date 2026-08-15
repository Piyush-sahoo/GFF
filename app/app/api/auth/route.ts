import { NextResponse } from "next/server";
import {
  ATLAS_OFF_MESSAGE,
  PROFILES_ENABLED,
  normaliseEmail,
  touchLastLogin,
  verifyCredentials,
} from "../../../lib/db";
import { clearedCookie, clientKey, rateLimit, sessionCookie } from "../../../lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ONE failure string for every way a sign-in can fail.
 *
 * "No such account" and "wrong password" must be indistinguishable, or the
 * form becomes a way to ask whether an address is registered. The timing is
 * levelled in verifyCredentials for the same reason.
 */
const GENERIC_FAILURE = "That email and password don't match an account.";

/** POST /api/auth — sign in. Rotates the session cookie on every success. */
export async function POST(req: Request) {
  if (!PROFILES_ENABLED) {
    return NextResponse.json({ error: ATLAS_OFF_MESSAGE }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const email = normaliseEmail((body as { email?: string }).email ?? "");
  const password = String((body as { password?: string }).password ?? "");

  // Per-IP and per-address, so one attacker cannot grind a single account and
  // a shared office IP cannot be locked out by one person's typos alone.
  const ip = clientKey(req);
  if (!rateLimit(`login:ip:${ip}`, 20, 15 * 60_000)) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }
  if (email && !rateLimit(`login:email:${email}`, 8, 15 * 60_000)) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  if (!email || !password) {
    return NextResponse.json({ error: GENERIC_FAILURE }, { status: 401 });
  }

  let ok = false;
  try {
    ok = await verifyCredentials(email, password);
  } catch {
    return NextResponse.json({ error: ATLAS_OFF_MESSAGE }, { status: 503 });
  }
  if (!ok) {
    return NextResponse.json({ error: GENERIC_FAILURE }, { status: 401 });
  }

  await touchLastLogin(email).catch(() => {});

  const res = NextResponse.json({ email });
  const c = sessionCookie(email);
  res.cookies.set(c.name, c.value, c.options);
  return res;
}

/** DELETE /api/auth — sign out. */
export async function DELETE() {
  const res = new NextResponse(null, { status: 204 });
  const c = clearedCookie();
  res.cookies.set(c.name, c.value, c.options);
  // The old unsigned cookie could still be sitting in a browser from before
  // sessions were signed. Clear it too or that visitor stays "signed in".
  res.cookies.set("gff_email", "", { path: "/", maxAge: 0 });
  return res;
}
