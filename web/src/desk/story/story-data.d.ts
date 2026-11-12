// `virtual:goose-story` (web/story-data.ts): the landing's recorded week, `scrollStory()` and `weekMoments()` as the build ran them.
declare module "virtual:goose-story" {
  const built: { story: import("@goose/core/scroll").ScrollStory; week: import("@goose/core/scroll").WeekMoment[] };
  export default built;
}
