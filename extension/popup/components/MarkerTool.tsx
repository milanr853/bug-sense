import React from "react";

export default function MarkerTool() {
  const handleActivateMarker = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) return;

    chrome.tabs.sendMessage(tab.id, { action: "ACTIVATE_MARKER_ONLY" });
  };

  return (
    <div>
      <button
        onClick={handleActivateMarker}
        className="w-full bg-purple-500 text-white py-2 rounded-lg hover:bg-purple-600"
      >
        🖊️ Marker Tool
      </button>
    </div>
  );
}

