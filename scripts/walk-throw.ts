// The walks' one way to make a part of a built chunk throw (desk-walk.ts), so a fault a walk injects reaches the code the page runs.
// Rollup exports a part one of two ways, and which one depends on what else shares the chunk: by name (`ke as WeekPane`), or, when a
// chunk is both imported and lazy-loaded (Panes, once P's ping and F's watcher shared ping-notify), inside a frozen namespace object
// (`{__proto__:null,…,WeekPane:ke}`) that the lazy import reads. Push 4's walk only knew the first: nothing threw, and it judged an
// unbroken page. Both are swapped here, and the caller proves a swap happened before it judges anything.

/** Appended to a swapped chunk: the part every swap points at. */
export const THROWN = `\nfunction __thrown() { throw new Error("the walk's throw"); }`;

/** `code` with `part` swapped for `__thrown` in both export forms; unchanged when the chunk has neither (the caller fails on that). */
export function swapExport(code: string, part: string): string {
  return code
    .replace(new RegExp(`[\\w$]+ as ${part}\\b`), `__thrown as ${part}`)
    .replace(new RegExp(`(__proto__:null,[^}]*?\\b${part}:)[\\w$]+`), "$1__thrown");
}
