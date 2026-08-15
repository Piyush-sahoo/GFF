"use client";

import { useRef, useState } from "react";
import type { Citation } from "../lib/types";

type Msg =
  | { role: "user"; text: string }
  | { role: "bot"; text: string; citations?: Citation[]; error?: boolean };

/**
 * Deliberately name no company. Naming a specific partner in a starter chip
 * implies that partner is confirmed for the upcoming edition — which is exactly
 * the stale-year claim the rest of the app refuses to make. These are phrased by
 * capability instead, so they stay true whatever the dataset contains.
 */
const SUGGESTIONS = [
  "Which partners work on UPI or real-time payments?",
  "Who can help with KYC and compliance?",
  "What sessions are on Wednesday morning?",
  "Where is an exhibitor's booth?",
];

const EVENT_YEAR = 2026;

export default function Chat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsgs((m) => [...m, { role: "bot", text: data.error ?? "Something went wrong.", error: true }]);
      } else {
        setMsgs((m) => [...m, { role: "bot", text: data.answer, citations: data.citations ?? [] }]);
      }
    } catch {
      setMsgs((m) => [...m, { role: "bot", text: "Network error — please try again.", error: true }]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => {
        bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
      });
    }
  }

  return (
    <section className="section" id="ask">
      <div className="section-head">
        <h2 className="sec">Ask the concierge</h2>
        <span className="count">Grounded in partner records only</span>
      </div>

      <div className="chat">
        <div className="chat-head">
          <span className="pulse" />
          GFF Partner Concierge
        </div>

        <div className="chat-body" ref={bodyRef}>
          {msgs.length === 0 && (
            <div className="msg bot">
              <span className="who">Concierge</span>
              <div className="bubble">
                Ask me about the GFF {EVENT_YEAR} agenda, speakers, or exhibitors. I answer only from
                published GFF records and cite them.
                {"\n\n"}
                Session dates, times and halls are published, so I can give you those. GFF has not
                published a floor plan, so I cannot tell you an exhibitor&apos;s booth or stall location —
                I&apos;ll say so rather than guess.
              </div>
            </div>
          )}

          {msgs.map((m, i) =>
            m.role === "user" ? (
              <div className="msg user" key={i}>
                <span className="who">You</span>
                <div className="bubble">{m.text}</div>
              </div>
            ) : (
              <div className="msg bot" key={i}>
                <span className="who">Concierge</span>
                <div className={`bubble${m.error ? " err" : ""}`}>{m.text}</div>
                {m.citations && m.citations.length > 0 && (
                  <div className="cites">
                    {m.citations.map((c, j) =>
                      c.sourceUrl ? (
                        <a className="cite" key={j} href={c.sourceUrl} target="_blank" rel="noopener noreferrer">
                          {c.name} <span className="yr">· GFF {c.year}</span>
                        </a>
                      ) : (
                        <span className="cite" key={j}>
                          {c.name} <span className="yr">· GFF {c.year}</span>
                        </span>
                      ),
                    )}
                  </div>
                )}
              </div>
            ),
          )}

          {busy && (
            <div className="msg bot">
              <span className="who">Concierge</span>
              <span className="thinking">
                <i /> <i /> <i /> checking partner records
              </span>
            </div>
          )}
        </div>

        {msgs.length === 0 && (
          <div className="suggest">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => ask(s)}>
                {s}
              </button>
            ))}
          </div>
        )}

        <form
          className="chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about a partner, a category, or a use case…"
            aria-label="Ask the concierge"
            disabled={busy}
          />
          <button type="submit" disabled={busy || !input.trim()}>
            {busy ? "Asking…" : "Ask"}
          </button>
        </form>
      </div>
    </section>
  );
}
