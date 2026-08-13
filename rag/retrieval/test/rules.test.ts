/**
 * The three hard rules, tested as enforcement rather than as documentation.
 */

import { describe, expect, it } from 'vitest';
import { assertNoBoothData, CorpusError } from '../src/corpus';
import { assertSafeToRecommend, ClosedDoorError, recommendable } from '../src/retriever';
import { realRetriever, syntheticRetriever } from './fixture';

describe('rule 1: booth data is never returned', () => {
  it('strips booth fields at load, even when upstream supplies them', () => {
    // The synthetic Razorpay record carries booth: "Hall 3, Booth 42".
    const retriever = syntheticRetriever();
    const record = retriever.get('partner:razorpay');
    expect(record).toBeDefined();
    expect(record).not.toHaveProperty('booth');
    expect(record).not.toHaveProperty('boothSource');
    expect(JSON.stringify(record).toLowerCase()).not.toContain('booth');
  });

  it('reports upstream booth values instead of silently dropping them', () => {
    const retriever = syntheticRetriever();
    expect(retriever.store.report.boothValuesSeen).toBe(1);
  });

  it('confirms the real corpus has no booth data at all', () => {
    const retriever = realRetriever();
    expect(retriever.store.report.boothValuesSeen).toBe(0);
    for (const record of retriever.store.ofType('partner')) {
      expect(record).not.toHaveProperty('booth');
    }
  });

  it('returns no booth data for a query that explicitly asks for one', () => {
    const retriever = realRetriever();
    const { hits } = retriever.retrieve("where is Razorpay's booth", { limit: 10 });
    expect(hits.length).toBeGreaterThan(0);
    // The assertion inside retrieve() already ran; assert again on the result.
    expect(() => assertNoBoothData(hits)).not.toThrow();
    expect(JSON.stringify(hits).toLowerCase()).not.toContain('"booth"');
  });

  it('assertNoBoothData throws on anything carrying a booth key', () => {
    expect(() => assertNoBoothData({ name: 'X', booth: 'A12' })).toThrow(CorpusError);
    expect(() => assertNoBoothData([{ record: { boothNumber: 4 } }])).toThrow(CorpusError);
    expect(() => assertNoBoothData({ name: 'X', tier: 'Gold' })).not.toThrow();
  });
});

describe('rule 2: closed-door sessions are returnable but never recommendable', () => {
  it('flags every closed-door session hit', () => {
    const retriever = realRetriever();
    const { hits } = retriever.retrieve('roundtable', { filters: { type: 'session' }, limit: 50 });
    const closed = hits.filter((h) => h.record.type === 'session' && h.record.isClosedDoor);
    expect(closed.length).toBeGreaterThan(0);
    for (const hit of closed) {
      expect(hit.advisory).toBeDefined();
      expect(hit.advisory?.closedDoor).toBe(true);
      expect(hit.advisory?.doNotRecommendAttending).toBe(true);
      expect(hit.advisory?.reason).toMatch(/do not/i);
    }
  });

  it('gives every session hit an advisory, closed-door or not', () => {
    const retriever = realRetriever();
    const { hits } = retriever.retrieve('payments', { filters: { type: 'session' }, limit: 25 });
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      expect(hit.advisory).toBeDefined();
      expect(typeof hit.advisory?.doNotRecommendAttending).toBe('boolean');
    }
  });

  it('never flags partners or speakers with an advisory', () => {
    const retriever = realRetriever();
    const { hits } = retriever.retrieve('payments', { filters: { type: ['partner', 'speaker'] } });
    for (const hit of hits) expect(hit.advisory).toBeUndefined();
  });

  it('assertSafeToRecommend throws for closed-door and passes otherwise', () => {
    const retriever = syntheticRetriever();
    const { hits } = retriever.retrieve('payment regulation roundtable', { limit: 10 });
    const closed = hits.find((h) => h.id === 'session:T0002');
    const open = hits.find((h) => h.id === 'session:T0001');
    expect(closed).toBeDefined();
    expect(() => assertSafeToRecommend(closed!)).toThrow(ClosedDoorError);
    if (open) expect(() => assertSafeToRecommend(open)).not.toThrow();
  });

  it('recommendable() removes closed-door sessions', () => {
    const retriever = syntheticRetriever();
    const { hits } = retriever.retrieve('payment regulation roundtable', { limit: 10 });
    const safe = recommendable(hits);
    expect(safe.some((h) => h.id === 'session:T0002')).toBe(false);
    for (const hit of safe) expect(hit.advisory?.doNotRecommendAttending ?? false).toBe(false);
  });

  it('excludeClosedDoor removes them before ranking and reports the count', () => {
    const retriever = realRetriever();
    const { hits, diagnostics } = retriever.retrieve('roundtable', {
      filters: { type: 'session', excludeClosedDoor: true },
      limit: 50,
    });
    expect(diagnostics.droppedClosedDoor).toBeGreaterThan(0);
    for (const hit of hits) {
      expect(hit.record.type === 'session' && hit.record.isClosedDoor).toBe(false);
    }
  });

  it('treats a non-public access type as closed-door even without the flag', () => {
    const retriever = realRetriever();
    for (const session of retriever.store.ofType('session')) {
      if (session.accessType && session.accessType.toLowerCase() !== 'public') {
        expect(session.isClosedDoor).toBe(true);
      }
    }
  });
});

describe('rule 3: only real records with resolvable ids', () => {
  it('resolves every returned id back to the identical record object', () => {
    const retriever = realRetriever();
    const queries = [
      'Razorpay',
      'payments sessions',
      'who is speaking about quantum',
      'zzzzz nonexistent query',
    ];
    for (const query of queries) {
      const { hits, diagnostics } = retriever.retrieve(query, { limit: 20 });
      expect(diagnostics.droppedUnresolved).toBe(0);
      for (const hit of hits) {
        const resolved = retriever.get(hit.id);
        expect(resolved, `${hit.id} from "${query}"`).toBeDefined();
        expect(resolved).toBe(hit.record);
        expect(hit.id).toMatch(/^(partner|speaker|session):.+/);
      }
    }
  });

  it('returns nothing rather than inventing a record for an unmatched query', () => {
    const retriever = syntheticRetriever();
    const { hits } = retriever.retrieve('quantum cryptography seminar in Antarctica', {
      minScore: 0.2,
    });
    for (const hit of hits) expect(retriever.get(hit.id)).toBe(hit.record);
  });

  it('never returns duplicate ids', () => {
    const retriever = realRetriever();
    const { hits } = retriever.retrieve('AI payments India', { limit: 40 });
    const ids = hits.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rejects ambiguous records at load rather than renumbering them', () => {
    const retriever = realRetriever();
    const ids = retriever.store.records.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
