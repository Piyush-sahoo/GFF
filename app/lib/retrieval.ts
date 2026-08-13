import path from "node:path";
import { createRetriever, loadGffIndexDense } from "../vendor/retrieval/src/index";
import type { RetrievalFilters } from "../vendor/retrieval/src/types";

/**
 * HYBRID RETRIEVAL (scratch-8 module + scratch-7 i8 index), vendored.
 *
 * The dense channel is a CONFIG CHOICE, not a hardcoded path:
 *
 *   RETRIEVAL_DENSE=none    lexical + in-process dense. No network, no key,
 *                           no per-query latency, deterministic.
 *   RETRIEVAL_DENSE=gemini  Gemini query embeddings against the i8 index.
 *
 * Flip the env var; nothing else changes. Whichever channel actually served a
 * result is reported back and shown in the UI — a silent downgrade to worse
 * results is the same class of dishonesty as claiming live data while serving
 * fixtures, and we are not repeating that.
 */
export type DenseMode = "none" | "gemini";

/**
 * Gemini is the decided default: it ties with the no-key channel on name and
 * keyword queries but wins on paraphrase, where the user's words do not appear
 * in the records ("someone who can stop criminals using stolen identities"
 * returns the deepfake/synthetic-identity session rather than companies whose
 * text happens to contain "stop"). Set RETRIEVAL_DENSE=none to opt out.
 */
export const DENSE_MODE: DenseMode =
  process.env.RETRIEVAL_DENSE === "none" ? "none" : "gemini";

/** 8s, not 4s: median is ~700ms but cold connections genuinely take seconds. */
const DENSE_TIMEOUT_MS = 8000;

const jsonlPath = path.join(process.cwd(), "vendor/retrieval/data/corpus.jsonl");
const indexDir = path.join(process.cwd(), "vendor/gff-index/index");

export type Channel = "gemini-dense" | "in-process-dense";

export type RetrieveOutcome = {
  hits: readonly any[];
  diagnostics: unknown;
  /** Which channel actually produced these results. */
  channel: Channel;
  /** True when the configured channel failed and we fell back. */
  degraded: boolean;
  degradedReason: string | null;
};

/** Built ONCE at module scope — never per request. */
const lexicalRetriever = createRetriever({ jsonlPath });

/** Lazily built once, then reused. Null once we know it cannot be built. */
let densePromise: Promise<ReturnType<typeof createRetriever> | null> | null = null;

function denseRetriever() {
  if (DENSE_MODE !== "gemini") return Promise.resolve(null);
  if (!densePromise) {
    densePromise = (async () => {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return null;
      const dense = await loadGffIndexDense({ indexDir, apiKey, stem: "gff-2026", timeoutMs: DENSE_TIMEOUT_MS });
      return createRetriever({ jsonlPath, dense });
    })().catch((e) => {
      console.error("[retrieval] dense channel unavailable:", e);
      return null;
    });
  }
  return densePromise;
}

/** Re-exported from the retrieval module so the shapes cannot drift apart. */
export type Filters = RetrievalFilters;

export async function retrieve(
  query: string,
  opts: { limit?: number; filters?: Filters } = {},
): Promise<RetrieveOutcome> {
  const options = { limit: opts.limit ?? 10, filters: opts.filters ?? {} };

  if (DENSE_MODE === "gemini") {
    try {
      const r = await denseRetriever();
      if (r) {
        const out = await r.retrieveAsync(query, options);
        // The retrieval module falls back to lexical INTERNALLY and still
        // resolves normally, so a try/catch here would never fire. The only
        // reliable signal is the diagnostics flag.
        const diag = out.diagnostics as { denseDegraded?: boolean } | undefined;
        const internallyDegraded = diag?.denseDegraded === true;
        return {
          hits: out.hits,
          diagnostics: out.diagnostics,
          channel: internallyDegraded ? "in-process-dense" : "gemini-dense",
          degraded: internallyDegraded,
          degradedReason: internallyDegraded
            ? "Semantic search was unavailable for this query, so these results come from keyword and name matching only."
            : null,
        };
      }
      const out = lexicalRetriever.retrieve(query, options);
      return {
        hits: out.hits,
        diagnostics: out.diagnostics,
        channel: "in-process-dense",
        degraded: true,
        degradedReason: process.env.GEMINI_API_KEY
          ? "The semantic index could not be loaded, so these results come from keyword and name matching only."
          : "No embedding key is configured, so these results come from keyword and name matching only.",
      };
    } catch (e) {
      console.error("[retrieval] dense query failed:", e);
      const out = lexicalRetriever.retrieve(query, options);
      return {
        hits: out.hits,
        diagnostics: out.diagnostics,
        channel: "in-process-dense",
        degraded: true,
        degradedReason:
          "The semantic search timed out or errored, so these results come from keyword and name matching only.",
      };
    }
  }

  const out = lexicalRetriever.retrieve(query, options);
  return {
    hits: out.hits,
    diagnostics: out.diagnostics,
    channel: "in-process-dense",
    degraded: false,
    degradedReason: null,
  };
}
