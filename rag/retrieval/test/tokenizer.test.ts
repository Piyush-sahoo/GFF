/**
 * Tokeniser regression tests.
 *
 * These pin the exact bug that shipped once already: a whitespace-only splitter
 * meant "Razorpay's" and "Razorpays" did not match the partner "Razorpay", and
 * the bot told an attendee that a listed company was not listed.
 */

import { describe, expect, it } from 'vitest';
import {
  companyAliases,
  normaliseName,
  normalisePersonName,
  stemPlural,
  stripPossessive,
  tokenize,
} from '../src/text';

describe('possessives and punctuation (the shipped bug)', () => {
  it('reduces every surface form of Razorpay to the same token', () => {
    const forms = [
      'Razorpay',
      "Razorpay's",
      'Razorpay’s', // curly apostrophe, which is what browsers produce
      'Razorpays',
      'razorpay?',
      'RAZORPAY!',
      '(Razorpay)',
      'Razorpay,',
      '"Razorpay"',
    ];
    for (const form of forms) {
      expect(tokenize(form), `tokenising ${form}`).toEqual(['razorpay']);
    }
  });

  it('normalises every surface form to the same name key', () => {
    const forms = ['Razorpay', "Razorpay's", 'Razorpays', 'razorpay.'];
    const keys = new Set(forms.map(normaliseName));
    expect(keys).toEqual(new Set(['razorpay']));
  });

  it('strips possessives, straight and curly', () => {
    expect(stripPossessive("razorpay's")).toBe('razorpay');
    expect(stripPossessive('razorpay’s')).toBe('razorpay');
    expect(stripPossessive("razorpays'")).toBe('razorpays');
  });

  it('stems plurals without mangling -ss, -us or -is words', () => {
    expect(stemPlural('razorpays')).toBe('razorpay');
    expect(stemPlural('payments')).toBe('payment');
    expect(stemPlural('companies')).toBe('company');
    expect(stemPlural('business')).toBe('business');
    expect(stemPlural('campus')).toBe('campus');
    expect(stemPlural('analysis')).toBe('analysis');
  });

  it('makes dotted company names reachable both ways', () => {
    // "J.P. Morgan" and "JP Morgan" must produce the same name key.
    expect(normaliseName('J.P. Morgan')).toBe(normaliseName('JP Morgan'));
    // and the glued form is emitted so "jpmorgan" typed as one word matches.
    expect(tokenize('J.P. Morgan')).toContain('jp');
    expect(tokenize('Sarvam.ai')).toEqual(expect.arrayContaining(['sarvamai', 'sarvam', 'ai']));
  });

  it('folds accents and unicode punctuation', () => {
    expect(tokenize('Café')).toEqual(['cafe']);
    expect(tokenize('cross–border')).toEqual(expect.arrayContaining(['crossborder', 'cross', 'border']));
  });

  it('drops stopwords', () => {
    expect(tokenize('which of the sessions are on payments')).toEqual(['session', 'payment']);
  });
});

describe('word-boundary safety', () => {
  it('never derives "voice" from "invoice"', () => {
    expect(tokenize('invoice')).toEqual(['invoice']);
    expect(tokenize('invoice financing')).not.toContain('voice');
    expect(tokenize('Invoicely')).not.toContain('voice');
    expect(normaliseName('invoice')).not.toBe('voice');
  });

  it('does not derive "agent" from "agenda"', () => {
    expect(tokenize('agenda')).toEqual(['agenda']);
    expect('agenda'.startsWith('agent')).toBe(false);
  });
});

describe('person names', () => {
  it('strips salutations, including stacked ones', () => {
    expect(normalisePersonName('Smt. Nirmala Sitharaman')).toBe('nirmala sitharaman');
    expect(normalisePersonName('CA Manish Hingar')).toBe('manish hingar');
    expect(normalisePersonName("Hon'ble Dr. Rajiv Kumar")).toBe('rajiv kumar');
    expect(normalisePersonName('Mr. Ankit Durga')).toBe('ankit durga');
  });

  it('keeps only the person from an agenda-style string', () => {
    expect(normalisePersonName('Arif Khan, Chief Innovation Officer, Razorpay Software'))
      .toBe('arif khan');
  });
});

describe('company aliases', () => {
  it('exposes the distinctive head of a suffixed company name', () => {
    expect(companyAliases('Dista Technology Pvt. Ltd.')).toContain('dista');
    expect(companyAliases('BSE Limited.')).toContain('bse');
  });

  it('produces a glued alias so punctuation-free typing matches', () => {
    expect(companyAliases('J.P. Morgan')).toContain('jpmorgan');
  });
});
