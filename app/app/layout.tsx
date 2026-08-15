import type { Metadata } from "next";
import { DAYS, EVENT_YEAR, PARTNERS, SESSIONS, SPEAKERS, dayLabel } from "../lib/content";
import "./globals.css";

// Derived from the records we hold — never hardcoded marketing figures.
const RANGE =
  DAYS.length > 1
    ? `${dayLabel(DAYS[0]).replace(/^\w+ /, "")}–${dayLabel(DAYS[DAYS.length - 1]).replace(/^\w+ /, "")}`
    : dayLabel(DAYS[0] ?? "");

export const metadata: Metadata = {
  title: `GFF Concierge — Global Fintech Fest ${EVENT_YEAR} agenda companion`,
  description: `Browse ${SESSIONS.length} sessions, ${SPEAKERS.length} speakers and ${PARTNERS.length} exhibitors for Global Fintech Fest ${EVENT_YEAR}, ${RANGE} ${EVENT_YEAR}, Mumbai. Build a personal agenda and ask questions answered from published GFF records.`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
