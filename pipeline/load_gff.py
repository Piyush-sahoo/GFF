#!/usr/bin/env python3
"""Load GFF corpus JSON into MongoDB Atlas (DB 'gff').

Owned by worker scratch-4. Reads MONGODB_URI from ./.env (no inline secrets).
Never creates clusters/users/access-list entries. Never drops a collection.

Safety model
------------
Two other workers write to the same collections, so the default mode is
insert-new: a document whose natural key already exists is SKIPPED, never
overwritten. That satisfies both "must be idempotent on re-run" and the
hard rule "insert only, do not overwrite".

  --mode insert-new   (default) insert only keys not already present
  --mode upsert       overwrite existing docs with our values (use only when
                      this worker is the confirmed owner of that year)

Natural keys: partners/speakers -> (name, year); sessions -> (title, day, year).
Year is always part of the key so 2025 and 2026 coexist and we can never
touch another year's documents.

Usage:
  python3 load_gff.py --year 2025 --dry-run
  python3 load_gff.py --year 2025
  python3 load_gff.py --year 2026 --collections partners sessions
"""
import argparse, json, os, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent
FILES = {
    'partners': 'partners-{year}.json',
    'speakers': 'speakers-{year}.json',
    'sessions': 'sessions-{year}.json',
}
KEYS = {
    'partners': ('name', 'year'),
    'speakers': ('name', 'year'),
    'sessions': ('title', 'day', 'year'),
}


def load_dotenv(path):
    """Minimal .env reader — avoids a dependency on python-dotenv."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        v = v.strip().strip('"').strip("'")
        if v:
            os.environ.setdefault(k.strip(), v)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--year', type=int, required=True, choices=[2025, 2026])
    ap.add_argument('--mode', choices=['insert-new', 'upsert'], default='insert-new')
    ap.add_argument('--collections', nargs='*', default=list(FILES))
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    load_dotenv(ROOT / '.env')
    uri = os.environ.get('MONGODB_URI')
    if not uri:
        sys.exit('MONGODB_URI not set. Copy .env.example to .env and fill it in.')
    dbname = os.environ.get('MONGODB_DB', 'gff')

    from pymongo import MongoClient, UpdateOne
    client = MongoClient(uri, serverSelectionTimeoutMS=20000, appname='gff-scratch4')
    client.admin.command('ping')
    db = client[dbname]
    print('connected: db=%s mode=%s year=%s' % (dbname, args.mode, args.year))

    grand = {}
    for coll in args.collections:
        path = ROOT / FILES[coll].format(year=args.year)
        if not path.exists():
            print('  %-9s SKIP (no file %s)' % (coll, path.name))
            continue
        docs = json.loads(path.read_text())
        if not docs:
            print('  %-9s 0 documents in file — nothing to load' % coll)
            grand[coll] = 0
            continue

        # Logo placeholders in the GFF CMS are not partners. Excluded from the
        # DB entirely so the true partner count (316) is what the app sees.
        if coll == 'partners':
            arts = [d['name'] for d in docs if d.get('isDataArtifact')]
            if arts:
                docs = [d for d in docs if not d.get('isDataArtifact')]
                print('  %-9s excluding %d data artifact(s): %s'
                      % (coll, len(arts), ', '.join(arts)))

        # Hard invariant: booth data must never be published for a future event.
        if coll == 'partners':
            bad = [d['name'] for d in docs
                   if d.get('booth') is not None or d.get('boothSource') is not None]
            if bad:
                sys.exit('ABORT: booth must be null; offenders: %s' % bad[:5])
        assert all(d.get('year') == args.year for d in docs), 'year mismatch in ' + path.name

        key = KEYS[coll]
        before = db[coll].count_documents({'year': args.year})

        if args.dry_run:
            existing = set()
            for d in db[coll].find({'year': args.year}, {k: 1 for k in key}):
                existing.add(tuple(d.get(k) for k in key))
            new = [d for d in docs if tuple(d.get(k) for k in key) not in existing]
            print('  %-9s file=%d existing(year)=%d would_insert=%d would_skip=%d'
                  % (coll, len(docs), before, len(new), len(docs) - len(new)))
            grand[coll] = 0
            continue

        ops = []
        for d in docs:
            flt = {k: d.get(k) for k in key}
            if args.mode == 'upsert':
                ops.append(UpdateOne(flt, {'$set': d}, upsert=True))
            else:
                ops.append(UpdateOne(flt, {'$setOnInsert': d}, upsert=True))
        res = db[coll].bulk_write(ops, ordered=False)
        after = db[coll].count_documents({'year': args.year})
        print('  %-9s file=%d inserted=%d modified=%d matched(skipped)=%d count(year=%d): %d -> %d'
              % (coll, len(docs), res.upserted_count, res.modified_count,
                 res.matched_count, args.year, before, after))
        grand[coll] = after

    if not args.dry_run:
        print('final counts for year=%d: %s' % (args.year, grand))
        for coll in args.collections:
            print('  %s total (all years) = %d' % (coll, db[coll].count_documents({})))
    client.close()


if __name__ == '__main__':
    main()
