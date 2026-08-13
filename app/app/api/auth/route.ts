import { NextResponse } from "next/server";
import { COOKIE_NAME } from "../../../lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { email } = await req.json().catch(() => ({ email: "" }));
  const e = String(email || "").trim().toLowerCase();
  if (!e.includes("@") || e.length < 5) {
    return NextResponse.json({ error: "Enter an email address." }, { status: 400 });
  }
  const res = NextResponse.json({ ok: true, email: e });
  res.cookies.set(COOKIE_NAME, e, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 60,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return res;
}
