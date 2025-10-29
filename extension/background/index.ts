// extension/background/index.ts
// Background service worker handles tab capture (MV3 friendly).
// Uses chrome.tabCapture to capture current tab, record via MediaRecorder,
// and stores the resulting blob url in chrome.storage.local as `recordedVideo`.
// Also exposes start/stop via runtime messages.

interface StartMsg { action: "START_RECORDING" }
interface StopMsg { action: "STOP_RECORDING" }

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: BlobPart[] = [];
let activeStream: MediaStream | null = null;

chrome.runtime.onMessage.addListener((msg: StartMsg | StopMsg, sender, sendResponse) => {
  if (msg.action === "START_RECORDING") {
    // If already recording, return current state
    if (mediaRecorder && mediaRecorder.state === "recording") {
      sendResponse({ success: true });
      return true;
    }

    // Tab capture options: capture the visible tab (no system audio)
    try {
      chrome.tabCapture.capture({ audio: false, video: true }, (stream) => {
        if (!stream) {
          console.error("tabCapture returned no stream; reason:", chrome.runtime.lastError);
          sendResponse({ success: false, error: String(chrome.runtime.lastError) });
          return;
        }

        activeStream = stream;
        recordedChunks = [];

        try {
          mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm; codecs=vp9" });
        } catch (err) {
          // Fallback codec
          mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm" });
        }

        mediaRecorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) recordedChunks.push(ev.data);
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(recordedChunks, { type: "video/webm" });
          const url = URL.createObjectURL(blob);
          chrome.storage.local.set({ recordedVideo: url, isRecording: false }, () => {
            console.log("Recording saved to chrome.storage.local");
          });

          // release tracks
          if (activeStream) {
            activeStream.getTracks().forEach((t) => t.stop());
            activeStream = null;
          }
        };

        mediaRecorder.start();
        chrome.storage.local.set({ isRecording: true }, () => {
          sendResponse({ success: true });
        });

        // If capture ends (user closed tab, navigation, etc.), stop the recorder gracefully
        stream.getVideoTracks().forEach((track) => {
          track.addEventListener("ended", () => {
            if (mediaRecorder && mediaRecorder.state === "recording") {
              mediaRecorder.stop();
            }
            chrome.storage.local.set({ isRecording: false });
          });
        });
      });
    } catch (err) {
      console.error("Error during START_RECORDING:", err);
      sendResponse({ success: false, error: String(err) });
    }

    // Indicate asynchronous response
    return true;
  }

  if (msg.action === "STOP_RECORDING") {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    } else {
      // ensure isRecording flag cleared
      chrome.storage.local.set({ isRecording: false });
    }
    sendResponse({ success: true });
    return true;
  }

  return false;
});
