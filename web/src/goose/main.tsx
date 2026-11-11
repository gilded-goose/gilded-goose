// The Gilded Goose page (web/goose.html). No StrictMode: its double mount would spend the board's power-on flip.
import { createRoot } from "react-dom/client";
import "./tokens.css";
import "./board/board.css";
import "./goose.css";
import { App } from "./App.tsx";

createRoot(document.getElementById("root")!).render(<App />);
