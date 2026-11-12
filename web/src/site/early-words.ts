// What a visitor typed into the first paint's Ask box (site-paint.ts) before the app had loaded: main.tsx keeps it here
// before React replaces the paint, and the home's AskBox starts from it, focused where she left it. Read by the first
// AskBox to mount (StrictMode calls its initializer twice, so reading never clears), then cleared by its effect.
let kept: { words: string; focused: boolean } | null = null;

export function keepEarlyWords(root: HTMLElement | null): void {
  const input = root?.querySelector<HTMLInputElement>(".ask-input");
  if (input && (input.value || document.activeElement === input)) kept = { words: input.value, focused: document.activeElement === input };
}

export const earlyWords = (): { words: string; focused: boolean } | null => kept;
export const clearEarlyWords = (): void => { kept = null; };
