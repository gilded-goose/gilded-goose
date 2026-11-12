// The home page, its sections in spec §6.1's order. Each section lives in its owner's file (plan: File structure).
import { Hero } from "./Hero.tsx";
import { Control } from "./Control.tsx";
import { Who } from "./Who.tsx";
import { How } from "./How.tsx";
import { TapPays } from "./TapPays.tsx";
import { Trick } from "./Trick.tsx";
import { Checked } from "./Checked.tsx";
import { Name } from "./Name.tsx";
import { BuildersTeaser } from "./BuildersTeaser.tsx";
import "./sections.css";

export function Home() {
  return (
    <>
      <Hero />
      <Control />
      <Who />
      <How />
      <TapPays />
      <Trick />
      <Checked />
      <Name />
      <BuildersTeaser />
    </>
  );
}
