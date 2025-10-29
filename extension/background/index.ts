// extension/background/index.ts
// Background service worker for Bug Sense (Manifest V3)
// Handles background tabCapture recording and opens persistent recorder window when needed.

type Msg =
  | { action: "START_RECORDING" }
  | { action: "STOP_RECORDING" }
  | { action: "OPEN_GIF_UPLOADER" }
  | { action: "OPEN_RECORDER_WINDOW" };

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: BlobPart[] = [];
let activeStream: MediaStream | null = null;
const lastSavedUrlKey = "recordedVideo";

function setRecordingFlag(on: boolean) {
  chrome.storage.local.set({ isRecording: on }).catch(() => { });
}

function saveBlobUrlToStorage(key: string, url: string) {
  chrome.storage.local.get([key], (data) => {
    const prev = data?.[key];
    if (prev && typeof prev === "string") {
      try {
        URL.revokeObjectURL(prev);
      } catch { }
    }
    chrome.storage.local.set({ [key]: url }).catch(() => { });
  });
}

function finalizeRecording() {
  try {
    if (recordedChunks.length > 0) {
      const blob = new Blob(recordedChunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      saveBlobUrlToStorage(lastSavedUrlKey, url);
    }
  } catch (err) {
    console.error("finalizeRecording error:", err);
  } finally {
    try {
      activeStream?.getTracks().forEach((t) => t.stop());
    } catch { }
    recordedChunks = [];
    mediaRecorder = null;
    activeStream = null;
    setRecordingFlag(false);
  }
}

// Try background tab capture
function tryTabCapture(): Promise<MediaStream | null> {
  return new Promise((resolve) => {
    try {
      const tc: any = (chrome as any).tabCapture;
      if (!tc || typeof tc.capture !== "function") return resolve(null);

      tc.capture({ video: true, audio: false }, (stream: MediaStream | undefined) => {
        if (!stream) {
          console.warn("tabCapture failed:", chrome.runtime.lastError?.message);
          resolve(null);
          return;
        }
        resolve(stream);
      });
    } catch (err) {
      console.warn("tryTabCapture threw:", err);
      resolve(null);
    }
  });
}

console.log("[BugSense Background] Service worker active ✅");

chrome.runtime.onMessage.addListener((msg: Msg, sender, sendResponse) => {
  (async () => {
    try {
      // ====== START RECORDING ======
      if (msg.action === "START_RECORDING") {
        console.log("Background: START_RECORDING received");

        if (mediaRecorder && mediaRecorder.state === "recording") {
          sendResponse({ success: true, alreadyRecording: true });
          return;
        }

        const stream = await tryTabCapture();
        if (!stream) {
          console.warn("tabCapture unavailable -> use separate recorder window");
          sendResponse({ success: false, requireRecorderWindow: true });
          return;
        }

        activeStream = stream;
        recordedChunks = [];

        try {
          mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm" });
        } catch (err) {
          console.error("MediaRecorder init failed:", err);
          sendResponse({ success: false });
          return;
        }

        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) recordedChunks.push(e.data);
        };
        mediaRecorder.onstop = finalizeRecording;
        mediaRecorder.start();

        setRecordingFlag(true);
        console.log("Background: Recording started 🎥");
        sendResponse({ success: true });
        return;
      }

      // ====== STOP RECORDING ======
      if (msg.action === "STOP_RECORDING") {
        if (mediaRecorder && mediaRecorder.state === "recording") {
          console.log("Background: STOP_RECORDING triggered");
          mediaRecorder.stop();
          sendResponse({ success: true });
        } else {
          setRecordingFlag(false);
          sendResponse({ success: true, alreadyStopped: true });
        }
        return;
      }

      // ====== OPEN GIF UPLOADER ======
      if (msg.action === "OPEN_GIF_UPLOADER") {
        const url = chrome.runtime.getURL("extension/uploader.html");
        chrome.windows.create({ url, type: "popup", width: 660, height: 560 }, () => {
          sendResponse({ opened: true });
        });
        return;
      }

      // ====== OPEN RECORDER WINDOW ======
      if (msg.action === "OPEN_RECORDER_WINDOW") {
        const url = chrome.runtime.getURL("extension/recorder.html");
        chrome.windows.create({ url, type: "popup", width: 720, height: 520 }, () => {
          sendResponse({ opened: true });
        });
        return;
      }
    } catch (err) {
      console.error("Background error:", err);
      sendResponse({ success: false, error: String(err) });
    }
  })();

  return true;
});
