// P-5 leftover, "script-src CSP after voice" (029): the Content-Security-Policy for every response. A page runs only our
// own scripts: files from this origin, and the inline scripts our own HTML carries, each allowed by its exact hash (the
// wallet's first paint, web/prerender.ts; the S8 spike page), never 'unsafe-inline' for scripts. Outside hosts are only
// the ones a feature really calls: PayPal's Pay Later SDK (sandbox), and the speech model's host for the on-device mic.
// No jsDelivr and no blob: scripts: ONNX Runtime comes from our own origin on every page (029; the jsDelivr loader was
// imported from a blob: URL, so both went when Joshua's iPhone pass made our own copy the only one).
//
// Not strict, on purpose: style-src keeps 'unsafe-inline' (React's style props, AG Grid's and PayPal's injected styles;
// a style can't run code).

import { createHash } from "node:crypto";

// The hosts are the ones seen live (scripts/csp-smoke.ts --paypal and the mic pages), nothing wider. PayPal's modal
// ("Learn more") is PayPal's own frame: what it loads (www.paypalobjects.com) is under PayPal's policy, not ours.
/** PayPal's v6 SDK for the Pay Later message: its script, and the frame its "Learn more" opens. */
const PAYPAL = "https://www.sandbox.paypal.com";
/** Where the SDK fetches the message's words (/v2/credit/fetch-presentment-messages). */
const PAYPAL_API = "https://api-m.sandbox.paypal.com";
/** The Whisper model's files: huggingface.co answers with a redirect to its file CDN (us.aws.cdn.hf.co, seen live; it has
 *  also used cdn-lfs.huggingface.co, so a move back can't silently break the mic). */
const MODEL = ["https://huggingface.co", "https://*.huggingface.co", "https://*.hf.co"];

/** The sha-256 of each inline `<script>` (one with no src) in a page, as CSP source expressions. */
export function inlineScriptHashes(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(m[1]!) || !m[2]) continue;
    out.push(`'sha256-${createHash("sha256").update(m[2], "utf8").digest("base64")}'`);
  }
  return out;
}

const policy = (d: Record<string, string[]>) => Object.entries(d).map(([k, v]) => [k, ...v].join(" ")).join("; ");

/**
 * A page's policy. `hashes`: the inline scripts of every page we serve. The model host and WebAssembly are allowed on
 * every page, because a browser that gives a worker its page's policy (rather than the worker file's own) must still
 * let the mic run.
 */
export function pagePolicy(hashes: readonly string[]): string {
  return policy({
    "default-src": ["'self'"],
    "script-src": ["'self'", ...new Set(hashes), "'wasm-unsafe-eval'", PAYPAL],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", PAYPAL],
    "font-src": ["'self'"],
    "connect-src": ["'self'", PAYPAL, PAYPAL_API, ...MODEL],
    "frame-src": [PAYPAL],
    "worker-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  });
}

/** The speech worker's own policy (a dedicated worker takes the policy its script was served with). */
export const WORKER_POLICY = policy({
  "default-src": ["'none'"],
  "script-src": ["'self'", "'wasm-unsafe-eval'"],
  "connect-src": ["'self'", ...MODEL],
});

/** Anything that isn't a page or the worker (the API's JSON, styles, images, a 404): it may run nothing at all. */
export const NOTHING_POLICY = "default-src 'none'; frame-ancestors 'none'";

/** Which policy a response gets, by its path and content type. */
export function policyFor(path: string, contentType: string, hashes: readonly string[]): string {
  if (/^text\/html\b/i.test(contentType)) return pagePolicy(hashes);
  if (/^\/assets\/[^/]*\.worker-[^/]+\.js$/.test(path)) return WORKER_POLICY;
  return NOTHING_POLICY;
}
