// The landing's recorded week, read when the page is built (Track P, Fri Nov 6; Round 6b Motion at 390). Story.tsx used to
// call `scrollStory()` as its chunk loaded, and that runs the Watcher's rules on every seller in the week. The rules' first
// run is their slowest (each pattern is compiled on first use): 386 ms of one long task on a 4x phone, before the opening's
// first frames (the scorecard's 408 ms), against 2 ms once warm. A Vite plugin serves `virtual:goose-story` instead: the
// same `scrollStory()` and `weekMoments()`, run by the build, so every verdict and figure is still the code's answer today,
// never typed (T's threat-week.ts does the same for the board's seeded week). core/test/story-cold.test.ts proves the
// built copy equals a fresh run, and that no page runs the Watcher at module scope.

import type { Plugin } from "vite";
import { scrollStory, weekMoments } from "../core/src/view/scroll.ts";

const ID = "virtual:goose-story";

export function builtStory() {
  const story = scrollStory();
  return { story, week: weekMoments(story) };
}

export function storyData(): Plugin {
  return {
    name: "goose-story",
    resolveId: (id) => (id === ID ? `\0${ID}` : null),
    load: (id) => (id === `\0${ID}` ? `export default ${JSON.stringify(builtStory())};` : null),
  };
}
