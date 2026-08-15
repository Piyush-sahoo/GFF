"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import PersonCardStyle from "../../components/PersonCardStyle";

export type DirectoryPerson = {
  slug: string;
  name: string;
  role: string | null;
  org: string | null;
  lookingFor: string | null;
  interests: string[];
  isDemo: boolean;
  /** Opted in a second time, to sharing the plan itself. */
  hasSharedPlan: boolean;
};

const MAX_PEOPLE = 4;

export default function PeopleDirectory({ people }: { people: DirectoryPerson[] }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState("");

  const shareable = useMemo(() => people.filter((p) => p.hasSharedPlan).length, [people]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return people;
    return people.filter((p) =>
      [p.name, p.role, p.org, p.lookingFor, ...p.interests]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [people, q]);

  function toggle(slug: string) {
    setPicked((prev) =>
      prev.includes(slug)
        ? prev.filter((s) => s !== slug)
        : prev.length >= MAX_PEOPLE
          ? prev
          : [...prev, slug],
    );
  }

  return (
    <>
      <PersonCardStyle />
      <div className="controls">
        <div className="searchwrap">
          <input
            className="search"
            placeholder="Search by name, role, organisation or interest"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search people"
          />
        </div>
      </div>

      <p className="coverage">
        <strong>{shareable}</strong> of {people.length} listed{" "}
        {shareable === 1 ? "person has" : "people have"} also shared their plan, so you can look inside
        it and find a time to meet. The rest are listed only — being in this directory is not consent to
        publish where you will be.
      </p>

      {picked.length > 0 && (
        <p className="coverage">
          <strong>{picked.length} selected.</strong>{" "}
          {picked.length < 2 ? (
            <>Pick at least one more.</>
          ) : (
            <Link className="mlink" href={`/meet?with=${picked.join(",")}`}>
              Find a meeting point for these {picked.length} →
            </Link>
          )}{" "}
          <button className="clearfilters" onClick={() => setPicked([])}>clear</button>
        </p>
      )}

      <div className="spgrid">
        {shown.map((p) => {
          const on = picked.includes(p.slug);
          return (
            <article className="spcard" key={p.slug} data-on={on}>
              <span className="sphead placeholder">{(p.name || "?").slice(0, 1).toUpperCase()}</span>
              <div className="spbody">
                <h3 className="pname">
                  <Link className="pname-link" href={`/people/${p.slug}`}>{p.name}</Link>
                  {p.isDemo && <span className="pname-badge">Demo data</span>}
                </h3>
                {(p.role || p.org) && (
                  <div className="sprole">{[p.role, p.org].filter(Boolean).join(" · ")}</div>
                )}
                {p.lookingFor && <p className="spbio">{p.lookingFor}</p>}
                {p.interests.length > 0 && (
                  <div className="spfoot">
                    {p.interests.slice(0, 4).map((i) => <span key={i}>{i}</span>)}
                  </div>
                )}

                {p.hasSharedPlan ? (
                  <div className="objrow" style={{ marginTop: 10 }}>
                    <label className="consent" style={{ margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!on && picked.length >= MAX_PEOPLE}
                        onChange={() => toggle(p.slug)}
                      />
                      <span>Meet with</span>
                    </label>
                    <Link className="mlink" href={`/meet?with=${p.slug}`}>view plan →</Link>
                  </div>
                ) : (
                  <p className="mthin" style={{ marginTop: 10 }}>
                    Has not shared a plan, so there is nothing to compare.
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {shown.length === 0 && <div className="empty">Nobody matches that search.</div>}
    </>
  );
}
