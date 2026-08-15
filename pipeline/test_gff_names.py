"""Tests for the session<->speaker name join.

Run: python3 test_gff_names.py     (no pytest dependency required)

The headline assertion is the JOIN RATE: 344 of 345 distinct agenda speaker
names must resolve to a speaker record. A naive equality join scores 0, so if
normalisation ever regresses this test fails loudly instead of the site
quietly rendering sessions with no speakers attached.
"""
import json, pathlib, sys
from gff_names import normalise_name, split_agenda_speaker

ROOT = pathlib.Path(__file__).resolve().parent
EXPECTED_MATCHED = 345
EXPECTED_DISTINCT = 345
# No documented misses. NOTE: an earlier audit reported 344/345 with
# "manish hingar" unmatched. That was a defect in the audit's throwaway regex,
# not a data gap: the directory spells him "CA Manish Hingar", and "CA" is a
# professional honorific the ad-hoc pattern did not strip. gff_names handles
# CA/CS/CMA, so the true rate is 345/345. See the regression case below.
KNOWN_UNMATCHED = set()

fails = []


def check(cond, label):
    if cond:
        print("  ok   %s" % label)
    else:
        print("  FAIL %s" % label)
        fails.append(label)


print("unit: normalise_name")
for raw, want in [
    ("Smt. Nirmala Sitharaman", "nirmala sitharaman"),
    ("Shri Nitin Gadkari", "nitin gadkari"),
    ("Dr. Raghuram Rajan", "raghuram rajan"),
    ("Mr Sanjay Shorey", "sanjay shorey"),
    ("Yuvraj Singh  Shekhawat", "yuvraj singh shekhawat"),
    ("Sanjay Shorey, Executive Director, NSE", "sanjay shorey"),
    ("  Praveena   Rai  ", "praveena rai"),
    ("Prof. Ms. Anita Desai", "anita desai"),
    # Regression: professional honorifics must be stripped too. Missing "CA"
    # here is exactly what made the audit under-report the join as 344/345.
    ("CA Manish Hingar", "manish hingar"),
    ("CS Priya Nair", "priya nair"),
    ("CMA Ravi Kumar", "ravi kumar"),
    ("", ""),
]:
    got = normalise_name(raw)
    check(got == want, "%-45r -> %r (got %r)" % (raw, want, got))

check(normalise_name(None) == "", "None is safe")
check(normalise_name("Dr.") == "", "salutation-only yields empty")

print("unit: split_agenda_speaker")
n, d, o = split_agenda_speaker("Arif Khan, Chief Innovation Officer, Razorpay Software")
check((n, d, o) == ("Arif Khan", "Chief Innovation Officer", "Razorpay Software"), "3-part split")
n2, d2, o2 = split_agenda_speaker("Latika S Kundu, MD & CEO, Metropolitan Stock Exchange, Ltd.")
check(n2 == "Latika S Kundu" and o2 == "Metropolitan Stock Exchange, Ltd.",
      "commas inside org are preserved")
check(split_agenda_speaker("") == (None, None, None), "blank input")
check(split_agenda_speaker("Solo Name")[0] == "Solo Name", "name only")

print("integration: join rate against the emitted corpus")
spath, kpath = ROOT / "sessions-2026.json", ROOT / "speakers-2026.json"
if not (spath.exists() and kpath.exists()):
    print("  SKIP corpus files not present")
else:
    sessions = json.loads(spath.read_text())
    speakers = json.loads(kpath.read_text())

    directory = {normalise_name(s["name"]) for s in speakers}
    directory.discard("")

    # The join universe is speakers AND hosts — a moderator is a person the
    # app must be able to resolve to a speaker card just like a panellist.
    agenda = set()
    for s in sessions:
        for nm in (s.get("speakerNames") or []) + (s.get("hostNames") or []):
            k = normalise_name(nm)
            if k:
                agenda.add(k)

    matched = agenda & directory
    unmatched = agenda - directory
    print("  distinct agenda names: %d | matched: %d | unmatched: %d"
          % (len(agenda), len(matched), len(unmatched)))

    check(len(agenda) == EXPECTED_DISTINCT,
          "distinct agenda names == %d" % EXPECTED_DISTINCT)
    check(len(matched) == EXPECTED_MATCHED,
          "matched == %d (naive join would be ~0)" % EXPECTED_MATCHED)
    check(unmatched == KNOWN_UNMATCHED,
          "unmatched set is exactly the documented %s" % sorted(KNOWN_UNMATCHED))
    check(len(matched) / max(len(agenda), 1) > 0.99, "join rate > 99%")

    # Guard the shape the app depends on.
    check(all(isinstance(s.get("speakerNames"), list) for s in sessions),
          "every session has a speakerNames list")
    check(all(isinstance(s.get("speakersRaw"), list) for s in sessions),
          "every session retains speakersRaw")
    check(all(s.get("booth", None) is None for s in json.loads((ROOT / "partners-2026.json").read_text())),
          "no partner carries a booth value")

print()
if fails:
    print("FAILED %d check(s)" % len(fails))
    sys.exit(1)
print("all checks passed")
