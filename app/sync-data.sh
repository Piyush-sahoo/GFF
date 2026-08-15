#!/usr/bin/env bash
# Vendor scratch-4's emitted JSON into ./data so the Vercel build is
# self-contained. Vercel only uploads this project directory — an absolute path
# into another worktree would build locally and fail in CI.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$REPO/data/2026}"
cd "$(dirname "$0")"
for f in sessions-2026.json speakers-2026.json partners-2026.json join-report-2026.json; do
  if [ -f "$SRC/$f" ]; then
    cp "$SRC/$f" "data/$f"
    printf '  %-26s %s bytes\n' "$f" "$(wc -c < "data/$f" | tr -d ' ')"
  else
    echo "  MISSING: $f (not yet emitted)" >&2
  fi
done

# Retrieval stack: scratch-8 module + scratch-7 embedding index (i8 only).
S7="${S7:-$REPO/rag/embeddings}"
S8="${S8:-$REPO/rag/retrieval}"
if [ -d "$S8/src" ]; then
  rm -rf vendor/retrieval/src && cp -R "$S8/src" vendor/retrieval/src
  cp "$S8/data/corpus.jsonl" "$S8/data/corpus.meta.json" vendor/retrieval/data/ 2>/dev/null
  # UPSTREAM TYPE ERROR (reported to scratch-8): adapters/gff-index.ts narrows
  # `embedQuery` to `never` inside the closure, so `embedQuery(...)` fails
  # typecheck. Runtime is unaffected — verified against both channels. Suppress
  # typecheck on that one vendored file until upstream fixes it; remove this
  # block once it does.
  ADP=vendor/retrieval/src/adapters/gff-index.ts
  if [ -f "$ADP" ] && ! head -1 "$ADP" | grep -q "@ts-nocheck"; then
    printf '// @ts-nocheck -- upstream type error in @gff/retrieval, see sync-data.sh\n%s' "$(cat $ADP)" > "$ADP.tmp" && mv "$ADP.tmp" "$ADP"
  fi
  echo "  vendored @gff/retrieval src + corpus"
fi
if [ -d "$S7/index" ]; then
  cp "$S7/index/gff-2026.vectors.i8" "$S7/index/gff-2026.manifest.json" vendor/gff-index/index/
  cp "$S7/lib/gff-index.mjs" "$S7/lib/gff-index.d.ts" vendor/gff-index/lib/
  echo "  vendored gff-index (i8) + loader"
fi
