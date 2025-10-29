// extension/background/index.ts
// Background service worker for Bug Sense
// - Handles tab capture (START_RECORDING / STOP_RECORDING)
// - Opens a dedicated uploader window for GIF generation (OPEN_GIF_UPLOADER)
// - Stores produced artifact URLs in chrome.storage.local
// Note: this file runs in the MV3 service worker context.

type Msg =
  | { action: "START_RECORDING" }
  | { action: "STOP_RECORDING" }
  | { action: "OPEN_GIF_UPLOADER" };

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: BlobPart[] = [];
let activeStream: MediaStream | null = null;

// Keep track of last blob URL we saved to storage so we can revoke it when replaced
let lastSavedBlobUrlKey = "recordedVideo";
let lastSavedBlobUrl: string | null = null;

// Helper: safely set `isRecording` flag in storage
function setRecordingFlag(val: boolean) {
  try {
    chrome.storage.local.set({ isRecording: val });
  } catch (err) {
    console.warn("setRecordingFlag error:", err);
  }
}

// Helper: save a blob URL under the given key, revoking any previous url for that key
function saveBlobUrlToStorage(key: string, url: string) {
  // revoke previous if any
  chrome.storage.local.get([key], (data) => {
    try {
      const prev = data?.[key];
      if (prev && typeof prev === "string") {
        try {
          URL.revokeObjectURL(prev);
        } catch (e) {
          // ignore revoke errors
        }
      }
    } catch (e) {
      // ignore
    } finally {
      // set new url
      chrome.storage.local.set({ [key]: url });
    }
  });
}

// Main message listener
chrome.runtime.onMessage.addListener((msg: Msg, sender, sendResponse) => {
  try {
    if (msg.action === "START_RECORDING") {
      // If a recording is already in progress, respond immediately
      if (mediaRecorder && mediaRecorder.state === "recording") {
        sendResponse({ success: true, alreadyRecording: true });
        return true;
      }

      // Use chrome.tabCapture to capture the active tab (works in background context)
      try {
        chrome.tabCapture.capture({ audio: false, video: true }, (stream) => {
          if (!stream) {
            const errMsg = chrome.runtime.lastError
              ? String(chrome.runtime.lastError.message || chrome.runtime.lastError)
              : "tabCapture returned no stream";
            console.error("tabCapture failed:", errMsg);
            sendResponse({ success: false, error: errMsg });
            return;
          }

          // store references
          activeStream = stream;
          recordedChunks = [];

          // Try preferred mime type, fallback if not supported
          let options: MediaRecorderOptions = { mimeType: "video/webm; codecs=vp9" };
          let mr: MediaRecorder;
          try {
            mr = new MediaRecorder(stream as MediaStream, options);
          } catch (err) {
            // fallback to generic webm
            try {
              mr = new MediaRecorder(stream as MediaStream, { mimeType: "video/webm" });
            } catch (err2) {
              console.error("MediaRecorder creation failed:", err2);
              sendResponse({ success: false, error: String(err2) });
              return;
            }
          }

          mediaRecorder = mr;

          mediaRecorder.ondataavailable = (ev: BlobEvent) => {
            if (ev.data && ev.data.size > 0) recordedChunks.push(ev.data);
          };

          mediaRecorder.onstop = () => {
            try {
              const blob = new Blob(recordedChunks, { type: "video/webm" });
              const url = URL.createObjectURL(blob);

              // Save in storage under `recordedVideo` and clear isRecording
              saveBlobUrlToStorage("recordedVideo", url);
              setRecordingFlag(false);

              // cleanup stream tracks
              if (activeStream) {
                try {
                  activeStream.getTracks().forEach((t) => t.stop());
                } catch (e) {
                  /* ignore */
                }
                activeStream = null;
              }

              // clear chunks
              recordedChunks = [];
              mediaRecorder = null;
            } catch (err) {
              console.error("onstop processing error:", err);
            }
          };

          mediaRecorder.onerror = (ev) => {
            console.error("MediaRecorder error:", ev);
          };

          // start recording
          try {
            mediaRecorder.start();
            setRecordingFlag(true);

            // If any track ends (user navigates away), ensure we stop the recorder gracefully
            try {
              (stream as MediaStream).getVideoTracks().forEach((track) => {
                track.addEventListener("ended", () => {
                  if (mediaRecorder && mediaRecorder.state === "recording") {
                    try {
                      mediaRecorder.stop();
                    } catch (e) {
                      /* ignore stop error */
                    }
                  }
                  setRecordingFlag(false);
                });
              });
            } catch (e) {
              // ignore attach errors
            }

            sendResponse({ success: true });
          } catch (errStart) {
            console.error("Failed to start mediaRecorder:", errStart);
            sendResponse({ success: false, error: String(errStart) });
          }
        });
      } catch (err) {
        console.error("tabCapture invocation failed:", err);
        sendResponse({ success: false, error: String(err) });
      }

      // Indicate async response will be sent
      return true;
    }

    if (msg.action === "STOP_RECORDING") {
      try {
        if (mediaRecorder && mediaRecorder.state === "recording") {
          mediaRecorder.stop();
        } else {
          // Ensure flag reset
          setRecordingFlag(false);
        }
        sendResponse({ success: true });
      } catch (err) {
        console.error("STOP_RECORDING error:", err);
        sendResponse({ success: false, error: String(err) });
      }
      return true;
    }

    if (msg.action === "OPEN_GIF_UPLOADER") {
      try {
        const url = chrome.runtime.getURL("extension/uploader.html");
        chrome.windows.create(
          {
            url,
            type: "popup",
            width: 660,
            height: 560,
          },
          (win) => {
            // chrome.windows.create callback may return undefined in some environments
            sendResponse({ opened: !!win });
          }
        );
      } catch (err) {
        console.error("OPEN_GIF_UPLOADER failed:", err);
        sendResponse({ opened: false, error: String(err) });
      }
      return true;
    }
  } catch (outerErr) {
    console.error("background onMessage outer error:", outerErr);
    // best-effort response
    try {
      sendResponse({ success: false, error: String(outerErr) });
    } catch (e) {
      /* ignore sendResponse errors */
    }
  }

  // default: not handled here
  return false;
});
