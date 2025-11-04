import React from "react";
import ReactDOM from "react-dom/client";
import DevPanel from "./DevPanel";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <DevPanel />
  </React.StrictMode>
);

console.log("[BugSense] DevTools React app mounted ✅");
