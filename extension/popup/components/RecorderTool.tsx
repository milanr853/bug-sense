import React, { useEffect, useState } from "react";

export default function RecorderTool() {
  const [recording, setRecording] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    chrome.storage.local.get(["isRecording", "recordedVideo"], (data) => {
      if (data.isRecording) setRecording(true);
      if (data.recordedVideo) setVideoUrl(data.recordedVideo);
    });

    const listener = (
      changes: Record<string, chrome.storage.StorageChange>
    ) => {
      if (changes.isRecording) {
        setRecording(changes.isRecording.newValue);
      }
      if (changes.recordedVideo) {
        setVideoUrl(changes.recordedVideo.newValue);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const startRecording = () => {
    chrome.runtime.sendMessage({ action: "START_RECORDING" });
  };

  const stopRecording = () => {
    chrome.runtime.sendMessage({ action: "STOP_RECORDING" });
    setRecording(false);
  };

  const downloadRecording = () => {
    if (!videoUrl) return;
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `bug-sense-${Date.now()}.webm`;
    a.click();
  };

  return (
    <div className="space-y-3">
      {recording && (
        <div className="text-center text-red-600 font-semibold">
          🔴 Recording in Progress
        </div>
      )}

      <button
        onClick={recording ? stopRecording : startRecording}
        className={`w-full ${recording ? "bg-red-500" : "bg-green-500"
          } text-white py-2 rounded-lg hover:opacity-90`}
      >
        {recording ? "⏹ Stop Recording" : "🎥 Start Recording"}
      </button>

      {videoUrl && (
        <div className="text-center mt-3">
          <video src={videoUrl} controls className="rounded-lg shadow-md w-full max-h-48" />
          <button
            onClick={downloadRecording}
            className="mt-2 bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
          >
            💾 Download
          </button>
        </div>
      )}
    </div>
  );
}
