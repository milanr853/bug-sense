import React, { useState } from "react";

export default function ScreenshotTool() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  const captureScreenshot = async () => {
    try {
      setCapturing(true);
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) throw new Error("No active tab found");

      // Capture the current tab
      const image = await chrome.tabs.captureVisibleTab(tab.windowId!, { format: "png" });
      setImageUrl(image);
      setCapturing(false);
    } catch (err) {
      console.error("Screenshot failed:", err);
      setCapturing(false);
    }
  };

  const downloadScreenshot = () => {
    if (!imageUrl) return;
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = `bug-sense-screenshot-${Date.now()}.png`;
    a.click();
  };

  return (
    <div className="space-y-2">
      <button
        onClick={captureScreenshot}
        disabled={capturing}
        className={`w-full ${capturing ? "bg-gray-400" : "bg-blue-500 hover:bg-blue-600"
          } text-white py-2 rounded-lg`}
      >
        {capturing ? "Capturing..." : "📸 Take Screenshot"}
      </button>

      {imageUrl && (
        <div className="mt-3 text-center">
          <img
            src={imageUrl}
            alt="Screenshot preview"
            className="rounded shadow-md mb-2 max-h-40 mx-auto"
          />
          <div className="flex justify-center space-x-2">
            <button
              onClick={downloadScreenshot}
              className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded"
            >
              💾 Download
            </button>
            <button
              onClick={() => {
                chrome.runtime.sendMessage({
                  action: "OPEN_MARKER_TOOL",
                  data: imageUrl,
                });
              }}
              className="bg-purple-500 hover:bg-purple-600 text-white px-3 py-1 rounded"
            >
              ✏️ Annotate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

