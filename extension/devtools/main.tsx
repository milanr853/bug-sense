import React from "react";
import ReactDOM from "react-dom/client";
import DevPanel from "./DevPanel";

import { initAI } from "../ai/analyze";

initAI().then(() => console.log("[BugSense AI] model ready ✅"));


ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <DevPanel />
  </React.StrictMode>
);

console.log("[BugSense] DevTools React app mounted ✅");
