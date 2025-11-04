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


//---------------------------------------------
// extension/background/index.ts
// 1. Create the context menu when the extension is installed
chrome.runtime.onInstalled.addListener(() => {
  // --- This is the new block to add ---
  chrome.contextMenus.create({
    id: "BUGSENSE_CREATE_BUG_FROM_CONSOLE",
    title: "Bug Sense: Create bug report from this error",
    // This is the key: it shows the menu ONLY in devtools AND when text is selected
    contexts: ["selection"]
  });
  // --- End of new block ---
  console.log("[BugSense] Background installed. Context menu created.");
});
// 2. Listen for a click on the menu item we just created
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "BUGSENSE_CREATE_BUG_FROM_CONSOLE" && info.selectionText) {
    console.log("[BugSense] Context menu clicked, selection:", info.selectionText);

    // Send a message to the active DevPanel telling it to create a bug
    chrome.runtime.sendMessage({
      action: "TRIGGER_BUG_CREATION_FROM_CONTEXT",
      selectionText: info.selectionText
    });
  }
});
//---------------------------------------------

chrome.runtime.onMessage.addListener((msg: any, sender, sendResponse) => {
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

      // ===== APPEND SHEET ROW =====
      if (msg.action === "APPEND_SHEET_ROW") {
        const { sheetId, range, row } = msg;
        (async () => {
          try {
            chrome.identity.getAuthToken({ interactive: true }, async (token) => {
              if (chrome.runtime.lastError || !token) {
                sendResponse?.({ success: false, error: chrome.runtime.lastError });
                return;
              }

              const resp = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
                  range
                )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ values: [row] }),
                }
              );

              if (!resp.ok) {
                const j = await resp.json().catch(() => null);
                sendResponse?.({ success: false, error: j || resp.statusText });
                return;
              }

              const j = await resp.json();
              sendResponse?.({ success: true, result: j });
            });
          } catch (err) {
            sendResponse?.({ success: false, error: String(err) });
          }
        })();
        return true; // keep message channel open
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
// background/index.ts (in the service worker)
// Replace or add this injection logic (non-invasive)

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  try {
    // only act when the tab finished loading and the url is a Google Sheet
    if (changeInfo.status !== "complete" || !tab?.url || !tab.url.includes("docs.google.com/spreadsheets")) {
      return;
    }

    console.log("[BugSense] Google Sheet tab detected — enumerating frames for injection...");

    // small delay to let Google mount frames
    await new Promise((r) => setTimeout(r, 800));

    // get frame list for the tab (requires "webNavigation" permission)
    chrome.webNavigation.getAllFrames({ tabId }, async (frames) => {
      try {
        if (!frames || frames.length === 0) {
          console.warn("[BugSense] No frames returned by webNavigation.getAllFrames()");
          // as fallback inject into top frame (best effort)
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ["extension/content/duplicateBugDetector.js"],
          });
          console.log("[BugSense] duplicateBugDetector injected into top frame (fallback)");
          return;
        }

        // attempt to inject into a best-match frame (sheet/grid frames often contain 'docs' or 'client' urls)
        let injected = false;

        for (const f of frames) {
          const url = f.url || "";
          // pick frames that look like they belong to the sheet or docs app
          if (url.includes("docs.google.com") || url.includes("client") || url.includes("spreadsheets")) {
            try {
              // Attempt injection into this frameId (only same-origin or injectable frames will succeed)
              await chrome.scripting.executeScript({
                target: { tabId, frameIds: [f.frameId] },
                files: ["extension/content/duplicateBugDetector.js"],
              });
              console.log(`[BugSense] duplicateBugDetector injected into frameId=${f.frameId} url=${url}`);
              injected = true;
              break;
            } catch (err) {
              // likely cross-origin / sandboxed frame - ignore and try next
              console.warn(`[BugSense] frame ${f.frameId} injection failed (ignored):`, url, err);
            }
          }
        }

        // If none matched, fallback to injecting into top frame (best-effort)
        if (!injected) {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ["extension/content/duplicateBugDetector.js"],
          });
          console.log("[BugSense] duplicateBugDetector injected into top frame (final fallback)");
        }
      } catch (err) {
        console.warn("[BugSense] Error enumerating frames / injecting:", err);
        // fallback to top frame injection
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ["extension/content/duplicateBugDetector.js"],
          });
          console.log("[BugSense] duplicateBugDetector injected into top frame (error fallback)");
        } catch (e) {
          console.warn("[BugSense] final fallback injection failed:", e);
        }
      }
    });
  } catch (outer) {
    console.error("[BugSense] tabs.onUpdated injection outer error:", outer);
  }
});

//----------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "GET_GOOGLE_TOKEN") {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError || !token) {
        console.error("[BugSense Background] Failed to get auth token:", chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError });
      } else {
        console.log("[BugSense Background] Token acquired ✅");
        sendResponse({ success: true, token });
      }
    });
    return true; // keep message channel open for async response
  }
});

// ========== Simple Caching Layer ==========
const CACHE_KEY = "bugSenseCache";
const CACHE_EXPIRY = 1000 * 60 * 10; // 10 minutes

async function getCachedData(sheetId: string, range: string) {
  const cache = await chrome.storage.local.get(CACHE_KEY);
  const now = Date.now();

  if (cache[CACHE_KEY] && now - cache[CACHE_KEY].timestamp < CACHE_EXPIRY) {
    console.log("[BugSense] Loaded data from cache 🧠");
    return cache[CACHE_KEY].data;
  }

  // ask content script for new data
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "FETCH_SHEET_DATA", sheetId, range }, async (response) => {
      await chrome.storage.local.set({
        [CACHE_KEY]: { data: response, timestamp: now },
      });
      console.log("[BugSense] Cached new data 🧩");
      resolve(response);
    });
  });
}
/////////////////////////////////////////
// === BugSense DevTools bridge ===
// This allows DevPanel to receive real-time console messages.
let bugsenseDevPorts: chrome.runtime.Port[] = [];

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "bugsense-devtools") {
    console.log("[BugSense] DevTools connected ✅");
    bugsenseDevPorts.push(port);

    port.onDisconnect.addListener(() => {
      bugsenseDevPorts = bugsenseDevPorts.filter((p) => p !== port);
      console.log("[BugSense] DevTools disconnected ❌");
    });
  }
});

// Forward console events to DevTools panel (optional future use)
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action === "BUGSENSE_CONSOLE") {
    bugsenseDevPorts.forEach((p) => p.postMessage(msg));
  }
});


//-------------------------------
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg.action === "bugsense_create_bug") {
    const { message, file, line, column, time } = msg.payload;

    // Take screenshot
    const screenshot = await chrome.tabs.captureVisibleTab();

    // Construct bug object
    const bug = {
      title: `Bug from ${file ? file.split("/").pop() : "unknown source"}`,
      description: message,
      file,
      line,
      column,
      time,
      screenshot,
      steps: "AI will generate reproduction steps from replay and context.",
      createdAt: new Date().toLocaleString(),
    };

    await chrome.storage.local.set({ bugsense_clipboard: bug });

    console.log("✅ [BugSense] Bug saved to clipboard:", bug);
    sendResponse({ success: true });
  }
});