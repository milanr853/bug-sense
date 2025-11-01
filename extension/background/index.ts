// extension/background/index.ts
// Background service worker for Bug Sense (Manifest V3)
// Handles START/STOP recording (tabCapture), and handles one-shot CAPTURE_FRAME requests
// from content scripts to capture visible tab screenshot. Returns screenshot as data URL.

type Msg =
  | { action: "START_RECORDING" }
  | { action: "STOP_RECORDING" }
  | { action: "OPEN_GIF_UPLOADER" }
  | { action: "OPEN_RECORDER_WINDOW" }
  | { action: "CAPTURE_FRAME" };

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: BlobPart[] = [];
let activeStream: MediaStream | null = null;
const lastSavedUrlKey = "recordedVideo";

function setRecordingFlag(on: boolean) {
  try {
    chrome.storage.local.set({ isRecording: on });
  } catch (e) {
    // ignore
  }
}

function saveBlobUrlToStorage(key: string, url: string) {
  try {
    chrome.storage.local.get([key], (data) => {
      try {
        const prev = data?.[key];
        if (prev && typeof prev === "string") {
          try {
            URL.revokeObjectURL(prev);
          } catch { }
        }
      } catch { }
      try {
        chrome.storage.local.set({ [key]: url });
      } catch (err) {
        console.warn("Failed to set storage key:", key, err);
      }
    });
  } catch (err) {
    console.warn("saveBlobUrlToStorage outer error:", err);
    try {
      chrome.storage.local.set({ [key]: url });
    } catch { }
  }
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

// Try background tab capture (tabCapture API)
function tryTabCapture(): Promise<MediaStream | null> {
  return new Promise((resolve) => {
    try {
      const tc: any = (chrome as any).tabCapture;
      if (!tc || typeof tc.capture !== "function") {
        resolve(null);
        return;
      }
      tc.capture({ video: true, audio: false }, (stream: MediaStream | undefined) => {
        if (!stream) {
          console.warn("tabCapture returned no stream:", chrome.runtime.lastError?.message);
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

      if (msg.action === "OPEN_GIF_UPLOADER") {
        const url = chrome.runtime.getURL("extension/uploader.html");
        chrome.windows.create({ url, type: "popup", width: 660, height: 560 }, () => {
          sendResponse({ opened: true });
        });
        return;
      }

      if (msg.action === "OPEN_RECORDER_WINDOW") {
        const url = chrome.runtime.getURL("extension/recorder.html");
        chrome.windows.create({ url, type: "popup", width: 720, height: 520 }, () => {
          sendResponse({ opened: true });
        });
        return;
      }

      // ===== CAPTURE FRAME (one-shot) =====
      if (msg.action === "CAPTURE_FRAME") {
        try {
          // Query active tab
          chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            try {
              const tab = tabs?.[0];
              if (!tab) {
                sendResponse({ success: false, error: "No active tab" });
                return;
              }

              // captureVisibleTab takes the windowId of the tab
              const winId = tab.windowId;
              if (typeof winId !== "number") {
                sendResponse({ success: false, error: "Invalid window id" });
                return;
              }

              // capture as JPEG (quality to keep size reasonable)
              try {
                const imgData = chrome.tabs.captureVisibleTab(winId, { format: "jpeg", quality: 60 }, (dataUrl) => {
                  if (chrome.runtime.lastError) {
                    console.warn("captureVisibleTab runtime error:", chrome.runtime.lastError);
                    sendResponse({ success: false, error: String(chrome.runtime.lastError.message || chrome.runtime.lastError) });
                    return;
                  }
                  if (dataUrl) {
                    sendResponse({ success: true, screenshot: dataUrl });
                  } else {
                    sendResponse({ success: false, error: "capture returned empty" });
                  }
                });
              } catch (capErr) {
                console.error("captureVisibleTab call threw:", capErr);
                sendResponse({ success: false, error: String(capErr) });
              }
            } catch (inner) {
              console.error("CAPTURE_FRAME inner error:", inner);
              sendResponse({ success: false, error: String(inner) });
            }
          });
        } catch (err) {
          console.error("CAPTURE_FRAME error:", err);
          sendResponse({ success: false, error: String(err) });
        }
        return;
      }
    } catch (outer) {
      console.error("Background onMessage outer error:", outer);
      try {
        sendResponse({ success: false, error: String(outer) });
      } catch { }
    }
  })();

  // indicate we'll call sendResponse asynchronously
  return true;
});

// Ensure replayListener is injected into pages that are navigated
chrome.runtime.onInstalled.addListener(() => {
  console.log("[BugSense] Background installed. ready to inject content scripts when tabs update.");
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  try {
    if (changeInfo.status === "complete" && /^https?:/.test(tab.url || "")) {
      const fileToInject = "extension/content/replayListener.js";
      // small delay to ensure DOM is ready
      await new Promise((r) => setTimeout(r, 200));
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: [fileToInject],
        });
        console.log(`[BugSense] replayListener injected into ${tab.url}`);
      } catch (err) {
        console.warn("[BugSense] replayListener inject failed (maybe already injected):", err);
      }
    }
  } catch (outer) {
    console.error("[BugSense] tabs.onUpdated handler error:", outer);
  }
});
