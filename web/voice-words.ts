// The speech worker's word list (029), read when the page is built: a Vite plugin serves `virtual:goose-voice-words`,
// the finished Whisper prompt from core's catalog items (core/src/ask/voice-words.ts). Only the one string
// goes into the worker, never the modules it is built from.

import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { voicePrompt } from "../core/src/ask/voice-words.ts";

const ID = "virtual:goose-voice-words";

export function voiceWords(): Plugin {
  return {
    name: "goose-voice-words",
    resolveId: (id) => (id === ID ? `\0${ID}` : null),
    load(id) {
      if (id !== `\0${ID}`) return null;
      for (const f of ["shops.ts", "voice-words.ts"]) this.addWatchFile(fileURLToPath(new URL(`../core/src/ask/${f}`, import.meta.url)));
      return `export default ${JSON.stringify(voicePrompt())};`;
    },
  };
}
