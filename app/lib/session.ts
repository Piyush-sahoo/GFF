import { cookies } from "next/headers";

/**
 * CONVENIENCE LOGIN, NOT A SECURITY BOUNDARY.
 *
 * The user types an email and is logged in. Nothing is verified and no mail is
 * sent, so this identifies a browser, not a person. Never gate anything
 * sensitive on it and never label a profile "verified".
 */
const COOKIE = "gff_email";

export async function currentEmail(): Promise<string | null> {
  const c = await cookies();
  const v = c.get(COOKIE)?.value;
  return v && v.includes("@") ? v.toLowerCase() : null;
}

export const COOKIE_NAME = COOKIE;
