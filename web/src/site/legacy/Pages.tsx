// The haggle, How it works and the Christmas list as pages of this site. Each is the Desk's own component, mounted in a Room.
import { lazyPage } from "../ui/lazy-page.tsx";
import { Room } from "./Room.tsx";

const Haggle = lazyPage(() => import("../../Haggle.tsx"));
const How = lazyPage(() => import("../../how/How.tsx"));
const List = lazyPage(() => import("../../list/List.tsx"));
const Market = lazyPage(() => import("../../StoreSync.tsx"));

export const HagglePage = () => (
  <Room title="The haggle" lede="The recorded week's haggle as a price ladder, round by round. Goose counters in plain code; a seller's note never reaches the AI.">
    <Haggle />
  </Room>
);

export const HowPage = () => (
  <Room title="How it works" lede="You, Goose, the Watcher, the guard and PayPal, one sentence each, each with the file that does it.">
    <How />
  </Room>
);

export const ListPage = () => (
  <Room title="Your Christmas list" lede="Gifts under one total the guard won't let a cart pass, with Goose's Buy now, Wait or Skip on each, on prices labeled simulated.">
    <List />
  </Room>
);

export const MarketPage = () => (
  <Room title="A fictional market" lede="Search, cart, complete: modeled on PayPal Store Sync's published cart flow. Not connected to Store Sync, and nothing real is bought.">
    <Market />
  </Room>
);
