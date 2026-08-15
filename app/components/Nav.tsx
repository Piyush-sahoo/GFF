import Link from "next/link";

/** Persistent top-level nav. Mobile-first: attendees use this on a show floor. */
export default function Nav({ active }: { active?: string }) {
  const items = [
    { href: "/agenda", label: "Agenda" },
    { href: "/exhibitors", label: "Exhibitors" },
    { href: "/speakers", label: "Speakers" },
    // Route stays /ask — it is deployed and linked from elsewhere. /agent
    // redirects here, so both URLs resolve and neither breaks mid-event.
    { href: "/ask", label: "AI Agent" },
    { href: "/my-plan", label: "My Plan" },
    { href: "/people", label: "People" },
    { href: "/meet", label: "Meet" },
    { href: "/profile", label: "Profile" },
  ];
  return (
    <nav className="nav">
      <Link href="/" className="nav-brand">
        GFF<span>Concierge</span>
      </Link>
      <div className="nav-links">
        {items.map((i) => (
          <Link key={i.href} href={i.href} data-on={active === i.label} className="nav-link">
            {i.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
