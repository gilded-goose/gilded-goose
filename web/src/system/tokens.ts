// The living design system's reader (Track SYS, launch program): tokens.css parsed as text, so the page draws every
// token from the file itself and can never drift from it. Pure: no DOM, no Vite, so core's tests and check-claims read
// the same function the page does.
//
//   parseTokens(css)   the top-level rules that declare custom properties, each with its selector and its tokens
//   tokenSets(css)     the four blocks the brand names: shared, Velvet, Midnight and Midnight's glass
//   contrast(fg, bg)   WCAG 2 contrast of a colour over a solid one (an rgba colour is laid over it first)

export interface Token { name: string; value: string }
export interface Rule { selector: string; tokens: Token[] }

/** Top-level rules only: anything inside @media, @supports or @font-face is a variant of a value, not a token. */
export function parseTokens(css: string): Rule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Rule[] = [];
  let depth = 0, start = 0, head = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "{") {
      if (depth === 0) { head = src.slice(start, i).trim(); start = i + 1; }
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) {
        const body = src.slice(start, i);
        start = i + 1;
        if (head.startsWith("@")) continue;
        const tokens = [...body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => ({ name: m[1]!, value: m[2]!.trim().replace(/\s+/g, " ") }));
        if (tokens.length) out.push({ selector: head.replace(/\s+/g, " "), tokens });
      }
    }
  }
  return out;
}

export interface TokenSets { shared: Token[]; velvet: Token[]; midnight: Token[]; midnightGlass: Token[] }

/** The four blocks tokens.css says it has, found by what their selectors name. Throws if one is missing. */
export function tokenSets(css: string): TokenSets {
  const rules = parseTokens(css);
  const find = (what: string, test: (s: string) => boolean) => {
    const r = rules.find((x) => test(x.selector));
    if (!r) throw new Error(`tokens.css: no ${what} block`);
    return r.tokens;
  };
  return {
    shared: find("shared", (s) => s.startsWith("#dk-case")),
    velvet: find("Velvet", (s) => s.startsWith('.dk[data-palette="v"]')),
    midnight: find("Midnight", (s) => s.startsWith('.dk[data-palette="c"], .dk[data-palette="midnight"]') && !s.includes(".gn[")),
    midnightGlass: find("Midnight glass", (s) => s.includes('.gn[data-room="back"]')),
  };
}

/** Every token name, once, across the four blocks, in file order. */
export const allTokenNames = (s: TokenSets): string[] => [...new Set([...s.shared, ...s.velvet, ...s.midnight, ...s.midnightGlass].map((t) => t.name))];

/** A colour token's value as [r, g, b, a], or null when it isn't one plain colour (a gradient, a shadow, `none`). */
export function rgba(value: string): [number, number, number, number] | null {
  const v = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const h = hex[1]!.length === 3 ? [...hex[1]!].map((c) => c + c).join("") : hex[1]!;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  const fn = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(v);
  if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3]), fn[4] === undefined ? 1 : Number(fn[4])];
  return null;
}

/** A colour laid over a solid one (alpha compositing). */
export function over(fg: readonly number[], bg: readonly number[]): [number, number, number] {
  const a = fg[3] ?? 1;
  return [0, 1, 2].map((i) => Math.round(fg[i]! * a + bg[i]! * (1 - a))) as [number, number, number];
}

const lum = (c: readonly number[]) => {
  const ch = c.slice(0, 3).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
};

/** WCAG 2 contrast ratio of `fg` (laid over `bg` if it has alpha) against the solid `bg`, to one decimal place. */
export function contrast(fg: string, bg: string): number | null {
  const f = rgba(fg), b = rgba(bg);
  if (!f || !b) return null;
  const top = over(f, b);
  const [hi, lo] = [lum(top), lum(b)].sort((x, y) => y - x) as [number, number];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 10) / 10;
}

/** A token's value in a palette, following `var(--x)` once within the same set (e.g. `--glass-light: var(--egg-light)`). */
export function valueOf(set: readonly Token[], name: string): string | undefined {
  const v = set.find((t) => t.name === name)?.value;
  const ref = v && /^var\((--[a-z0-9-]+)\)$/.exec(v);
  return ref ? set.find((t) => t.name === ref[1])?.value ?? v : v;
}

/** The families the page draws the shared tokens in, by name. Anything unmatched lands in "other", so none is lost. */
export type Family = "type" | "space" | "frame" | "radius" | "shadow" | "motion" | "light" | "other";
export function familyOf(name: string): Family {
  if (/^--(face|display|t-|w-(display|head|body|strong)$|track-|lh-)/.test(name)) return "type";
  if (/^--s-\d+$/.test(name)) return "space";
  if (/^--(w-page|w-wide|gutter|nav-h|section)/.test(name)) return "frame";
  if (/^--(r-|hair$)/.test(name)) return "radius";
  if (/^--elev-/.test(name)) return "shadow";
  if (/^--(ease|spring|d-\d)$/.test(name)) return "motion";
  if (/^--egg-at$/.test(name)) return "light";
  return "other";
}

/** The text roles: each is measured against the page and the card (the backgrounds it is drawn on). */
export const TEXT_ROLES = ["--ink", "--ink-2", "--ink-3", "--gold", "--gold-hi", "--red", "--tag-ink", "--focus"] as const;

/** A cubic-bezier token's four numbers, or null. */
export function bezier(value: string): [number, number, number, number] | null {
  const m = /^cubic-bezier\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)$/.exec(value);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] : null;
}
