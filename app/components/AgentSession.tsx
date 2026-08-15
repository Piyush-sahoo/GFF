"use client";

import { useEffect, useRef, useState } from "react";
import CallMe from "./CallMe";
import type { ConversationTurn } from "../lib/types";

/**
 * ONE conversation, ONE plan, side by side.
 *
 * /ask used to be two disconnected panels — a match form that forgot you, and a
 * chat box that could not change anything. This is one session instead: it
 * remembers previous turns, and every turn edits the same persistent plan, which
 * is visible next to the conversation as it changes.
 *
 * Everything on the right is resolved SERVER-SIDE from published records by id.
 * This component never renders a title the model produced, and it never imports
 * the dataset — which would ship ~1MB of JSON to the browser as a bonus harm.
 */

type PlanItem = {
  id: string;
  kind: "session" | "person" | "partner";
  label: string;
  detail: string;
  href: string;
  day: string | null;
  why: string;
  source: "agent" | "manual";
};

type PlanView = {
  objective: string | null;
  sessions: PlanItem[];
  people: PlanItem[];
  partners: PlanItem[];
  updatedAt: string | null;
  unresolved: string[];
};

const EMPTY: PlanView = {
  objective: null,
  sessions: [],
  people: [],
  partners: [],
  updatedAt: null,
  unresolved: [],
};

/** A record the agent talked about without adding it. Resolved server-side. */
type Reference = { id: string; kind: string; label: string; detail: string; href: string };

/**
 * `references` is display-only and deliberately not persisted: W1 owns
 * ConversationTurn and it has no field for them. Replayed history therefore
 * shows the prose without the chips, which is a cosmetic loss, not a factual
 * one — the reply text still names what it discussed.
 */
type Msg = ConversationTurn & { error?: boolean; references?: Reference[] };

/**
 * Deliberately a mix: a question, a people ask, a scheduling ask, and an open
 * one. The first thing someone sees should show this is a conversation, not a
 * form that only builds schedules.
 */
const OPENERS = [
  "What's on about UPI and real-time payments?",
  "We're raising a Series A — who should I be in the room with?",
  "I only have Day 2. Build me a day that's worth the trip.",
  "What's actually worth my time at this year's festival?",
];

const DAY_NAME: Record<string, string> = {
  "2026-09-09": "Day 1 · Wed 9 Sep",
  "2026-09-10": "Day 2 · Thu 10 Sep",
  "2026-09-11": "Day 3 · Fri 11 Sep",
};

export default function AgentSession() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [plan, setPlan] = useState<PlanView>(EMPTY);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Replay the stored conversation and plan, so a returning attendee walks back
  // into the session they left rather than a blank box.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch("/api/agent");
        const data = await res.json();
        if (!live) return;
        if (!res.ok) {
          setBlocked(data.error ?? "The agent is unavailable.");
        } else {
          setMsgs(data.turns ?? []);
          setPlan(data.planView ?? EMPTY);
          setDegraded(data.enabled === false);
        }
      } catch {
        if (live) setBlocked("Couldn't load your session — check your connection and reload.");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  function scrollDown() {
    requestAnimationFrame(() => {
      bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
    });
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    const at = new Date().toISOString();
    setMsgs((m) => [...m, { role: "user", text: message, at }]);
    setBusy(true);
    scrollDown();
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsgs((m) => [...m, { role: "agent", text: data.error ?? "Something went wrong.", at, error: true }]);
      } else {
        setMsgs((m) => [
          ...m,
          { role: "agent", text: data.reply, at, ops: data.ops, references: data.references ?? [] },
        ]);
        setPlan(data.planView ?? EMPTY);
        if (data.degraded) setDegraded(true);
      }
    } catch {
      setMsgs((m) => [...m, { role: "agent", text: "Network error — nothing was changed.", at, error: true }]);
    } finally {
      setBusy(false);
      scrollDown();
    }
  }

  const countsByDay: Record<string, number> = {};
  for (const s of plan.sessions) if (s.day) countsByDay[s.day] = (countsByDay[s.day] ?? 0) + 1;

  const total = plan.sessions.length + plan.people.length + plan.partners.length;

  if (loading) {
    return (
      <div className="agent-shell">
        <p className="agent-loading">Loading your session…</p>
      </div>
    );
  }

  if (blocked) {
    return (
      <div className="agent-shell">
        <div className="agent-blocked">
          <p>{blocked}</p>
          <p className="agent-blocked-cta">
            <a href="/login">Sign in</a> or <a href="/register">create an account</a> — your plan and this
            conversation are saved to it, so they survive closing the tab.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="agent-shell">
      {/* ---------------- conversation ---------------- */}
      <div className="agent-chat">
        <div className="agent-chat-head">
          <span className="pulse" />
          GFF planning agent
          {degraded && <span className="agent-degraded">offline matcher</span>}
        </div>

        <div className="agent-body" ref={bodyRef}>
          {msgs.length === 0 && (
            <div className="msg bot">
              <span className="who">Agent</span>
              <div className="bubble">
                Ask me anything about GFF — what&apos;s on, who&apos;s speaking, who&apos;s exhibiting. I
                know the whole programme.
                {"\n\n"}
                I can also build your schedule when you want one, work out who&apos;s worth meeting and
                which session gets you near them, or just talk through what you want out of the three
                days. I remember this conversation, so you can say &ldquo;drop the Thursday morning
                one&rdquo; later and I&apos;ll know what you mean.
                {"\n\n"}
                I only change your plan when you ask me to.
              </div>
            </div>
          )}

          {msgs.map((m, i) => {
            const changed = (m.ops?.add?.length ?? 0) + (m.ops?.remove?.length ?? 0);
            return m.role === "user" ? (
              <div className="msg user" key={i}>
                <span className="who">You</span>
                <div className="bubble">{m.text}</div>
              </div>
            ) : (
              <div className="msg bot" key={i}>
                <span className="who">Agent</span>
                <div className={`bubble${m.error ? " err" : ""}`}>{m.text}</div>
                {m.references && m.references.length > 0 && (
                  <div className="cites">
                    {m.references.map((r) => (
                      <a className="cite" key={r.id} href={r.href}>
                        {r.label}
                        {r.detail && <span className="yr"> · {r.detail}</span>}
                      </a>
                    ))}
                  </div>
                )}
                {changed > 0 && (
                  <div className="agent-ops">
                    {(m.ops?.add?.length ?? 0) > 0 && <span className="op add">+{m.ops!.add.length} added</span>}
                    {(m.ops?.remove?.length ?? 0) > 0 && (
                      <span className="op rm">−{m.ops!.remove.length} removed</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {busy && (
            <div className="msg bot">
              <span className="who">Agent</span>
              <span className="thinking">
                <i /> <i /> <i /> reading the catalogue
              </span>
            </div>
          )}
        </div>

        {msgs.length === 0 && (
          <div className="suggest">
            {OPENERS.map((s) => (
              <button key={s} onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}

        <form
          className="chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="What are you trying to get out of GFF?"
            aria-label="Message the planning agent"
            disabled={busy}
          />
          <button type="submit" disabled={busy || !input.trim()}>
            {busy ? "Thinking…" : "Send"}
          </button>
        </form>
      </div>

      {/* ---------------- the plan ---------------- */}
      <aside className="agent-plan">
        <div className="agent-plan-head">
          <span>Your plan</span>
          <span className="count">{total === 0 ? "empty" : `${total} item${total === 1 ? "" : "s"}`}</span>
        </div>

        {plan.objective && <p className="agent-objective">{plan.objective}</p>}

        {total === 0 && (
          <p className="agent-plan-empty">
            Nothing yet. The plan fills in as we talk, and it&apos;s the same plan the Save buttons on the
            agenda write to — nothing here is a second copy.
          </p>
        )}

        {plan.sessions.length > 0 && (
          <section className="agent-group">
            <h4>Sessions</h4>
            {Object.keys(DAY_NAME)
              .filter((d) => plan.sessions.some((s) => s.day === d))
              .map((d) => (
                <div key={d} className="agent-day">
                  <div className="agent-day-name">{DAY_NAME[d]}</div>
                  {plan.sessions
                    .filter((s) => s.day === d)
                    .map((s) => (
                      <PlanRow key={s.id} item={s} />
                    ))}
                </div>
              ))}
          </section>
        )}

        {plan.people.length > 0 && (
          <section className="agent-group">
            <h4>People worth meeting</h4>
            {plan.people.map((p) => (
              <PlanRow key={p.id} item={p} />
            ))}
          </section>
        )}

        {plan.partners.length > 0 && (
          <section className="agent-group">
            <h4>Exhibitors worth finding</h4>
            {plan.partners.map((p) => (
              <PlanRow key={p.id} item={p} />
            ))}
            <p className="agent-nofloor">
              GFF has published no floor plan for 2026, so there are no stand locations to give — only who is
              exhibiting.
            </p>
          </section>
        )}

        {plan.unresolved.length > 0 && (
          <p className="agent-nofloor">
            {plan.unresolved.length} saved item{plan.unresolved.length === 1 ? "" : "s"} no longer match a
            published record and {plan.unresolved.length === 1 ? "is" : "are"} not shown.
          </p>
        )}

        <CallMe countsByDay={countsByDay} />
      </aside>
    </div>
  );
}

function PlanRow({ item }: { item: PlanItem }) {
  return (
    <div className="agent-item">
      <a className="agent-item-label" href={item.href}>
        {item.label}
      </a>
      {item.detail && <div className="agent-item-detail">{item.detail}</div>}
      {item.why && <div className="agent-item-why">{item.why}</div>}
      {item.source === "manual" && <span className="agent-item-src">you added this</span>}
    </div>
  );
}
