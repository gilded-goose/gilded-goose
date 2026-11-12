// The wall's chunk: the built data (web/wall-data.ts) handed to its view. Proof.tsx loads this on the reader's press.
import data from "virtual:goose-wall";
import { WallView } from "./WallView.tsx";

export default function MissesWall() {
  return <WallView wall={data.wall} />;
}
