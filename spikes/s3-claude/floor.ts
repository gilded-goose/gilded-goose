// S3 follow-up: where does Haiku's latency come from? Floor (1-token reply), the
// buyer call at effort low, and streaming time-to-first-token. Prints numbers only.
//   node --env-file=.env spikes/s3-claude/floor.ts
import Anthropic from "../../server/node_modules/@anthropic-ai/sdk/index.js";
const c = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY!, maxRetries: 0 });
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!; };
const sum = (name: string, xs: number[]) => console.log(name, { n: xs.length, p50: pct(xs, 50), p95: pct(xs, 95), max: Math.max(...xs) });
const floor: number[] = [];
for (let i = 0; i < 12; i++) {
  const t0 = performance.now();
  await c.messages.create({ model: "claude-haiku-5-5", max_tokens: 5, thinking: { type: "disabled" }, messages: [{ role: "user", content: "Say ok." }] });
  floor.push(Math.round(performance.now() - t0));
}
sum("floor (tiny reply, thinking off)", floor);
const low: number[] = [];
for (let i = 0; i < 12; i++) {
  const t0 = performance.now();
  await c.messages.create({ model: "claude-haiku-5-5", max_tokens: 5, thinking: { type: "disabled" }, output_config: { effort: "low" }, messages: [{ role: "user", content: "Say ok." }] });
  low.push(Math.round(performance.now() - t0));
}
sum("floor, effort low", low);
