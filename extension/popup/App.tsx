import React from "react";
import Header from "./components/Header";
import ScreenshotTool from "./components/ScreenshotTool";
import RecorderTool from "./components/RecorderTool";
import MarkerTool from "./components/MarkerTool";
import GifMaker from "./components/GifMaker";

export default function App() {
  const analyzeSheet = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        alert("No active tab found");
        return;
      }

      // Send a message to the content script to analyze the visible Google Sheet
      chrome.tabs.sendMessage(tab.id, { action: "ANALYZE_SHEET" }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Analyze message error:", chrome.runtime.lastError);
          alert("Failed to send analyze request to the page.\nMake sure the page is a Google Sheet and the content scripts are active.");
          return;
        }
        if (!response) {
          alert("No response from page. The sheet analyzer might not be injected yet.");
          return;
        }
        if (!response.ok) {
          alert("Sheet analysis failed: " + (response.error || "unknown error"));
          return;
        }
        // Simple ack (detailed results appear in the sheet overlay)
        alert("Sheet analysis started — results should appear on the sheet (overlay).");
      });
    } catch (err) {
      console.error("Analyze Sheet failed:", err);
      alert("Analyze Sheet failed: " + (err as any).message);
    }
  };

  return (
    <div className="w-80 p-4 bg-white rounded-lg shadow-lg">
      <Header />
      <div className="mt-4 space-y-3">
        <ScreenshotTool />
        <RecorderTool />
        <MarkerTool />
        <GifMaker />
        <div>
          <button
            onClick={analyzeSheet}
            className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700"
          >
            🧠 Analyze Sheet
          </button>
        </div>
      </div>
    </div>
  );
}

