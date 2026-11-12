// A chunk that never arrives (a dropped connection, or a deploy that replaced the file) must not blank the site: React
// unmounts the whole tree when a lazy throws. Every lazy in the site goes through lazyPage, which draws PageLost instead.
import { lazy, type ComponentType } from "react";
import { Button } from "./Button.tsx";

export function PageLost() {
  return (
    <div className="wrap page-pending" role="alert">
      <h1>This page didn't load</h1>
      <p className="lede">Your connection may have dropped. Nothing was paid. Reload to try again.</p>
      <p><Button tone="ink" onClick={() => location.reload()}>Reload</Button></p>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>, lost: ComponentType = PageLost) {
  return lazy(() => load().catch(() => ({ default: lost as unknown as T })));
}
