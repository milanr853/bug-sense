// extension/popup/components/ScreenshotTool.tsx
import React, { useEffect, useState } from "react";
import DisplayButton from "../../components/DisplayButton";

export default function ScreenshotTool({
  onAnnotate,
}: {
  onAnnotate?: (img: string) => void;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [fullKey, setFullKey] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (imageUrl && imageUrl.startsWith("blob:")) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const captureScreenshot = () => {
    if (capturing) return;
    setCapturing(true);

    chrome.runtime.sendMessage({ action: "TAKE_SCREENSHOT" }, (resp) => {
      if (chrome.runtime.lastError) {
        console.error("Screenshot message failed:", chrome.runtime.lastError);
        setCapturing(false);
        return;
      }

      if (resp?.success) {
        setImageUrl(resp.preview);
        setFullKey(resp.fullKey);
        setFilename(resp.filename || null);
        console.log("[BugSense] Screenshot preview ready ✅");
      } else {
        console.error("Screenshot failed:", resp?.error);
      }

      setCapturing(false);
    });
  };

  const downloadScreenshot = () => {
    if (!fullKey) return;
    chrome.runtime.sendMessage(
      { action: "DOWNLOAD_FULL_SCREENSHOT", fullKey },
      (resp) => {
        if (chrome.runtime.lastError) {
          console.error("Download message failed:", chrome.runtime.lastError);
          return;
        }
        if (!resp?.success) console.error("Download failed:", resp?.error);
        else console.log("Download started:", resp.downloadId);
      }
    );
  };

  return (
    <div className="space-y-3">
      <DisplayButton name={capturing ? "Capturing..." : "📸 Take Screenshot"} onClick={() => captureScreenshot()} color="dark" disable={capturing} />

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
              💾 Download Full
            </button>
            <button
              onClick={() => onAnnotate?.(imageUrl)}
              className="bg-purple-500 hover:bg-purple-600 text-white px-3 py-1 rounded"
            >
              ✏️ Annotate
            </button>
          </div>
          {filename && <div className="text-xs text-gray-500 mt-1">{filename}</div>}
        </div>
      )}
    </div>
  );
}
