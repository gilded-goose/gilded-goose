// Track V (029): the dev-only stage for HoldToTalk (web/mic-demo.html; not built). It wires the button the way the
// Desk will: the words land in the box, and nothing is sent until the shopper presses the arrow.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { HoldToTalk } from "./HoldToTalk";
import { micWords, type MicState } from "./mic";

function Demo() {
  const [words, setWords] = useState("");
  const [line, setLine] = useState("");
  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <input aria-label="Ask for anything" placeholder="Ask for anything" value={words} maxLength={80} onChange={(e) => setWords(e.target.value)} />
      <HoldToTalk className="mic" onText={(said) => setWords((w) => `${w} ${said}`.trim().slice(0, 80))} onState={(s: MicState) => setLine(micWords(s))}>🎤</HoldToTalk>
      <p id="line">{line}</p>
    </form>
  );
}
createRoot(document.getElementById("root")!).render(<Demo />);
