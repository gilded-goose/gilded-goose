// GSAP, fetched after the first screen paints (the Nov 11 speed gate: the white site may not be slower than the old one,
// and GSAP's ~80 KB never rides in goose.html's first-screen chunk). Both home scenes share this one promise, so the
// library is fetched once. The scenes render their markup without it and stay armed (hidden) until their timeline exists;
// if the fetch fails they show their settled state instead.
import type { gsap as Gsap } from "gsap";

export type Motion = {
  gsap: typeof Gsap;
  ease: { out: string; inOut: string; drawer: string };
};

let loading: Promise<Motion> | null = null;

export function loadMotion(): Promise<Motion> {
  loading ??= Promise.all([import("gsap"), import("gsap/CustomEase")]).then(([g, c]) => {
    const gsap = g.gsap;
    gsap.registerPlugin(c.CustomEase);
    // The site's three curves (tokens.css), so the timelines move the way every CSS transition does.
    c.CustomEase.create("goose-out", "0.16,1,0.3,1");
    c.CustomEase.create("goose-in-out", "0.77,0,0.175,1");
    c.CustomEase.create("goose-drawer", "0.32,0.72,0,1");
    return { gsap, ease: { out: "goose-out", inOut: "goose-in-out", drawer: "goose-drawer" } };
  });
  loading.catch(() => { loading = null; });
  return loading;
}
