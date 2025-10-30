// RecorderTool.tsx
import React, { useEffect, useState } from "react";

/**
 * RecorderTool — simplified popup controller.
 * The recording runs fully inside a separate persistent window (recorder.html).
 * The popup only launches that window — no stop logic or preview here.
 *
 * Change requested:
 *  - When recording is active, show "Processing..." on the Start button (green),
 *    instead of a long red status line. Disable the button while processing.
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
    // Ask background to start recording. Background may reply:
    //  - { success: true }         => background started recording
    //  - { requireRecorderWindow }  => popup should open recorder window (getDisplayMedia there)
    //  - { success: false, error }  => failure
    chrome.runtime.sendMessage({ action: "START_RECORDING" }, (resp) => {
      if (chrome.runtime.lastError) {
        console.error("Error starting recording:", chrome.runtime.lastError);
        alert("Failed to start recording.");
        return;
      }

      if (resp?.requireRecorderWindow) {
        // Background asked us to open the separate recorder window (fallback flow)
        // Background handler should implement OPEN_RECORDER_WINDOW
        chrome.runtime.sendMessage({ action: "OPEN_RECORDER_WINDOW" });
        return;
      }

      if (resp?.success) {
        // background-based recording started; set flag so main UI shows "Processing..."
        setIsRecording(true);
        try {
          chrome.storage.local.set({ isRecording: true });
        } catch { }
      } else {
        console.error("Could not start recording:", resp);
        alert("Could not start recording. Please retry.");
      }
    });
  };

  return (
    <div className="space-y-3 text-center">
      {/* Start Recording (remains green). When isRecording === true it shows "Processing..." and is disabled. */}
      <button
        onClick={startRecording}
        disabled={isRecording}
        className={`w-full ${isRecording ? "bg-green-400 cursor-not-allowed" : "bg-green-500 hover:bg-green-600"
          } text-white py-2 rounded-lg transition`}
      >
        {isRecording ? "Processing..." : "🎥 Start Recording"}
      </button>

      {/* No long red line in main UI anymore — GIF and recording both use "Processing..." on button */}
    </div>
  );
}
