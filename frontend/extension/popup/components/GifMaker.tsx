import React, { useEffect, useState } from "react";
import DisplayButton from "../../components/DisplayButton";

export default function GifMaker() {
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    chrome.storage.local.get("generatedGifFromUploader", (data) => {
      if (data.generatedGifFromUploader) setGifUrl(data.generatedGifFromUploader);
    });

    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.generatedGifFromUploader) {
        setGifUrl(changes.generatedGifFromUploader.newValue);
        setProcessing(false);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const openUploader = () => {
    setProcessing(true);
    chrome.runtime.sendMessage({ action: "OPEN_GIF_UPLOADER" }, (resp) => {
      // uploader window opened
    });
  };

  const downloadGif = () => {
    if (!gifUrl) return;
    const a = document.createElement("a");
    a.href = gifUrl;
    a.download = `bug-sense-gif-${Date.now()}.gif`;
    a.click();
  };

  return (
    <div className="space-y-2">
      <DisplayButton name={processing ? "Processing..." : "🔁 Select & Convert Recording"} onClick={() => openUploader()} color="purple" disable={processing} />

      {gifUrl && (
        <div>
          <img src={gifUrl} alt="GIF" className="w-full rounded mt-2" />
          <button onClick={downloadGif} className="mt-2 w-full bg-green-500 text-white py-2 rounded">
            ⬇️ Download GIF
          </button>
        </div>
      )}
    </div>
  );
}

