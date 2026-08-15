import { NextResponse } from "next/server";
import {
  ATLAS_OFF_MESSAGE,
  PASSWORD_MIN,
  PROFILES_ENABLED,
  createAccount,
  isE164,
  normaliseEmail,
} from "../../../../lib/db";
import { clientKey, rateLimit, sessionCookie } from "../../../../lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/register — create an account and sign the visitor straight in.
 *
 * NOTHING HERE PROVES THE ADDRESS BELONGS TO THE REGISTRANT. No verification
 * mail is sent. An account means someone chose a password for that string, so
 * never present a registered email as confirmed, and never let one reveal
 * anything about a person who might really own it.
 */
export async function POST(req: Request) {
  if (!PROFILES_ENABLED) {
    return NextResponse.json({ error: ATLAS_OFF_MESSAGE }, { status: 503 });
  }

  if (!rateLimit(`register:${clientKey(req)}`, 10, 60 * 60_000)) {
    return NextResponse.json(
      { error: "Too many sign-ups from here. Try again later." },
      { status: 429 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
    phone?: string;
  };

  const email = normaliseEmail(body.email ?? "");
  const password = String(body.password ?? "");
  const phone = String(body.phone ?? "").replace(/[\s()-]/g, "");

  // Registration errors are specific — unlike sign-in, the visitor is telling
  // us these values, so naming the bad one leaks nothing they don't know.
  if (!email) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (password.length < PASSWORD_MIN) {
    return NextResponse.json(
      { error: `Use at least ${PASSWORD_MIN} characters for your password.` },
      { status: 400 },
    );
  }
  if (password.length > 200) {
    return NextResponse.json({ error: "That password is too long." }, { status: 400 });
  }
  if (!isE164(phone)) {
    return NextResponse.json(
      { error: "Enter your phone in international format, e.g. +919876543210." },
      { status: 400 },
    );
  }

  let account;
  try {
    account = await createAccount(email, password, phone);
  } catch {
    return NextResponse.json({ error: ATLAS_OFF_MESSAGE }, { status: 503 });
  }

  if (!account) {
    // 409 here does disclose that the address is taken. That is the trade the
    // contract makes: a sign-up form cannot both refuse duplicates and hide
    // them. Sign-in stays generic, which is where grinding would happen.
    return NextResponse.json(
      { error: "That email is already registered. Sign in instead." },
      { status: 409 },
    );
  }

  const res = NextResponse.json({ email: account.email }, { status: 201 });
  const c = sessionCookie(account.email);
  res.cookies.set(c.name, c.value, c.options);
  return res;
}
