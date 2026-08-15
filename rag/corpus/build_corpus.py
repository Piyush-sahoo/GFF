#!/usr/bin/env python3
"""Build the GFF 2026 RAG corpus (corpus.jsonl) from the 2026 source dumps.

Rules enforced here (see also the task brief):
  1. Never fabricate text. Every sentence in a chunk is either a verbatim
     source field or a factual framing built from source fields. A record
     with no prose gets a short chunk, never padded filler.
  2. Partner booth / stall data is NEVER emitted. GFF has not published it;
     the `booth` field is null for all 319 records and is not read here.
     Session halls ARE published and appear on session chunks only.
  3. 2026 files only. The 2025 dumps in the source dir are not opened.
  4. isClosedDoor is carried into metadata (and stated in the chunk text) so
     downstream never recommends attending an invite-only session.

Name normalisation is imported from gff_names.py (tested, in the source dir).
"""
from __future__ import annotations

import json
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

# gff_names.py is imported live from the source dir (it is the tested module).
# The DATA, however, is read from a frozen snapshot in this workspace: scratch-4
# is concurrently enriching partners-2026.json via Apify (whatTheyDo went
# 173 -> 291 mid-build), so reading it live makes the corpus unreproducible and
# the counts unstable. `make snapshot` = re-copy the three 2026 files.
SRC = Path(os.environ.get(
    "GFF_PIPELINE", Path(__file__).resolve().parents[2] / "pipeline"
))
DATA = Path(__file__).resolve().parent / "snapshot"
OUT = Path(__file__).resolve().parent / "corpus.jsonl"
REPORT = Path(__file__).resolve().parent / "corpus-report.json"

sys.path.insert(0, str(SRC))
from gff_names import join_key, split_agenda_speaker  # noqa: E402

EVENT = "Global Fintech Fest 2026"

# Records whose "partner" entry is a logo asset, not a company. Dropped.
NON_COMPANY_SLUGS = {"pci-logo", "npci-logo", "fcc-logo"}

# A chunk body longer than this is split on sentence boundaries. The 2026 data
# tops out at 178-word bios / 130-word descriptions, so this is a guard rail
# for future dumps rather than something that fires today -- the report says
# exactly how often it fired.
MAX_BODY_WORDS = 220
OVERLAP_SENTENCES = 1

DAY_NUMBER = {"2026-09-09": 1, "2026-09-10": 2, "2026-09-11": 3}

# tier -> coarse group, for filtering ("show me the gold sponsors" vs
# "show me the exhibitors"). Derived from the tier string only.
SPONSOR_TIERS = {
    "Diamond Partner", "Platinum Partner", "Gold Partner",
    "Silver Partner", "Bronze Partner", "Associate Partner",
}
HEADLINE_TIERS = {"Brought To You By", "Co-Powered By"}

_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9‘“(])")

# Some partner `whatTheyDo` values are raw scraped page copy that carries a
# booth number and prior-year event boilerplate (e.g. netwin: "Global Fintech
# Fest 2025 ... Booth No. JC9 ... Read more"). Emitting that would break the
# no-booth rule and inject 2025 facts, and the blob has no clean sentence
# boundary to cut on -- so the whole description is rejected and the partner is
# reported as text-poor rather than partially cleaned into something misleading.
_PARTNER_DESC_REJECT = [
    ("booth/stall location", re.compile(r"\bbooth\s*(no\.?|number|#)|\bstall\s*(no\.?|number|#)", re.I)),
    ("prior-year event copy", re.compile(r"global\s+fintech\s+fest\s+20(1\d|2[0-5])", re.I)),
    ("scrape artifact", re.compile(r"\bread more\b|\bbook a meeting\b|\bclick here\b", re.I)),
]


# The scrape captured unresolved React-Server-Component references instead of
# prose for 124 speaker bios ("$4a", "$2f") and 5 session descriptions, plus a
# handful of human placeholders ("AS ATTACHED", a bare Google Docs link). These
# are not text, so they are dropped and the record is counted as text-poor --
# embedding "$4a" as Nandan Nilekani's biography would poison retrieval.
_PLACEHOLDER_TOKEN = re.compile(r"^\$[0-9A-Za-z]{1,6}$")
_BARE_URL = re.compile(r"^https?://\S+$")
_PLACEHOLDER_WORDS = {"as attached", "n/a", "na", "tbd", "tba", "-", "--", "."}


def junk_reason(text: str | None) -> str | None:
    """Return why a text field is not real prose, or None if it is usable.

    Deliberately narrow: only provably non-text values are rejected. Short but
    genuine values ("Global bank", "COO of Blue Machines AI") are kept as-is
    and never padded.
    """
    if not text:
        return None
    t = text.strip()
    if _PLACEHOLDER_TOKEN.match(t):
        return "unresolved-placeholder-token"
    if t.lower() in _PLACEHOLDER_WORDS:
        return "placeholder-value"
    if _BARE_URL.match(t):
        return "link-only-no-prose"
    return None


def reject_reason(text: str | None) -> str | None:
    """Return why a scraped partner blurb is unusable, or None if it is clean."""
    if not text:
        return None
    for reason, pat in _PARTNER_DESC_REJECT:
        if pat.search(text):
            return reason
    return None


def clean(v):
    """Trim a source string; return None for blank / missing."""
    if v is None:
        return None
    s = re.sub(r"\s+", " ", str(v)).strip()
    return s or None


def words(s: str) -> int:
    return len(s.split())


def split_body(body: str) -> list[str]:
    """Split a long body into sentence-aligned parts with one sentence of overlap."""
    if words(body) <= MAX_BODY_WORDS:
        return [body]
    sents = _SENT_SPLIT.split(body)
    parts, cur, cur_w = [], [], 0
    for sent in sents:
        sw = words(sent)
        if cur and cur_w + sw > MAX_BODY_WORDS:
            parts.append(" ".join(cur))
            cur = cur[-OVERLAP_SENTENCES:] if OVERLAP_SENTENCES else []
            cur_w = sum(words(s) for s in cur)
        cur.append(sent)
        cur_w += sw
    if cur:
        parts.append(" ".join(cur))
    return parts


def partner_group(tier: str | None) -> str:
    if not tier:
        return "unclassified"
    if tier == "Organiser":
        return "organiser"
    if tier in HEADLINE_TIERS:
        return "headline"
    if tier in SPONSOR_TIERS:
        return "sponsor"
    if tier == "Exhibitor":
        return "exhibitor"
    if tier == "Ecosystem":
        return "ecosystem"
    if tier == "Supporter":
        return "supporter"
    return "category-partner"  # "Voice AI Partner", "Hydration Partner", ...


def day_label(day: str | None) -> str | None:
    if not day:
        return None
    y, m, d = (int(x) for x in day.split("-"))
    dt = date(y, m, d)
    n = DAY_NUMBER.get(day)
    stamp = dt.strftime("%A %-d %B %Y")
    return f"Day {n} ({stamp})" if n else stamp


def slugify(s: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", s.lower())).strip("-") or "unknown"


class IdMinter:
    """Stable, collision-free chunk ids."""

    def __init__(self):
        self.seen = Counter()

    def mint(self, base: str) -> str:
        self.seen[base] += 1
        n = self.seen[base]
        return base if n == 1 else f"{base}-{n}"


# --------------------------------------------------------------------------
# load (2026 only)
# --------------------------------------------------------------------------
partners_raw = json.loads((DATA / "partners-2026.json").read_text())
speakers_raw = json.loads((DATA / "speakers-2026.json").read_text())
sessions_raw = json.loads((DATA / "sessions-2026.json").read_text())

EXPECTED = {"partners": 319, "speakers": 487, "sessions": 256}
actual = {"partners": len(partners_raw), "speakers": len(speakers_raw),
          "sessions": len(sessions_raw)}
if actual != EXPECTED:
    print(f"WARNING: snapshot record counts changed: {actual} != {EXPECTED}",
          file=sys.stderr)

sessions_by_code = {s["agendaCode"]: s for s in sessions_raw if s.get("agendaCode")}

# speaker directory keyed by normalised name, for enriching agenda entries
dir_by_key: dict[str, dict] = {}
for sp in speakers_raw:
    k = join_key(sp.get("name") or "")
    if k and k not in dir_by_key:
        dir_by_key[k] = sp

chunks: list[dict] = []
ids = IdMinter()
stats = {
    "partner": {"records": 0, "chunks": 0, "text_poor": 0, "split": 0},
    "speaker": {"records": 0, "chunks": 0, "text_poor": 0, "split": 0},
    "session": {"records": 0, "chunks": 0, "text_poor": 0, "split": 0},
}
poor_examples = defaultdict(list)
rejects: list[dict] = []
dropped: dict[str, Counter] = defaultdict(Counter)
skipped_non_company: list[dict] = []


def emit(kind, base_id, title, header_lines, body, metadata, text_poor):
    """Write one or more chunks. `header_lines` repeat on every part."""
    parts = split_body(body) if body else [""]
    if len(parts) > 1:
        stats[kind]["split"] += 1
    for i, part in enumerate(parts):
        lines = list(header_lines)
        if part:
            lines.append(part)
        meta = dict(metadata)
        meta["textPoor"] = text_poor
        if len(parts) > 1:
            meta["part"] = i + 1
            meta["partCount"] = len(parts)
        chunks.append({
            "id": ids.mint(base_id if len(parts) == 1 else f"{base_id}#{i + 1}"),
            "type": kind,
            "title": title,
            "text": "\n".join(lines).strip(),
            "metadata": meta,
        })
        stats[kind]["chunks"] += 1


# --------------------------------------------------------------------------
# partners
# --------------------------------------------------------------------------
for rec in partners_raw:
    slug = rec.get("slug") or slugify(rec.get("name") or "")
    # Two independent signals so this survives either one changing: the known
    # slug list, and the upstream isDataArtifact flag scratch-4 now sets.
    if slug in NON_COMPANY_SLUGS or rec.get("isDataArtifact"):
        skipped_non_company.append({"slug": slug, "name": clean(rec.get("name")),
                                    "note": clean(rec.get("artifactNote"))})
        continue  # logo asset, not a company
    name = clean(rec.get("name"))
    if not name:
        continue
    stats["partner"]["records"] += 1

    tier = clean(rec.get("tier"))
    sector = clean(rec.get("category"))
    website = clean(rec.get("website"))
    what = clean(rec.get("whatTheyDo"))
    rejected = reject_reason(what)
    if rejected:
        rejects.append({"slug": slug, "name": name, "reason": rejected})
        what = None
    use_cases = [clean(u) for u in (rec.get("useCases") or [])]
    use_cases = [u for u in use_cases if u and not reject_reason(u)]

    # Em-dash form avoids an a/an article bug across 47 free-text tier names
    # ("a Exhibitor", "a Ecosystem") while keeping the tier in the embedded text.
    header = [f"{name} — {tier} at {EVENT}." if tier else f"{name} — partner at {EVENT}."]
    if sector and sector != "other":
        header.append(f"Sector: {sector}.")
    if use_cases:
        header.append("Use cases: " + "; ".join(use_cases) + ".")
    if website:
        header.append(f"Website: {website}")
    # NOTE: booth/stall location is deliberately never emitted.

    emit(
        "partner",
        f"partner:{slug}",
        name,
        header,
        what or "",
        {
            "name": name,
            "slug": slug,
            "tier": tier,
            "group": partner_group(tier),
            "sector": sector,
            "website": website,
            "useCases": use_cases,
            "hasDescription": bool(what),
            "descriptionRejected": rejected,
            "descriptionMethod": ((rec.get("provenance") or {}).get("whatTheyDo") or {}).get("method") if what else None,
            "sourceConfidence": clean(rec.get("confidence")),
            "year": 2026,
            "sourceUrl": clean(rec.get("sourceUrl")),
        },
        text_poor=not (what or use_cases),
    )
    if not (what or use_cases):
        stats["partner"]["text_poor"] += 1
        poor_examples["partner"].append(name)


# --------------------------------------------------------------------------
# speakers
# --------------------------------------------------------------------------
for rec in speakers_raw:
    name = clean(rec.get("name"))
    if not name:
        continue
    stats["speaker"]["records"] += 1

    key = clean(rec.get("nameKey")) or join_key(name)
    title = clean(rec.get("title"))
    org = clean(rec.get("org"))
    country = clean(rec.get("country"))
    bio = clean(rec.get("bio"))
    bio_junk = junk_reason(bio)
    if bio_junk:
        dropped["speaker.bio"][bio_junk] += 1
        bio = None
    codes = [c for c in (rec.get("sessionCodes") or []) if c]

    role = ", ".join(x for x in (title, org) if x)
    header = [f"{name} — {role}." if role else f"{name}."]
    header.append(f"Speaker at {EVENT}.")
    if country:
        header.append(f"Based in: {country}.")

    closed_codes, session_meta = [], []
    for code in codes:
        s = sessions_by_code.get(code)
        if not s:
            header.append(f"Speaking in session {code}.")
            session_meta.append({"agendaCode": code})
            continue
        closed = bool(s.get("isClosedDoor"))
        if closed:
            closed_codes.append(code)
        # Location deliberately omitted here: halls belong on session chunks
        # only, so a hall is never restated on a person or company chunk.
        when = f"{day_label(s.get('day'))}, {s.get('startTime')}–{s.get('endTime')}"
        line = (f"Speaking in \"{s.get('title')}\" ({code}) — {s.get('format')}, "
                f"{when}.")
        if closed:
            line += " This session is closed-door / invite-only and is not open to general attendees."
        header.append(line)
        session_meta.append({
            "agendaCode": code,
            "title": clean(s.get("title")),
            "day": s.get("day"),
            "startTime": s.get("startTime"),
            "endTime": s.get("endTime"),
            "format": clean(s.get("format")),
            "isClosedDoor": closed,
        })
    if not codes:
        st = clean(rec.get("sessionTitle"))
        if st:
            header.append(f"Speaking in \"{st}\".")

    emit(
        "speaker",
        f"speaker:{slugify(key or name)}",
        name,
        header,
        bio or "",
        {
            "name": name,
            "nameKey": key,
            "title": title,
            "org": org,
            "country": country,
            "sessionCodes": codes,
            "sessions": session_meta,
            "closedDoorSessionCodes": closed_codes,
            "speaksInClosedDoorSession": bool(closed_codes),
            "linkedin": clean(rec.get("linkedin")),
            "hasBio": bool(bio),
            "bioDropped": bio_junk,
            "year": 2026,
            "sourceUrl": clean(rec.get("sourceUrl")),
        },
        text_poor=not bio,
    )
    if not bio:
        stats["speaker"]["text_poor"] += 1
        poor_examples["speaker"].append(name)


# --------------------------------------------------------------------------
# sessions
# --------------------------------------------------------------------------
def people_lines(raw_list, name_list, label):
    """Render agenda people, preferring the raw 'name, designation, org' string.

    Falls back to the speaker directory for designation/org when the agenda
    only gives a bare name. Returns (line, [structured people]).
    """
    people = []
    if raw_list:
        for raw in raw_list:
            nm, desig, org = split_agenda_speaker(raw or "")
            if not nm:
                continue
            people.append({"name": nm, "title": desig, "org": org,
                           "nameKey": join_key(nm)})
    else:
        for nm in (name_list or []):
            nm = clean(nm)
            if not nm:
                continue
            d = dir_by_key.get(join_key(nm))
            people.append({
                "name": nm,
                "title": clean(d.get("title")) if d else None,
                "org": clean(d.get("org")) if d else None,
                "nameKey": join_key(nm),
            })
    if not people:
        return None, []
    rendered = []
    for p in people:
        bits = ", ".join(x for x in (p["title"], p["org"]) if x)
        rendered.append(f"{p['name']} ({bits})" if bits else p["name"])
    return f"{label}: " + "; ".join(rendered) + ".", people


for rec in sessions_raw:
    code = clean(rec.get("agendaCode"))
    title = clean(rec.get("title"))
    if not title:
        continue
    stats["session"]["records"] += 1

    desc = clean(rec.get("description"))
    desc_junk = junk_reason(desc)
    if desc_junk:
        dropped["session.description"][desc_junk] += 1
        desc = None
    fmt = clean(rec.get("format"))
    day = clean(rec.get("day"))
    start, end = clean(rec.get("startTime")), clean(rec.get("endTime"))
    hall = clean(rec.get("hall"))  # halls ARE published for sessions
    track = clean(rec.get("track"))
    topics = [clean(t) for t in (rec.get("topics") or [])]
    topics = [t for t in topics if t]
    closed = bool(rec.get("isClosedDoor"))
    access = clean(rec.get("accessType"))

    when = ", ".join(x for x in (day_label(day), f"{start}–{end}" if start and end else None) if x)
    header = [f"{title} ({code}) — {EVENT}." if code else f"{title} — {EVENT}."]
    header.append(" · ".join(x for x in (fmt, when, hall) if x) + ".")
    if topics:
        header.append("Topics: " + ", ".join(topics) + ".")
    elif track:
        header.append(f"Track: {track}.")
    if closed:
        header.append("ACCESS: closed-door / invite-only. This session is NOT open to "
                      "general attendees and must not be recommended as attendable.")
    else:
        header.append("Access: open to attendees.")

    spk_line, spk_people = people_lines(rec.get("speakersRaw"), rec.get("speakerNames"), "Speakers")
    host_line, host_people = people_lines(rec.get("hostsRaw"), rec.get("hostNames"), "Hosts / moderators")
    # 3 sessions carry only the merged `speakers` list; use it when both are empty.
    if not spk_people and not host_people and rec.get("speakers"):
        spk_line, spk_people = people_lines(None, rec.get("speakers"), "Speakers")
    for line in (spk_line, host_line):
        if line:
            header.append(line)

    emit(
        "session",
        f"session:{code or slugify(title)}",
        title,
        header,
        desc or "",
        {
            "agendaCode": code,
            "day": day,
            "dayNumber": DAY_NUMBER.get(day),
            "startTime": start,
            "endTime": end,
            "hall": hall,
            "format": fmt,
            "track": track,
            "topics": topics,
            "isClosedDoor": closed,
            "accessType": access,
            "attendable": not closed,
            "speakerNames": [p["name"] for p in spk_people],
            "speakerNameKeys": [p["nameKey"] for p in spk_people],
            "hostNames": [p["name"] for p in host_people],
            "speakerCount": len(spk_people) + len(host_people),
            "hasDescription": bool(desc),
            "descriptionDropped": desc_junk,
            "year": 2026,
            "sourceUrl": clean(rec.get("sourceUrl")),
        },
        text_poor=not desc,
    )
    if not desc:
        stats["session"]["text_poor"] += 1
        poor_examples["session"].append(f"{code} {title}")


# --------------------------------------------------------------------------
# write
# --------------------------------------------------------------------------
with OUT.open("w", encoding="utf-8") as fh:
    for c in chunks:
        fh.write(json.dumps(c, ensure_ascii=False) + "\n")

report = {
    "outputFile": str(OUT),
    "sourceSnapshot": {"dir": str(DATA), "recordCounts": actual},
    "droppedNonCompanyRecords": skipped_non_company,
    "totalChunks": len(chunks),
    "byType": stats,
    "rejectedPartnerDescriptions": rejects,
    "droppedNonProseFields": {k: dict(v) for k, v in dropped.items()},
    "textPoorExamples": {k: v[:8] for k, v in poor_examples.items()},
}
REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False))
print(json.dumps(report, indent=2, ensure_ascii=False))
