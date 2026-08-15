import type { Metadata } from "next";
import Link from "next/link";
import Nav from "../../components/Nav";
import RegisterForm from "./RegisterForm";
import SignOutButton from "../login/SignOutButton";
import { EVENT_YEAR } from "../../lib/content";
import { ATLAS_OFF_MESSAGE, PROFILES_ENABLED } from "../../lib/db";
import { currentEmail } from "../../lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Create an account — GFF ${EVENT_YEAR} Concierge`,
  description: `Create an account to build a Global Fintech Fest ${EVENT_YEAR} plan that follows you between devices.`,
};

export default async function RegisterPage() {
  const email = await currentEmail();

  return (
    <main className="shell">
      <Nav />
      <header className="subhero">
        <h1 className="display sub">
          Create an <em>account</em>
        </h1>
        <p className="lede">
          Three things: an email, a password and a mobile number. The number is only used if you ask the
          concierge to call you with a day of your plan.
        </p>
      </header>

      <section className="section">
        <div className="notice warn">
          <span className="badge">Not GFF registration</span>
          <span>
            <strong>This is not registration for Global Fintech Fest.</strong> An account here gives you
            no ticket, no badge and no entry to the event. Register officially at{" "}
            <a href="https://www.globalfintechfest.com" target="_blank" rel="noopener noreferrer">
              globalfintechfest.com
            </a>.
          </span>
        </div>

        {!PROFILES_ENABLED ? (
          <div className="notice warn">
            <span className="badge">Unavailable</span>
            <span>{ATLAS_OFF_MESSAGE}</span>
          </div>
        ) : email ? (
          <div className="coverage" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span>
              You are already signed in as <strong>{email}</strong>.{" "}
              <Link className="mlink" href="/my-plan">Go to your plan →</Link>
            </span>
            <SignOutButton label="sign out to use another account" />
          </div>
        ) : (
          <RegisterForm />
        )}
      </section>

      <footer>
        <strong>We do not verify your email address.</strong> No confirmation message is sent, so
        creating an account proves someone chose a password for that address — not that they own the
        inbox. Nothing on this site is treated as verified because of it. Your password is stored only
        as a hash; your number is stored so a call you request can be placed. Don&apos;t put anything
        sensitive in your profile.
      </footer>
    </main>
  );
}
