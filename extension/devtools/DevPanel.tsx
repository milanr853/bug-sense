import React from "react";
import ReactDOM from "react-dom/client";

function DevPanel() {
  return (
    <div className="p-3 text-sm">
      <h2 className="text-lg font-bold">Bug Helper Dev Panel</h2>
      <p className="text-gray-300 mt-2">
        This panel will display real-time bug logs and console error captures.
      </p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<DevPanel />);

