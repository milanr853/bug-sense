import React, { useState } from "react";

export default function ScreenshotTool() {
  const [capturing, setCapturing] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);

  const handleScreenshot = async () => {
    setCapturing(true);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) return;

      const screenshotDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: "png",
      });

      setScreenshot(screenshotDataUrl);
      // Send the screenshot data to the content script for annotation
      chrome.tabs.sendMessage(tab.id, {
        action: "SHOW_MARKER_TOOL",
        image: screenshotDataUrl,
      });
    } catch (error) {
      console.error("Screenshot capture failed:", error);
    } finally {
      setCapturing(false);
    }
  };

  return (
    <div className="w-full">
      <button
        onClick={handleScreenshot}
        disabled={capturing}
        className={`w-full py-2 rounded-lg text-white ${capturing ? "bg-gray-400" : "bg-blue-500 hover:bg-blue-600"
          }`}
      >
        {capturing ? "Capturing..." : "📸 Take Screenshot"}
      </button>

      {screenshot && (
        <div className="mt-3 text-xs text-gray-500 text-center">
          Screenshot captured & sent for annotation
        </div>
      )}
    </div>
  );
}

