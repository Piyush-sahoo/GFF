#!/usr/bin/env python3
"""
Build a portable embedding index for the GFF 2026 attendee chatbot.

Pipeline:
  corpus.jsonl  ->  Gemini embeddings (3072-d)  ->  MRL truncation  ->  int8 index

Model: gemini-embedding-2 (verified present on this key via ListModels).
  - 8192 input-token limit (corpus max is ~353 tokens, so nothing truncates)
  - returns L2-normalised vectors at EVERY output_dimensionality, so a
    truncated prefix is directly comparable by dot product.

We embed once at the full 3072 dims and derive smaller dims locally. This is
exact, not an approximation: Matryoshka (MRL) truncate+renormalise was verified
to reproduce the API's native 768-d output at cos = 1.000000 (see README).
So dimension choice costs no extra tokens and can be revisited for free.

Outputs (in ./index):
  gff-2026.vectors.i8    int8 matrix, row-major [n x dim]
  gff-2026.manifest.json ids + light metadata + dequant scale
  gff-2026.f32.raw       (optional, --keep-raw) full 3072-d float32 cache

Usage:
  python3 build_index.py                # build with defaults (dim 768)
  python3 build_index.py --dim 1536
  python3 build_index.py --eval          # report dim/quantisation tradeoffs
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import struct
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
CORPUS_PRIMARY = Path(
    os.environ.get("GFF_CORPUS", REPO / "rag" / "corpus" / "corpus.jsonl")
)
RAW_SOURCES = Path(os.environ.get("GFF_DATA_DIR", REPO / "data" / "2026"))

MODEL = "gemini-embedding-2"
NATIVE_DIM = 3072
API = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}"
BATCH = 50
CACHE = HERE / ".embed-cache.jsonl"
OUTDIR = HERE / "index"
STEM = "gff-2026"

# Non-company artifacts to drop if we have to fall back to the raw partner feed.
PARTNER_ARTIFACT_SLUGS = {"become-a-partner", "partner-with-us", "download-brochure"}


# --------------------------------------------------------------------------
# key handling -- read from .env, never printed or logged
# --------------------------------------------------------------------------
def load_key() -> str:
    env = HERE / ".env"
    key = os.environ.get("GEMINI_API_KEY")
    if not key and env.exists():
        for line in env.read_text().splitlines():
            line = line.strip()
            if line.startswith("GEMINI_API_KEY="):
                key = line.split("=", 1)[1].strip()
    if not key:
        sys.exit("GEMINI_API_KEY not found (expected in ./.env)")
    return key


# --------------------------------------------------------------------------
# corpus loading
# --------------------------------------------------------------------------
def load_corpus() -> list[dict]:
    """Prefer scratch-5's corpus.jsonl; fall back to building from raw feeds."""
    if CORPUS_PRIMARY.exists() and CORPUS_PRIMARY.stat().st_size > 0:
        rows = [
            json.loads(line)
            for line in CORPUS_PRIMARY.read_text().splitlines()
            if line.strip()
        ]
        print(f"corpus: {len(rows)} records from {CORPUS_PRIMARY}")
        return rows
    print("corpus.jsonl absent -- falling back to raw sources", file=sys.stderr)
    return build_corpus_from_raw()


def build_corpus_from_raw() -> list[dict]:
    """Minimal fallback corpus builder over scratch-4's raw JSON feeds."""

    def load(name):
        p = RAW_SOURCES / name
        return json.loads(p.read_text()) if p.exists() else []

    rows: list[dict] = []

    for p in load("partners-2026.json"):
        slug = p.get("slug") or ""
        if slug in PARTNER_ARTIFACT_SLUGS or not p.get("name"):
            continue
        bits = [f"{p['name']} is a {p.get('tier', 'partner')} at Global Fintech Fest 2026."]
        if p.get("category"):
            bits.append(f"Sector: {p['category']}.")
        if p.get("useCases"):
            bits.append("Use cases: " + "; ".join(p["useCases"]) + ".")
        if p.get("whatTheyDo"):
            bits.append(p["whatTheyDo"])
        rows.append(
            {
                "id": f"partner:{slug}",
                "type": "partner",
                "title": p["name"],
                "text": "\n".join(bits),
                "metadata": p,
            }
        )

    for s in load("speakers-2026.json"):
        bits = [
            f"{s.get('name')} — {s.get('title', '')}, {s.get('org', '')}.".replace(" — , ", " — "),
            "Speaker at Global Fintech Fest 2026.",
        ]
        if s.get("sessionTitle"):
            bits.append(f'Speaking in "{s["sessionTitle"]}".')
        if s.get("bio"):
            bits.append(s["bio"])
        key = (s.get("nameKey") or s.get("name", "")).lower().replace(" ", "-")
        rows.append(
            {
                "id": f"speaker:{key}",
                "type": "speaker",
                "title": s.get("name"),
                "text": "\n".join(b for b in bits if b.strip()),
                "metadata": s,
            }
        )

    for s in load("sessions-2026.json"):
        bits = [f"{s.get('title')} ({s.get('agendaCode')}) — Global Fintech Fest 2026."]
        meta = " · ".join(
            x for x in [s.get("format"), s.get("day"), s.get("hall")] if x
        )
        if meta:
            bits.append(meta + ".")
        if s.get("topics"):
            bits.append("Topics: " + ", ".join(s["topics"]) + ".")
        if s.get("description"):
            bits.append(s["description"])
        rows.append(
            {
                "id": f"session:{s.get('agendaCode')}",
                "type": "session",
                "title": s.get("title"),
                "text": "\n".join(bits),
                "metadata": s,
            }
        )

    print(f"corpus: {len(rows)} records built from raw sources")
    return rows


# --------------------------------------------------------------------------
# embedding
# --------------------------------------------------------------------------
def post(path: str, body: dict, key: str, retries: int = 6) -> dict:
    data = json.dumps(body).encode()
    for attempt in range(retries):
        req = urllib.request.Request(
            f"{API}:{path}",
            data=data,
            headers={"x-goog-api-key": key, "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            body_txt = e.read().decode()[:200]
            # 429 rate limit / 5xx transient -> exponential backoff
            if e.code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                wait = min(60, 2**attempt * 2)
                print(f"  HTTP {e.code}, retry in {wait}s", file=sys.stderr)
                time.sleep(wait)
                continue
            raise RuntimeError(f"HTTP {e.code}: {body_txt}") from None
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < retries - 1:
                time.sleep(min(60, 2**attempt * 2))
                continue
            raise RuntimeError(f"network: {e}") from None
    raise RuntimeError("exhausted retries")


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def load_cache() -> dict[tuple[str, str], list[float]]:
    """Cache is content-addressed by (id, text-hash).

    Keying on id alone is unsafe: the upstream corpus is regenerated by another
    worker, so a record can keep its id while its text changes. Hashing the text
    means edited records are re-embedded and untouched ones stay free.
    """
    if not CACHE.exists():
        return {}
    out = {}
    for line in CACHE.read_text().splitlines():
        if line.strip():
            r = json.loads(line)
            if "h" in r:  # entries without a hash predate this scheme; drop them
                out[(r["id"], r["h"])] = r["v"]
    return out


def embed_corpus(rows: list[dict], key: str) -> tuple[dict[str, list[float]], int]:
    """Embed every record at native 3072 dims, checkpointing to CACHE."""
    cache = load_cache()
    for r in rows:
        r["_h"] = text_hash(r["text"])
    todo = [r for r in rows if (r["id"], r["_h"]) not in cache]
    print(f"embedding: {len(todo)} to fetch, {len(rows) - len(todo)} reused from cache")
    total_tokens = 0

    with CACHE.open("a") as fh:
        for i in range(0, len(todo), BATCH):
            chunk = todo[i : i + BATCH]
            body = {
                "requests": [
                    {
                        "model": f"models/{MODEL}",
                        "content": {"parts": [{"text": r["text"]}]},
                        "taskType": "RETRIEVAL_DOCUMENT",
                    }
                    for r in chunk
                ]
            }
            resp = post("batchEmbedContents", body, key)
            embs = resp["embeddings"]
            assert len(embs) == len(chunk), "batch size mismatch"
            usage = resp.get("usageMetadata") or {}
            if isinstance(usage, list):
                total_tokens += sum(u.get("promptTokenCount", 0) for u in usage)
            else:
                total_tokens += usage.get("promptTokenCount", 0)
            for r, e in zip(chunk, embs):
                v = e["values"]
                assert len(v) == NATIVE_DIM, f"unexpected dim {len(v)}"
                cache[(r["id"], r["_h"])] = v
                fh.write(json.dumps({"id": r["id"], "h": r["_h"], "v": v}) + "\n")
            fh.flush()
            print(f"  {min(i + BATCH, len(todo))}/{len(todo)}")

    return cache, total_tokens


# --------------------------------------------------------------------------
# vector maths (pure python -- no numpy dependency)
# --------------------------------------------------------------------------
def truncate_norm(v: list[float], dim: int) -> list[float]:
    """MRL: take the leading `dim` components and renormalise to unit length."""
    t = v[:dim]
    n = math.sqrt(sum(x * x for x in t)) or 1.0
    return [x / n for x in t]


def quantise(vecs: list[list[float]]) -> tuple[bytes, float]:
    """Symmetric int8 quantisation with one global scale.

    Vectors are unit-norm so components share a tight range; a single scale
    keeps the manifest trivial and dequantisation branch-free.
    """
    peak = max(abs(x) for v in vecs for x in v)
    scale = peak / 127.0
    flat = [
        max(-127, min(127, int(round(x / scale)))) for v in vecs for x in v
    ]
    return struct.pack(f"{len(flat)}b", *flat), scale


def cosine(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))  # inputs are unit-norm


# --------------------------------------------------------------------------
# evaluation: what do we lose by shrinking / quantising?
# --------------------------------------------------------------------------
def evaluate(ids: list[str], full: list[list[float]], dims=(3072, 1536, 768, 512, 256)):
    """Recall@10 of each candidate config against the full-precision 3072 index.

    Dev-only diagnostic; uses numpy. The index writer itself stays dependency-free.
    """
    import numpy as np

    def unit(m):
        return m / np.linalg.norm(m, axis=1, keepdims=True)

    base_mat = unit(np.asarray(full, dtype=np.float32))
    n = base_mat.shape[0]

    def topk_all(mat, k=10):
        sims = mat @ mat.T
        np.fill_diagonal(sims, -2.0)  # exclude self
        return np.argpartition(-sims, k, axis=1)[:, :k]

    base = [set(r) for r in topk_all(base_mat)]
    print(f"\n{'config':<20} {'recall@10 vs 3072-f32':>22} {'index size':>12}")
    print("-" * 56)
    for d in dims:
        trunc = unit(base_mat[:, :d])
        buf, scale = quantise(trunc.tolist())
        deq = unit(
            np.frombuffer(buf, dtype=np.int8).reshape(n, d).astype(np.float32) * scale
        )
        for label, mat, nbytes in (
            (f"{d}-d float32", trunc, n * d * 4),
            (f"{d}-d int8", deq, n * d),
        ):
            hits = sum(len(base[i] & set(row)) for i, row in enumerate(topk_all(mat)))
            print(
                f"{label:<20} {hits / (n * 10):>22.4f} {nbytes / 1024:>10.0f} KB"
            )


# --------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dim", type=int, default=768, help="shipped index dimension")
    ap.add_argument("--eval", action="store_true", help="report dim/quant tradeoffs")
    ap.add_argument("--keep-raw", action="store_true", help="also emit float32 3072 cache")
    args = ap.parse_args()

    key = load_key()
    rows = load_corpus()
    corpus_sha = hashlib.sha256(
        "".join(sorted(r["id"] + r["text"] for r in rows)).encode()
    ).hexdigest()[:16]
    cache, tokens = embed_corpus(rows, key)

    rows = [r for r in rows if (r["id"], r["_h"]) in cache]
    ids = [r["id"] for r in rows]
    full = [cache[(r["id"], r["_h"])] for r in rows]

    if args.eval:
        evaluate(ids, full)

    dim = args.dim
    vecs = [truncate_norm(v, dim) for v in full]
    buf, scale = quantise(vecs)

    OUTDIR.mkdir(exist_ok=True)
    vec_path = OUTDIR / f"{STEM}.vectors.i8"
    vec_path.write_bytes(buf)

    manifest = {
        "name": "gff-2026-attendee-index",
        "model": MODEL,
        "nativeDim": NATIVE_DIM,
        "dim": dim,
        "count": len(ids),
        "corpusSha": corpus_sha,
        "dtype": "int8",
        "scale": scale,
        "normalised": True,
        "taskTypes": {"document": "RETRIEVAL_DOCUMENT", "query": "RETRIEVAL_QUERY"},
        "vectorsFile": vec_path.name,
        "records": [
            {"id": r["id"], "type": r["type"], "title": r.get("title") or ""}
            for r in rows
        ],
    }
    man_path = OUTDIR / f"{STEM}.manifest.json"
    man_path.write_text(json.dumps(manifest, separators=(",", ":")))

    if args.keep_raw:
        raw = OUTDIR / f"{STEM}.f32.raw"
        with raw.open("wb") as fh:
            for v in full:
                fh.write(struct.pack(f"{NATIVE_DIM}f", *v))

    print("\n--- index written ---")
    print(f"{vec_path.name}: {vec_path.stat().st_size:,} bytes")
    print(f"{man_path.name}: {man_path.stat().st_size:,} bytes")
    print(f"records={len(ids)} dim={dim} dtype=int8")
    print(f"tokens billed this run: {tokens:,}")
    (HERE / "build-stats.json").write_text(
        json.dumps(
            {
                "records": len(ids),
                "dim": dim,
                "model": MODEL,
                "tokensThisRun": tokens,
                "corpusSha": corpus_sha,
                "vectorBytes": vec_path.stat().st_size,
                "manifestBytes": man_path.stat().st_size,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
