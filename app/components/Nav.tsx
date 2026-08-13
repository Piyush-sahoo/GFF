import Link from "next/link";

/** Persistent top-level nav. Mobile-first: attendees use this on a show floor. */
export default function Nav({ active }: { active?: string }) {
  const items = [
    { href: "/agenda", label: "Agenda" },
    { href: "/exhibitors", label: "Exhibitors" },
    { href: "/speakers", label: "Speakers" },
    { href: "/ask", label: "Ask" },
    { href: "/my-plan", label: "My Plan" },
    { href: "/people", label: "People" },
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
