import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { proofData } from "./proof-data.ts";
import { voiceWords } from "./voice-words.ts";
import { studioLicenceFacts } from "./studio-licence.ts";
import { STUDIO_DEFAULT, studioUntil } from "../core/src/view/studio-gate.ts";
import { threatWeek } from "./threat-week.ts";
import { storyData } from "./story-data.ts";
import { leanHtmlPlugin } from "./lean-html.ts";
import { postman } from "./postman.ts";
import { fingerprintRecipe } from "./fingerprint-recipe.ts";
import { kettleData } from "./kettle-data.ts";
import { wallData } from "./wall-data.ts";
import { ownCopy } from "./own-copy.ts";
import { REPO, REPO_PUBLIC, SITE } from "./src/brand/meta.ts";

function flipRehearsal(): boolean {
  if (process.env.GOOSE_FLIP_REHEARSAL !== "1") return false;
  if (process.env.RENDER) throw new Error("GOOSE_FLIP_REHEARSAL is for a local build: it pretends to have a licence");
  return true;
}

// Proof's wall (web/src/site/proof/MissesWall.tsx): everything its chunk imports is already on the Proof page that opens it,
// and its styles ride inside it, so a preload list for it would only cost Proof's first load the list's bytes (about 190 B).
const NO_PRELOAD = /^assets\/MissesWall-/;

// The front end is a static site (never sleeps). In dev, /api goes to the Hono server.
// GOOSE_BASE is set only by the GitHub Pages mirror (H5), which serves the site under /gilded-goose/; links are relative.
export default defineConfig(({ mode }) => {
  // One read of the key, so the facts the gate reads and the key AG is handed can never come from two places: a key the
  // gate believes in that never reached the bundle would put AG's mark on the public site. A rehearsal has no key at all.
  const root = fileURLToPath(new URL("..", import.meta.url));
  const studioKey = flipRehearsal() ? "" : process.env.VITE_AG_STUDIO_LICENSE ?? loadEnv(mode, root, "VITE_").VITE_AG_STUDIO_LICENSE ?? "";
  const studioFacts = flipRehearsal() ? { valid: true, missing: false, expiry: process.env.GOOSE_STUDIO_EXPIRY || "2099-12-31", expired: false, isTrial: true } : studioLicenceFacts(studioKey);
  return {
  base: process.env.GOOSE_BASE ?? "/",
  plugins: [ownCopy(), react(), proofData(), voiceWords(), threatWeek(), storyData(), kettleData(), fingerprintRecipe(), wallData(), leanHtmlPlugin(), postman()],
  // The AG Studio licence's facts (never the key), from AG's own licence manager at build time (044 §2): the page's
  // gate reads them to choose Studio or today's Community ledger without loading Studio's chunk to ask. The key comes
  // from the shell or the repo's .env files (`VITE_AG_STUDIO_LICENSE`; Render sets the same name).
  // `GOOSE_FLIP_REHEARSAL=1` (scripts/studio-flip-rehearsal.ts, a local build only, refused on the host): the flip on and a
  // pretend good licence, so the day's flip can be walked with no key. AG still sees no key and says so on screen.
  define: {
    // A rehearsal's printed date is 2099 unless the walk names one, in the words AG prints, so a cut-over can be walked on the day's own date.
    __AG_STUDIO_LICENCE__: JSON.stringify(studioFacts),
    __STUDIO_UNTIL__: JSON.stringify(studioUntil(studioFacts, STUDIO_DEFAULT || flipRehearsal())),
    __STUDIO_BY_DEFAULT__: JSON.stringify(STUDIO_DEFAULT || flipRehearsal()),
    "import.meta.env.VITE_AG_STUDIO_LICENSE": JSON.stringify(studioKey),
    // The repo and the live site, as strings in the page, so no page loads meta.ts's module for them (src/brand/links.d.ts).
    __GOOSE_REPO__: JSON.stringify(REPO),
    __GOOSE_REPO_PUBLIC__: JSON.stringify(REPO_PUBLIC),
    __GOOSE_SITE__: JSON.stringify(SITE),
  },
  server: { port: 5173, proxy: { "/api": "http://localhost:8787" } },
  // W4: a fourth, 404.html, the page any unknown path answers with (server/src/main.ts).
  // Two pages: the demo, and "See how it keeps you safe" one tap away (5b, 018 N20). A third, unlinked: the on-device
  // mic test (/voice-test-2, 029), whose speech library and worker are their own chunks, fetched on the first press.
  // Track W commit 4 (Track B's phone measurement): a page's <head> modulepreloads no JS. On a 1.6 Mbps phone those
  // preloads (React DOM's chunk, then the nav's lanes/scenario/local, ~75 KB gz) shared the link with the blocking
  // stylesheets and pushed the first paint back; the wallet's and the case's first screens are HTML and CSS, and main.js
  // still imports every chunk itself. Measured (PROFILE=mobile, vite preview): wallet 1042 -> 667 ms p95, the case
  // 663 -> 521 ms, the Desk's hero unchanged. Dynamic imports keep their preloads; prerender.ts checks the head has none.
  // Try the guard (site Builders, Nov 11): its chunk is asked for when its room nears the screen, and a list of files to preload
  // with it is a table in the Builders page's own first load (about 200 B). None is listed: the browser finds the chunk's few
  // imports itself (React and the stamp's words, already loaded), and its styles ride in its own JS.
  // `manifest`: prerender.ts reads the Desk chunk's files from it (to start them after main.css, commit 7), then deletes it.
  build: { target: "es2022", sourcemap: false, manifest: true, modulePreload: { resolveDependencies: (file, deps, { hostType }) => (hostType === "html" || NO_PRELOAD.test(file) ? [] : /TryGuard-/.test(file) ? [] : deps) }, rollupOptions: { input: { main: fileURLToPath(new URL("index.html", import.meta.url)), safe: fileURLToPath(new URL("safe.html", import.meta.url)), voice: fileURLToPath(new URL("voice-test-2.html", import.meta.url)), notfound: fileURLToPath(new URL("404.html", import.meta.url)), goose: fileURLToPath(new URL("goose.html", import.meta.url)) } } },
  // The Whisper worker is an ES module, so the speech library can split inside it (029). Its bundle has its own plugins:
  // the word list it primes Whisper with (web/voice-words.ts).
  worker: { format: "es", plugins: () => [voiceWords()] },
  // Dev only: Vite's pre-bundle would move transformers.js away from ONNX Runtime's .wasm files, which it finds next to
  // itself (`new URL(…, import.meta.url)`), so the mic would fail in `vite` dev. Builds are unaffected.
  optimizeDeps: { exclude: ["@huggingface/transformers"] },
  };
});
