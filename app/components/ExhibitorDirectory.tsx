"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { Partner } from "../lib/types";

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  other: "Other",
  infra: "Infrastructure",
  ai: "AI",
  payments: "Payments",
  banking: "Banking",
  lending: "Lending",
  wealthtech: "Wealthtech",
  regtech: "Regtech",
  crypto: "Crypto",
  insurtech: "Insurtech",
};

function label(c: string) {
  return CATEGORY_LABELS[c] ?? c;
}

// There are 45 tier values, so the group filter is a dropdown rather than a chip
// row — as chips it pushed the first exhibitor eight rows down the page. Styled
// inline from the same tokens as `.chip` / `input.search` in globals.css.
const GROUP_SELECT: CSSProperties = {
  appearance: "none",
  WebkitAppearance: "none",
  padding: "7px 32px 7px 13px",
  borderRadius: 999,
  border: "1px solid var(--line)",
  background:
    "var(--panel) url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236c7488' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\") no-repeat right 12px center",
  color: "var(--text)",
  fontSize: 13,
  fontFamily: "inherit",
  cursor: "pointer",
  maxWidth: "100%",
  // Keeps the OS-rendered option list dark instead of flipping to a white popup.
  colorScheme: "dark",
};

export default function ExhibitorDirectory({ partners }: { partners: Partner[] }) {
  const [q, setQ] = useState("");
  const [tier, setTier] = useState<string | null>(null);
  const [cat, setCat] = useState<string | null>(null);

  const tiers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of partners) if (p.tier) counts.set(p.tier, (counts.get(p.tier) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [partners]);

  const cats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of partners) if (p.category) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [partners]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return partners.filter((p) => {
      if (tier && p.tier !== tier) return false;
      if (cat && p.category !== cat) return false;
      if (!needle) return true;
      return [p.name, p.category, p.tier, p.whatTheyDo, ...(p.useCases || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [partners, q, tier, cat]);

  const describedShown = shown.filter((p) => p.whatTheyDo && p.whatTheyDo.trim()).length;

  return (
    <>
      <div className="controls">
        <div className="searchwrap">
          <SearchIcon />
          <input
            className="search"
            placeholder="Search exhibitors and partners by name, sector, or what they do"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search exhibitors"
          />
        </div>

        <div className="filterrow">
          <span className="filterlabel">Group</span>
          <select
            style={GROUP_SELECT}
            value={tier ?? ""}
            onChange={(e) => setTier(e.target.value || null)}
            aria-label="Filter by group"
          >
            <option value="">All</option>
            {tiers.map(([t, n]) => (
              <option key={t} value={t}>
                {t} ({n})
              </option>
            ))}
          </select>
        </div>

        <div className="filterrow">
          <span className="filterlabel">Sector</span>
          <button className="chip" data-on={cat === null} onClick={() => setCat(null)}>
            All
          </button>
          {cats.map(([c, n]) => (
            <button key={c} className="chip" data-on={cat === c} onClick={() => setCat(cat === c ? null : c)}>
              {label(c)} <span className="chip-n">{n}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="coverage">
        Showing <strong>{shown.length}</strong> of {partners.length}. Descriptions are available for{" "}
        <strong>{describedShown}</strong> of these {shown.length} — the rest are still being compiled and are
        shown without one rather than filled in with a guess.
      </p>

      {shown.length === 0 ? (
        <div className="empty">No exhibitors match that search. Try a broader term or clear the filters.</div>
      ) : (
        <div className="exgrid">
          {shown.map((p) => (
            <article className="excard" key={p.slug}>
              <div className="exlogo">
                {p.logoUrl ? (
                  // Plain <img>: logos are remote S3 assets and this keeps the page
                  // fully static with no image-optimisation runtime in the request path.
                  <img src={p.logoUrl} alt="" loading="lazy" decoding="async" />
                ) : (
                  <span className="exlogo-fallback">{p.name.slice(0, 2).toUpperCase()}</span>
                )}
              </div>

              <div className="exbody">
                <div className="exhead">
                  <h3>{p.name}</h3>
                  {p.tier && <span className="tier">{p.tier}</span>}
                </div>

                {p.category && <div className="cat">{label(p.category)}</div>}

                {p.whatTheyDo && p.whatTheyDo.trim() ? (
                  <p className="desc">{p.whatTheyDo}</p>
                ) : (
                  <p className="desc missing">Description not yet available.</p>
                )}

                {p.useCases && p.useCases.length > 0 && (
                  <ul className="exuc">
                    {p.useCases.slice(0, 3).map((u, i) => (
                      <li key={i}>{u}</li>
                    ))}
                  </ul>
                )}

                <div className="exfoot">
                  {p.website ? (
                    <a href={p.website} target="_blank" rel="noopener noreferrer">
                      Website ↗
                    </a>
                  ) : (
                    <span className="exfoot-dim">No website listed</span>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
