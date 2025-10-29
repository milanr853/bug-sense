// RecorderTool.tsx
import React, { useEffect, useState } from "react";

/**
 * RecorderTool — simplified popup controller.
 * The recording runs fully inside a separate persistent window (recorder.html).
 * The popup only launches that window — no stop logic or preview here.
 */

export default function RecorderTool() {
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    // Load recording flag on mount
    chrome.storage.local.get(["isRecording"], (data) => {
      setIsRecording(Boolean(data?.isRecording));
    });

    // Watch for recording state updates
    const handleChange = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.isRecording) {
        setIsRecording(Boolean(changes.isRecording.newValue));
      }
    };

    chrome.storage.onChanged.addListener(handleChange);
    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, []);

  const startRecording = () => {
    chrome.runtime.sendMessage({ action: "START_RECORDING" }, (resp) => {
      if (chrome.runtime.lastError) {
        console.error("Error starting recording:", chrome.runtime.lastError);
        alert("Failed to start recording.");
        return;
      }

      if (resp?.requireRecorderWindow) {
        // Open the separate recorder window
        chrome.runtime.sendMessage({ action: "OPEN_RECORDER_WINDOW" });
        return;
      }

      if (resp?.success) {
        setIsRecording(true);
        chrome.storage.local.set({ isRecording: true });
      } else {
        alert("Could not start recording. Please retry.");
      }
    });
  };

  return (
    <div className="space-y-3 text-center">
      {/* Info Text */}
      {/* <div className="text-sm text-gray-600">
        Screen recording runs in a separate window.
      </div> */}

      {/* Start Recording (only) */}
      <button
        onClick={startRecording}
        className="w-full bg-green-500 hover:bg-green-600 text-white py-2 rounded-lg transition"
      >
        🎥 Start Recording
      </button>

      {/* Status indicator */}
      {isRecording && (
        <div className="text-xs text-red-600 font-medium">
          🔴 Recording in progress — check recorder window.
        </div>
      )}
    </div>
  );
}
