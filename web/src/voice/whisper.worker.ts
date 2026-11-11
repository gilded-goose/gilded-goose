// Voice on the device (029): Whisper in a Web Worker, so the page never freezes while it loads or listens.
// The audio arrives as a message from the page and the text goes back as a message; neither is sent or stored
// anywhere. The downloads are the model's files (from the model hub) and ONNX Runtime's WebAssembly (from our own
// origin, always; never jsDelivr, transformers.js's default); none of them carries audio or text. The
// browser's cache keeps those files, nothing else.
// The message logic (one model per page, the WebGPU → WebAssembly fallback) is `asrWorker` in core, tested there.

import { env, pipeline, type ProgressInfo, type Tensor } from "@huggingface/transformers";
import { PROMPT_TOKENS_MAX, asrWorker, type Asr, type Backend } from "@goose/core/ondevice";
import PROMPT from "virtual:goose-voice-words";
import { MODEL, type FromWorker, type ToWorker } from "./protocol";

// Weights come from the model hub only, never from a path on our own server.
env.allowLocalModels = false;

// ONNX Runtime from our own origin, always: transformers.js points it at jsDelivr unless told otherwise; with no path
// set, ONNX Runtime loads the copy Vite bundled next to this worker (dist/assets, content-hashed, served compressed),
// and the page's CSP allows no other (server/src/csp.ts). Set before the first model is made, the only time it's read.
delete env.backends.onnx.wasm!.wasmPaths;

const ctx = self as unknown as { postMessage(m: FromWorker): void; onmessage: ((e: MessageEvent<ToWorker>) => void) | null };

// WebGPU where the browser has a GPU adapter, else WebAssembly. Quantized weights: on WebGPU the encoder stays fp32
// and the decoder is 4-bit (the mix the iPhone ran in 0.42 s; an 8-bit decoder was twice as slow on the Mac); on
// WebAssembly both are 8-bit.
async function hasGpu(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try { return (await gpu.requestAdapter()) != null; } catch { return false; }
}

async function make(backend: Backend): Promise<Asr> {
  const asr = await pipeline("automatic-speech-recognition", MODEL, {
    device: backend,
    dtype: backend === "webgpu" ? { encoder_model: "fp32", decoder_model_merged: "q4" } : { encoder_model: "q8", decoder_model_merged: "q8" },
    progress_callback: (p: ProgressInfo) => { if (p.status === "progress_total") ctx.postMessage({ type: "progress", loaded: p.loaded, total: p.total }); },
  });
  // The word list (029): Whisper reads the demo's own item words as the text before the speech, so "toaster" or "Mossbell
  // Inn" is heard as spelled. Python's `prompt_ids` in token form, which transformers.js's generate takes as
  // `decoder_input_ids`: <|startofprev|> the words <|startoftranscript|> <|notimestamps|> (tiny.en has no language or task
  // token). The prompt's tokens are dropped from the answer, so only what was said comes back. The three ids come from
  // the model's own generation_config.json; a model without one gets no prompt rather than a broken prefix.
  const g = asr.model.generation_config as unknown as Record<"prev_sot_token_id" | "decoder_start_token_id" | "no_timestamps_token_id", unknown>;
  const ids = [g.prev_sot_token_id, g.decoder_start_token_id, g.no_timestamps_token_id];
  const words = asr.tokenizer.encode(` ${PROMPT}`, { add_special_tokens: false }).slice(0, PROMPT_TOKENS_MAX - 1); // the start: the catalog items come first
  const [prev, start, plain] = ids as number[];
  const prefix = ids.every((t) => typeof t === "number") ? [prev!, ...words, start!, plain!] : [start, plain].filter((t): t is number => typeof t === "number");
  // An Ask is a sentence, so 64 tokens is room to spare; the cap stops the loop Whisper can fall into on noise
  // ("fill up fill up…"), which otherwise runs to its 448-token limit and takes seconds.
  const run = async (audio: Float32Array) => {
    const { input_features } = await asr.processor(audio);
    const out = (await asr.model.generate({ inputs: input_features, decoder_input_ids: prefix, max_new_tokens: 64 })) as Tensor;
    const said = (out.tolist() as bigint[][])[0]!.slice(prefix.length).map(Number);
    return asr.tokenizer.decode(said, { skip_special_tokens: true }).trim();
  };
  // One second of silence warms it up (WebGPU compiles its shaders on the first run), so "ready" means ready, and a
  // GPU that loads the model but fails to run it falls back here too.
  try { await run(new Float32Array(16000)); } catch (e) { await asr.dispose().catch(() => undefined); throw e; }
  return { run, dispose: () => asr.dispose() };
}

const handle = asrWorker({ make, hasGpu, post: (m) => ctx.postMessage(m), now: () => performance.now() });
ctx.onmessage = (e) => void handle(e.data);
