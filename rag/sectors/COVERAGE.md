# GFF 2026 sector classification — coverage report

Deliverable: `sectors-2026.json` — `partner name -> {sector, subSectors[], confidence, method, evidence}`.
Taxonomy: `taxonomy.json` (24 sectors incl. `Unknown`, with a registered subSector vocabulary).

Source (read-only): `/Users/piyuzz/.ao/data/worktrees/scratch/workers/scratch-4/partners-2026.json`,
re-read after scratch-4's Apify enrichment landed (`whatTheyDo` coverage went 173 → 291 mid-run;
everything below reflects the enriched snapshot, file mtime 19:02:27, 291/319 with `whatTheyDo`).

Excluded as not-companies: **PCI logo**, **NPCI logo**, **FCC logo** (logo assets scraped as partners).
The build script hard-fails if it does not drop exactly these three. Real count: **316**.

---

## Headline

| | count | of 316 |
|---|---:|---:|
| **Classified with evidence** | **283** | 89.6% |
| **Unknown (honest)** | **33** | 10.4% |

Nothing was classified from a company name or from world knowledge. Every non-Unknown row
carries the exact source text it was classified from, in its `evidence` field.

## What the classifications rest on

| method | count | meaning |
|---|---:|---|
| `whatTheyDo+useCases` | 207 | the company's own description, corroborated by its useCases tags |
| `whatTheyDo` | 64 | the company's own description alone (no useCases on the record) |
| `tier` | 12 | partner-tier label only, used where the tier names something concrete |

| confidence | count | what it means |
|---|---:|---|
| high | 237 | the description states the business line explicitly |
| medium | 28 | directional but not explicit (e.g. "Redefining Digital Banking"), or a specific tier label |
| low | 18 | thin evidence — worth a human look before trusting the row |

The 12 tier-only rows: 11 are the `Ecosystem` partner tier (GFF's own grouping for
associations, incubators and community bodies — treated as informative but pinned to
`confidence: low` with no subSectors), plus **Getepay** (`Omni-Channel Payments Partner`).
Ten tier-only calls from my first pass were **superseded** by real descriptions once
enrichment landed (86400, ScoreMe, Transunion CIBIL, Mitigata, Digio, Protectt.ai Labs,
Ignosis, Paramotor, IDA Ireland, GLEIF) — three of those changed sector as a result,
which is a decent argument for not trusting sponsorship labels too far.

## Distribution

| sector | n | | sector | n |
|---|---:|---|---|---:|
| Payments | 40 | | Insurance & Insurtech | 5 |
| **Unknown** | **33** | | Regulator & Public Sector | 5 |
| Enterprise Software & IT Services | 26 | | Other Non-Fintech | 5 |
| AI & Automation | 24 | | Diversified Financial Services | 4 |
| Lending & Credit | 24 | | Cross-Border & FX | 4 |
| Ecosystem, Investors & Advisory | 21 | | Loyalty & Rewards | 3 |
| Customer Engagement, CRM & CPaaS | 18 | | Credit Bureau & Risk Scoring | 3 |
| Wealth & Capital Markets | 17 | | Spend & Business Finance | 2 |
| Data & Analytics | 17 | | Hardware & Devices | 1 |
| Banking Infrastructure & Core Systems | 16 | | | |
| Banking & Financial Institutions | 14 | | | |
| Identity & KYC | 11 | | | |
| RegTech & Compliance | 9 | | | |
| Cybersecurity | 8 | | | |
| Fraud Prevention & Risk | 6 | | | |

Note that 31 of the 316 land outside financial services proper — Enterprise Software,
Other Non-Fintech and much of Ecosystem — which the old `category` field flattened into
`other` alongside genuinely unclassified rows. That distinction is now explicit.

## The 33 Unknowns, and why

**13 — no evidence at all** (no `whatTheyDo`, no `useCases`, uninformative tier):
Association of Mutual Funds in India, Bank of India, Fino Payments, Identy.io,
Indian Banks Association, IppoPay, Jocata, Mufinpay, PCI / FCC, Plutos One, Safegold,
Sugary, Trackwizz.

**20 — has `whatTheyDo` text, but the text says nothing about the business.** Each of these
carries a `note` field in the JSON explaining what the text actually was, and keeps the text
in `evidence` so an auditor can disagree with me cheaply:

| partner | what the scraped text actually is |
|---|---|
| BUSINESS NEXT | generic "digital transformation" tagline |
| CCIL | site title / legal name only |
| CRED | brand copy: "financial & lifestyle experiences crafted for the creditworthy" |
| DBS Bank | brand/awards copy, no business line |
| Equifax | brand purpose statement, no business line |
| FIS | brand copy; says "fintech" but names no line |
| ITRS | "Solutions for the most demanding environments on the planet" |
| JCB International Co. Ltd. | "This is the website for JCB, Japan" |
| Mantra Softech | company name and country only |
| PehchanPe | one-line product slogan |
| Perto | generic Portuguese marketing copy |
| Qualtech Edge | product feature blurb, line not identifiable |
| Sarvdhan | literal placeholder: "Home Page Meta Description would be added here" |
| SEBI | scraped fragment of a cybersecurity FAQ page |
| ShellKode | generic engineering tagline |
| Smartping | generic efficiency tagline |
| Sutradhar | generic "technology solutions" tagline |
| Utimaco | tagline only |
| Voice India | regulator acronyms + a data-sovereignty slogan |
| Watchdata | tagline only |

### Deliberately left on the table

Six Unknowns have legal names that are self-describing — *Bank of India*, *DBS Bank*,
*Fino Payments*, *Indian Banks Association*, *Association of Mutual Funds in India*,
*CCIL / The Clearing Corporation of India Limited*. Classifying them would be reading a
name, not reading evidence, and the brief rules that out. Say the word and I'll add them
as a separate `method: "name-literal"` pass so the two kinds of claim stay distinguishable.

The same restraint is why **SEBI**, **Equifax**, **FIS**, **JCB** and **DBS Bank** are Unknown
despite being recognisable. Their scraped copy genuinely says nothing, and a sector I
"knew" rather than read is exactly the unauditable kind of wrong fact the brief warns about.

## Known soft spots

- **Getepay** rests on a sponsorship label alone. Verify before relying on it.
- **11 `Ecosystem`-tier rows** (AFN, CIBE, FinStep Asia, FinTech Armenia, Financial Technology
  Association, IIIT Bangalore, ITEL, Kathmandu Fintel, NSRCEL IIMB, SINE IIT Bombay, The Fintech
  Meetup) are grouped from GFF's own tier, not from anything they said. They are almost
  certainly associations/incubators/community bodies, but the row is a bucket, not a fact.
- **18 low-confidence rows** are the first place to spend human review time. Filter
  `confidence == "low"` in the JSON.
- **Vayana** and **Vayana Finserv** are two source records sharing identical text; both are
  classified the same way. Likely a de-duplication issue upstream, not a classification one.
- Sector edges I had to adjudicate, so you know where to disagree: payment software sold to
  banks sits in **Payments** (not Banking Infrastructure) when payments are the product;
  bank-statement/underwriting analytics sit in **Data & Analytics** (Perfios, ScoreMe, FinEye)
  while loan origination/servicing software sits in **Lending & Credit**; databases and
  devtools sit in **Enterprise Software**, not Data & Analytics.

## Reproducing / amending

```
python3 build_sectors.py      # rebuilds sectors-2026.json + coverage.json from source + decisions.py
python3 pending.py            # lists partners that gained evidence but have no decision yet
```

`decisions.py` is the hand-written table; `build_sectors.py` pulls the evidence strings
verbatim out of the source so the `evidence` field can never drift from what was classified.
It fails loudly on a partner name that doesn't exist in the source, on a subSector not
registered in `taxonomy.json`, and on any decision claiming an evidence source the source
record doesn't have. If scratch-4 enriches further, re-run `pending.py` to see exactly what
became classifiable.
