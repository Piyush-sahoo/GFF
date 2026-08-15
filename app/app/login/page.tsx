import type { Metadata } from "next";
import Link from "next/link";
import Nav from "../../components/Nav";
import SignOutButton from "./SignOutButton";
import LoginForm from "./LoginForm";
import { EVENT_YEAR } from "../../lib/content";
import { ATLAS_OFF_MESSAGE, PROFILES_ENABLED } from "../../lib/db";
import { currentEmail } from "../../lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Sign in — GFF ${EVENT_YEAR} Concierge`,
  description: `Sign in to build and keep your Global Fintech Fest ${EVENT_YEAR} plan.`,
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const email = await currentEmail();
  const { next } = await searchParams;
  // Only ever redirect within this app — an open redirect here would let a
  // link that looks like ours land someone on a lookalike sign-in page.
  const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/my-plan";

  return (
    <main className="shell">
      <Nav />
      <header className="subhero">
        <h1 className="display sub">
          Sign <em>in</em>
        </h1>
        <p className="lede">
          Your plan is kept against your account, so it follows you from your laptop to your phone on
          the show floor.
        </p>
      </header>

      <section className="section">
        {!PROFILES_ENABLED ? (
          <div className="notice warn">
            <span className="badge">Unavailable</span>
            <span>{ATLAS_OFF_MESSAGE}</span>
          </div>
        ) : email ? (
          <div className="coverage" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span>
              Signed in as <strong>{email}</strong>. <Link className="mlink" href={dest}>Continue →</Link>
            </span>
            <SignOutButton />
          </div>
        ) : (
          <LoginForm next={dest} />
        )}
      </section>

      <footer>
        An account here is not registration for Global Fintech Fest and gives you no ticket, badge or
        entry — register officially at{" "}
        <a href="https://www.globalfintechfest.com" target="_blank" rel="noopener noreferrer">
          globalfintechfest.com
        </a>. We send no verification email, so an account proves someone knows the password for that
        address — not that they own the inbox. Nothing here is verified.
      </footer>
    </main>
  );
}
