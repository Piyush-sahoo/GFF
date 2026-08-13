/**
 * Tokenisation and name normalisation.
 *
 * THE BUG THIS FILE EXISTS TO PREVENT
 * -----------------------------------
 * An earlier tokeniser split on whitespace only. Every one of these then failed
 * to match the partner record "Razorpay":
 *
 *     "Razorpay's booth"   -> ["razorpay's", "booth"]     no match
 *     "Razorpays"          -> ["razorpays"]               no match
 *     "razorpay?"          -> ["razorpay?"]               no match
 *     "J.P. Morgan"        -> ["j.p.", "morgan"]          no match vs "JP Morgan"
 *
 * The bot then told attendees a listed company was not listed — a confident,
 * checkable, wrong answer. So tokenisation here is deliberately aggressive:
 * fold accents, normalise unicode punctuation, strip possessives, split on
 * internal punctuation while ALSO keeping the glued form, stem plurals, and
 * drop stopwords. Both the index side and the query side go through the same
 * function, which is what makes the match symmetric.
 */

/** Unicode punctuation that arrives from scraped web copy. */
const UNICODE_FIXUPS: ReadonlyArray<readonly [RegExp, string]> = [
  [/[\u2018\u2019\u201a\u201b\u2032]/g, "'"], // curly single quotes, prime
  [/[\u201c\u201d\u201e\u201f\u2033]/g, '"'], // curly double quotes
  [/[\u2010-\u2015\u2212]/g, '-'], // hyphens, dashes, minus
  [/[\u00a0\u2007\u2009\u202f\u3000]/g, ' '], // non-breaking / thin spaces
  [/\u2026/g, '.'], // ellipsis
  [/&/g, ' and '], // ampersand -> word, so "R&D" and "R and D" agree
];

/**
 * Words that carry no retrieval signal. Includes ordinary English function
 * words plus the interrogative frame attendees type ("which", "tell me about").
 */
const STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'about', 'after', 'all', 'also', 'am', 'an', 'and', 'any', 'anyone', 'are',
  'as', 'at', 'be', 'been', 'being', 'before', 'but', 'by', 'can', 'could', 'did',
  'do', 'does', 'doing', 'for', 'from', 'get', 'give', 'going', 'had', 'has',
  'have', 'he', 'her', 'here', 'hers', 'him', 'his', 'how', 'i', 'if', 'in',
  'into', 'is', 'it', 'its', 'just', 'know', 'like', 'list', 'looking', 'me',
  'more', 'much', 'my', 'need', 'no', 'not', 'of', 'on', 'one', 'or', 'other',
  'our', 'out', 'over', 'please', 'she', 'should', 'show', 'so', 'some', 'such',
  'tell', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these',
  'they', 'this', 'those', 'to', 'up', 'us', 'want', 'was', 'we', 'were', 'what',
  'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will', 'with',
  'would', 'you', 'your', 'yes',
]);

/**
 * Corporate suffixes stripped when generating *aliases* for a company name.
 * Never stripped from the display name — only from the extra alias forms, so
 * "Dista Technology Pvt. Ltd." is also findable as "dista".
 */
const COMPANY_SUFFIXES: ReadonlySet<string> = new Set([
  'pvt', 'private', 'ltd', 'limited', 'llp', 'llc', 'inc', 'incorporated',
  'corp', 'corporation', 'co', 'company', 'plc', 'gmbh', 'sa', 'nv', 'bv',
  'holdings', 'group', 'technologies', 'technology', 'tech', 'labs', 'lab',
  'solutions', 'systems', 'services', 'software', 'ventures', 'international',
  'global', 'india', 'and',
]);

/**
 * Person-name salutations, longest-first so "hon'ble dr" is consumed before
 * "dr". Mirrors gff_names.py in the upstream data workspace; the two must agree
 * or session/speaker joins silently degrade.
 */
const SALUTATIONS: readonly string[] = [
  "hon'ble justice", "hon'ble dr", "hon'ble mr", "hon'ble ms", "hon'ble",
  'honble', 'honourable', 'honorable', 'air marshal', 'lt gen', 'maj gen',
  'justice', 'professor', 'ambassador', 'shrimati', 'advocate', 'kumari',
  'prof', 'adv', 'gen', 'col', 'capt', 'cmde', 'amb', 'smt', 'shri', 'sri',
  'miss', 'mrs', 'mx', 'sir', 'cma', 'dr', 'mr', 'ms', 'sh', 'ca', 'cs', 'kum',
].sort((a, b) => b.split(' ').length - a.split(' ').length || b.length - a.length);

const NAME_SUFFIXES: ReadonlySet<string> = new Set([
  'jr', 'sr', 'ii', 'iii', 'iv', 'phd', 'md', 'cfa', 'frm',
]);

/** Lowercase, strip accents, normalise unicode punctuation, collapse spaces. */
export function fold(input: string): string {
  let s = input.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  for (const [re, to] of UNICODE_FIXUPS) s = s.replace(re, to);
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Remove English possessives. Handles the straight and curly apostrophe, and
 * the bare plural possessive.
 *
 *   "razorpay's" -> "razorpay"   "razorpays'" -> "razorpays"   "jp's" -> "jp"
 */
export function stripPossessive(token: string): string {
  return token.replace(/['’]s$/, '').replace(/s['’]$/, 's').replace(/['’]$/, '');
}

/**
 * Conservative plural stemmer. This is what makes "Razorpays" find "Razorpay".
 * Deliberately does not touch -ss / -us / -is endings ("business", "campus",
 * "analysis") and leaves short tokens alone ("ais", "gps").
 */
export function stemPlural(token: string): string {
  if (token.length <= 3) return token;
  if (/[^aeiou]ies$/.test(token)) return token.slice(0, -3) + 'y'; // companies -> company
  if (/(ch|sh|ss|x|z)es$/.test(token)) return token.slice(0, -2); // pitches -> pitch
  if (/(ss|us|is|as|os)$/.test(token)) return token; // business, campus, analysis
  if (token.endsWith('s')) return token.slice(0, -1); // payments -> payment
  return token;
}

/**
 * Split one whitespace-delimited chunk into index terms.
 *
 * Internal punctuation produces BOTH the glued form and the parts, because
 * users type company names either way:
 *   "j.p."      -> ["jp"]
 *   "sarvam.ai" -> ["sarvamai", "sarvam", "ai"]
 *   "in-solutions" -> ["insolutions", "in", "solutions"]
 * The glued form is what lets "JP Morgan" match "J.P. Morgan".
 */
function expandChunk(chunk: string): string[] {
  const bare = stripPossessive(chunk);
  const glued = bare.replace(/[^a-z0-9]+/g, '');
  if (!glued) return [];
  const parts = bare.split(/[^a-z0-9]+/).filter(Boolean);
  // A chunk with no internal punctuation yields exactly one term.
  if (parts.length <= 1) return [glued];
  return [glued, ...parts];
}

/** Full tokenisation used by both the index and the query side. */
export function tokenize(text: string | null | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const chunk of fold(text).split(' ')) {
    if (!chunk) continue;
    for (const term of expandChunk(chunk)) {
      const stem = stemPlural(term);
      if (STOPWORDS.has(stem) || STOPWORDS.has(term)) continue;
      if (stem.length < 2 && !/^[0-9]$/.test(stem)) continue;
      out.push(stem);
    }
  }
  return out;
}

/** Tokenise without dropping stopwords — used for phrase/name matching. */
export function tokenizeRaw(text: string | null | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const chunk of fold(text).split(' ')) {
    if (!chunk) continue;
    for (const term of expandChunk(chunk)) out.push(stemPlural(term));
  }
  return out;
}

/**
 * Canonical form of an entity name: folded, punctuation flattened to single
 * spaces, plural-stemmed per word. "J.P. Morgan" and "JP Morgan" both become
 * "jp morgan"; "Razorpay's" and "Razorpays" both become "razorpay".
 */
export function normaliseName(name: string): string {
  return fold(name)
    .split(' ')
    .flatMap((chunk) => {
      const bare = stripPossessive(chunk);
      const glued = bare.replace(/[^a-z0-9]+/g, '');
      return glued ? [stemPlural(glued)] : [];
    })
    .join(' ')
    .trim();
}

/** All-punctuation-removed key: "jp morgan" -> "jpmorgan". */
export function compactName(name: string): string {
  return normaliseName(name).replace(/ /g, '');
}

/** Strip salutations and honorific suffixes from a person name, then normalise. */
export function normalisePersonName(raw: string): string {
  if (!raw) return '';
  const head = raw.includes(',') ? raw.split(',')[0] : raw;
  let s = normaliseName(head);
  let changed = true;
  while (changed && s) {
    changed = false;
    for (const sal of SALUTATIONS) {
      if (s === sal) return '';
      if (s.startsWith(sal + ' ')) {
        s = s.slice(sal.length + 1).trim();
        changed = true;
        break;
      }
    }
  }
  let words = s.split(' ').filter(Boolean);
  while (words.length > 1 && NAME_SUFFIXES.has(words[words.length - 1])) words.pop();
  return words.join(' ');
}

/**
 * Alias forms for a company name, for the exact-name lexicon.
 * "Dista Technology Pvt. Ltd." -> ["dista technology pvt ltd", "distatechnologypvtltd", "dista"]
 */
export function companyAliases(name: string): string[] {
  const canonical = normaliseName(name);
  if (!canonical) return [];
  const aliases = new Set<string>([canonical, compactName(canonical)]);
  const words = canonical.split(' ');
  // Drop trailing corporate suffixes to expose the distinctive head.
  let end = words.length;
  while (end > 1 && COMPANY_SUFFIXES.has(words[end - 1])) end -= 1;
  if (end < words.length && end > 0) {
    const head = words.slice(0, end).join(' ');
    aliases.add(head);
    aliases.add(head.replace(/ /g, ''));
  }
  return [...aliases].filter((a) => a.length >= 2);
}

/** Slugify for id generation. Stable across runs. */
export function slugify(value: string): string {
  return fold(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

export const __internal = { STOPWORDS, COMPANY_SUFFIXES, SALUTATIONS };
