# GFF 2026 RAG corpus

`corpus.jsonl` — 1,059 retrievable chunks for the attendee chatbot.
Rebuild with `python3 build_corpus.py`, then **always** `python3 verify_corpus.py`.

## Files

| file | what |
|---|---|
| `corpus.jsonl` | the deliverable, one JSON object per chunk |
| `build_corpus.py` | builder; imports `gff_names.py` from scratch-4 (not reimplemented) |
| `verify_corpus.py` | asserts the four hard rules, exits non-zero on violation |
| `corpus-report.json` | machine-readable build report |
| `snapshot/` | frozen copy of the three 2026 source files + `CHECKSUMS.txt` |

Source data is read from `snapshot/`, not live from scratch-4: that worker was
concurrently enriching `partners-2026.json` via Apify (`whatTheyDo` went 173 →
291 mid-build), which makes a live read unreproducible. Re-copy the three files
to pick up newer enrichment, then rebuild and re-verify.

## Chunk shape

```json
{"id":"session:A0941","type":"session","title":"...","text":"...","metadata":{...}}
```

One chunk per record. Nothing split: the longest body in this data is a
178-word bio, under the 220-word split threshold, so the sentence-aligned
splitter in `build_corpus.py` never fired. It stays in for future dumps and the
report says how often it triggered.

Chunk text is a factual header (built only from source fields) plus the verbatim
source prose. Records with no prose get the header alone — 5–15 words, not padded.

### Metadata

- **session** — `agendaCode, day, dayNumber, startTime, endTime, hall, format, track, topics, isClosedDoor, accessType, attendable, speakerNames, speakerNameKeys, hostNames, speakerCount, hasDescription`
- **speaker** — `name, nameKey, title, org, country, sessionCodes, sessions[], closedDoorSessionCodes, speaksInClosedDoorSession, linkedin, hasBio`
- **partner** — `name, slug, tier, group, sector, website, useCases, hasDescription, descriptionMethod, sourceConfidence`

`group` is a coarse tier family (organiser / headline / sponsor / category-partner
/ exhibitor / ecosystem / supporter) derived from the tier string, because the
47 raw tier names are mostly one-offs ("Hydration Partner"). `sector` is the
source `category` field verbatim; scratch-6 is producing a better taxonomy.

## The four hard rules, and where they are enforced

1. **No fabricated text.** `verify_corpus.py` re-reads the snapshot and asserts
   every chunk body appears verbatim in its source field, and that dropped text
   never reappears.
2. **No partner booth/stall data.** Never read from the source (`booth` is null
   for all 319 records anyway). One Apify-scraped blurb (Netwin) contained
   `Booth No. JC9` plus GFF-2025 copy; the whole description is rejected rather
   than partially cleaned. Halls are asserted to appear on **session chunks only** —
   they were initially leaking onto speaker chunks through the session
   cross-reference and were removed. Note `CRED — Beer Booth Partner` is a
   published sponsorship *tier name*, not a location.
3. **2026 only.** The 2025 files in the source dir are never opened.
4. **Closed-door sessions.** 34 sessions carry `isClosedDoor: true`,
   `attendable: false`, `accessType: invite-only`, and an explicit line in the
   chunk text: *"NOT open to general attendees and must not be recommended as
   attendable."* Speakers appearing in one carry `speaksInClosedDoorSession`.

## Known retrieval-quality limits

See the build report. The dominant one: 126 of 487 speaker bios and 5 of 256
session descriptions were not prose in the source — they are unresolved React
Server Component references (`$4a`, `$2f`) captured by the scraper. They are
dropped, so those records retrieve on name/org/session facts only.
Re-scraping bios would be the single highest-value fix.
