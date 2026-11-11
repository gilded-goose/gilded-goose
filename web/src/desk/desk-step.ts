// The rule behind the Desk's Back (desk-history.ts), apart from the browser so core's tests can hold it.

export type Place = string | null;
export interface Entry { dk: Place; below: Place[] }

const isRoom = (p: Place) => p !== null && p !== "run" && p !== "sheet";

/** How history moves when the page goes from `cur` to `place`; null when it's already there (a Back did this). */
export function step(cur: Entry, place: Place): { go: number } | { push: Entry } | { replace: Entry } | null {
  if (cur.dk === place) return null;
  const under = cur.below.lastIndexOf(place);
  if (under >= 0) return { go: under - cur.below.length };
  if (isRoom(cur.dk) && isRoom(place)) return { replace: { dk: place, below: cur.below } }; // Back from any room goes to where the rooms began
  if (place === null) return { replace: { dk: null, below: [] } };
  return { push: { dk: place, below: [...cur.below, cur.dk] } };
}
