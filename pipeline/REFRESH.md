# GFF 2026 refresh runbook

Re-scrapes the live GFF site, diffs it against Atlas, and updates `gff.sessions`,
`gff.speakers`, `gff.partners`. Designed to be run **the morning of each event
day** (8–11 Sep 2026), and safely as often as you like before that.

## Run it

```bash
cd pipeline   # repo root -> pipeline/

# 1. See what changed. Writes NOTHING to the database.
python3 refresh.py --dry-run

# 2. If the diff looks sane, apply it.
python3 refresh.py --apply
```

That is the whole procedure. It takes about a minute, most of it fetching pages.

**Always run `--dry-run` first on an event morning** and read the DISAPPEARED
section. Applying is safe, but a human should see what is about to change.

Exit code is `0` on success and `1` if any invariant regressed — so it can be
wired into a scheduler and will fail loudly rather than quietly corrupt data.

## Reading the output

```
SESSIONS: live=254  in-db=256  added=0  disappeared=2  changed=28  rescheduled=19  retitled=1
   - DISAPPEARED: The Rise of Intelligent Payment Ecosystems... (2026-09-10 13:00)
   ~ Retailisation of Bond Markets: startTime '13:50' -> '10:45'
   ~ Agentic AI and the Future of Financial Services: speakers added ['Rohit Arora']
```

| Line | Meaning |
| --- | --- |
| `+` | New on the live site; inserted. |
| `-  DISAPPEARED` | **Read these first.** Gone from the live agenda. Marked `status: "withdrawn"` with `withdrawnDetectedAt`; never deleted. |
| `~ ... startTime/day` | Rescheduled. Counted in `rescheduled`. |
| `~ ... speakers added/removed` | Line-up change. |

A session pulled from the agenda is the single most important thing for an
attendee, so withdrawals are always listed in full and never truncated.

Every run writes a timestamped folder under `snapshots/`:

```
snapshots/20260812T135411Z/
├── pages/{partners,speakers,agenda}.html   raw HTML as fetched
├── sessions-2026.json  speakers-2026.json  partners-2026.json
├── diff.txt                                the human-readable report above
└── diff.json                               same, machine-readable
```

Keep these. They are the audit trail: if the app shows something odd, the
snapshot proves what the site said at that moment.

## What it will not do

- **Never invents a booth.** `booth`/`boothSource` are hard-nulled at extraction
  and asserted post-run. GFF has never published partner booth numbers; a guess
  would be worse than nothing. The run fails if any appear.
- **Never resurrects the 3 CMS logo artifacts** (`PCI logo`, `NPCI logo`,
  `FCC logo`) — dropped every run and asserted absent afterwards.
- **Never re-creates the 20 deduped name variants.** Scraped names go through
  `identity-map.json`, so "ElevenLabs" folds into "Eleven Labs" as an alias
  rather than becoming a second card.
- **Never downgrades traced text.** On an existing partner, incoming data cannot
  overwrite `whatTheyDo` / `useCases` / `category` / `confidence`, so enrichment
  and its provenance survive every refresh.
- **Never deletes.** Disappearance is a soft `status: "withdrawn"`.
- **Never touches 2025.** The 2025 archive stays local, unloaded, by decision.

## Invariants checked after every run

The run prints these and exits non-zero if any fail:

- `booth` and `boothSource` non-null counts are 0
- no document missing `year`; `year` never stored as a string
- no 2026 partner citing the 2025 site
- distinct active partners equals the live count (316 today)
- no duplicate partner identities under the two-key matcher
- the 3 logo artifacts absent
- no populated `whatTheyDo` or `useCases` without a `provenance` entry
- `sessions` and `speakers` contain only year 2026

## If something breaks

| Symptom | Cause and fix |
| --- | --- |
| `no flight payload found` / `key 'rawAgendaData' not found` | GFF changed their page structure. Extraction needs updating — `gff_extract.py`. The run aborts without writing, so the DB is untouched. |
| `fetch failed ... HTTP 000` | Network/DNS. Just retry. |
| A partner count assertion fails | Usually a genuinely new partner plus a name variant. Check the diff, then add the alias to `identity-map.json` under `canonical` and re-run. |
| Many false DISAPPEARED at once | Suspect a partial page fetch rather than real withdrawals. Compare against the previous snapshot before applying. |
| `MONGODB_URI not set` | `.env` is missing or unreadable. It is gitignored by design. |

## Adding a new alias

If GFF renames a partner, or a new spelling shows up as a duplicate, add it to
`identity-map.json`:

```json
{ "canonical": { "Scraped Variant Name": "Our Canonical Name" } }
```

The scraped name is retained as a searchable alias on the surviving document.

## Files

| File | Role |
| --- | --- |
| `refresh.py` | The pipeline. Only command you need. |
| `gff_extract.py` | Fetch + parse the RSC payload into records. |
| `gff_identity.py` | Company identity: canonical names, aliases, artifacts. |
| `gff_names.py` | Person-name normalisation for the session↔speaker join. |
| `identity-map.json` | Persisted alias → canonical map and artifact list. |
| `test_gff_names.py` | `python3 test_gff_names.py` — pins the join at 345/345. |
| `load_gff.py` | The original one-shot loader. Superseded by `refresh.py`. |

## Credentials

`.env` holds `MONGODB_URI` and `APIFY_TOKEN` (0600, gitignored). Both, plus the
Mongo password, were exposed in an orchestration transcript and **should be
rotated** — see the final report.
