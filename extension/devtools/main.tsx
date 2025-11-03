import React from "react";
import { createRoot } from "react-dom/client";
import DevPanel from "./DevPanel";

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<DevPanel />);
}

