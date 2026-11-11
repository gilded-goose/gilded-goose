// Reduced motion as a live value: a visitor can flip the setting while the page is open.
import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

const subscribe = (on: () => void) => {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", on);
  return () => mq.removeEventListener("change", on);
};

export const prefersReducedMotion = (): boolean => typeof window !== "undefined" && window.matchMedia(QUERY).matches;

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}
