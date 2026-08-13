"use client";

import { useMemo, useState } from "react";
import type { Partner } from "../lib/types";

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

export default function Directory({ partners }: { partners: Partner[] }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [tier, setTier] = useState<string | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(partners.map((p) => p.category).filter(Boolean) as string[])).sort(),
    [partners],
  );
  const tiers = useMemo(
    () => Array.from(new Set(partners.map((p) => p.tier).filter(Boolean) as string[])).sort(),
    [partners],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return partners.filter((p) => {
      if (cat && p.category !== cat) return false;
      if (tier && p.tier !== tier) return false;
      if (!needle) return true;
      const hay = [p.name, p.category, p.tier, p.whatTheyDo, ...p.useCases]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [partners, q, cat, tier]);

  return (
    <section className="section" id="directory">
      <div className="section-head">
        <h2 className="sec">Partner directory</h2>
        <span className="count">
          {shown.length} of {partners.length} partners
        </span>
      </div>

      <div className="controls">
        <div className="searchwrap">
          <SearchIcon />
          <input
            className="search"
            placeholder="Search partners, categories, or use cases — try “UPI”, “KYC”, “lending”"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search partners"
          />
        </div>

        {categories.length > 0 && (
          <div className="filterrow">
            <span className="filterlabel">Category</span>
            <button className="chip" data-on={cat === null} onClick={() => setCat(null)}>
              All
            </button>
            {categories.map((c) => (
              <button key={c} className="chip" data-on={cat === c} onClick={() => setCat(cat === c ? null : c)}>
                {c}
              </button>
            ))}
          </div>
        )}

        {tiers.length > 0 && (
          <div className="filterrow">
            <span className="filterlabel">Tier</span>
            <button className="chip" data-on={tier === null} onClick={() => setTier(null)}>
              All
            </button>
            {tiers.map((t) => (
              <button key={t} className="chip" data-on={tier === t} onClick={() => setTier(tier === t ? null : t)}>
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="empty">
          No partners match that search. Try a broader term, or clear the category and tier filters.
        </div>
      ) : (
        <div className="grid">
          {shown.map((p) => (
            <article className="card" key={p.slug}>
              <div className="card-top">
                <h3>{p.name}</h3>
                {p.tier && <span className="tier">{p.tier}</span>}
              </div>
              {p.category && <div className="cat">{p.category}</div>}
              {p.whatTheyDo && <p className="desc">{p.whatTheyDo}</p>}

              {p.useCases.length > 0 && (
                <div className="uc">
                  <div className="uc-h">Use cases</div>
                  <ul>
                    {p.useCases.slice(0, 4).map((u, i) => (
                      <li key={i}>{u}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="card-foot">
                <span className="booth-null">
                  {p.booth ? `Booth ${p.booth}` : "Location: floor plan not published"}
                </span>
                {p.website && (
                  <a href={p.website} target="_blank" rel="noopener noreferrer">
                    Website ↗
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
