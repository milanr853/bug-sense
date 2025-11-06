// extension/background/index.ts
// Background service worker for Bug Sense (Manifest V3)
// Handles START/STOP recording (tabCapture), and handles one-shot CAPTURE_FRAME requests
// from content scripts to capture visible tab screenshot. Returns screenshot as data URL.

type Msg =
  | { action: "START_RECORDING" }
  | { action: "STOP_RECORDING" }
  | { action: "OPEN_GIF_UPLOADER" }
  | { action: "OPEN_RECORDER_WINDOW" }
  | { action: "CAPTURE_FRAME" }
  | { action: "TAKE_SCREENSHOT" }
  | { action: "SAVE_ANNOTATED_IMAGE_DATAURL" }
  | { action: "OPEN_REPLAY_EXPORT_PAGE" }
  | { action: "HIDE_OVERLAY_AND_CAPTURE" };

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: BlobPart[] = [];
let activeStream: MediaStream | null = null;
const lastSavedUrlKey = "recordedVideo";

// Safety listener to silence "async channel closed" warnings
// This acts as a safety net for any message that truly never calls sendResponse.
// It doesn't replace proper fixes, but prevents random console spam while you fix remaining listeners.
chrome.runtime.onMessage.addListener(() => {
  // Intentionally no-op.
});

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
chrome.runtime.onInstalled.addListener(() => {
  // Create parent menu
  chrome.contextMenus.create({
    id: "BUGSENSE_MAIN_MENU",
    title: "Bug Sense",
    contexts: ["all"],
  });
  // Add two submenus
  chrome.contextMenus.create({
    id: "BUGSENSE_FULL_SCREENSHOT",
    parentId: "BUGSENSE_MAIN_MENU",
    title: "Create bug report (Full screen)",
    contexts: ["all"],
  });
  chrome.contextMenus.create({
    id: "BUGSENSE_SELECTIVE_SCREENSHOT",
    parentId: "BUGSENSE_MAIN_MENU",
    title: "Create bug report (Select area)",
    contexts: ["all"],
  });
  console.log("[BugSense] Background installed. Context menu created ✅");
});

// 2. Replace your onClicked listener with this new one
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === "BUGSENSE_FULL_SCREENSHOT") {
    chrome.runtime.sendMessage({
      action: "TRIGGER_BUG_CREATION_FROM_CONTEXT",
      mode: "full",
      selectionText: info.selectionText,
      srcUrl: info.srcUrl,
      linkUrl: info.linkUrl,
    });
  }

  if (info.menuItemId === "BUGSENSE_SELECTIVE_SCREENSHOT") {
    // Inject selectionOverlay.js only once per page (guard in the page avoids duplicate listeners)
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Run in page context:
          // If already injected, mark won't re-inject
          // NOTE: window is page's window object (this function serializes into the page)
          // __bugSenseOverlayInjected is a page-global guard.
          if ((window as any).__bugSenseOverlayInjected) return;
          (window as any).__bugSenseOverlayInjected = true;

          // Create a script tag that loads extension file (this avoids multiple copies of same content script
          // being registered by the extension engine)
          const s = document.createElement("script");
          s.src = chrome.runtime.getURL("extension/content/selectionOverlay.js");
          s.async = true;
          document.documentElement.appendChild(s);
        },
      });
    } catch (err) {
      // If programmatic injection fails, fallback to injecting via files (best-effort)
      console.warn("[BugSense] programmatic injection failed, falling back to file injection:", err);
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["extension/content/selectionOverlay.js"],
        });
      } catch (err2) {
        console.warn("[BugSense] fallback injection also failed:", err2);
      }
    }

    // Trigger the overlay to start selection (content script listens for this message)
    chrome.tabs.sendMessage(tab.id, { action: "START_SELECTIVE_CAPTURE" });
  }
});
//---------------------------------------------

// ==========================================================
// 🆕 BUGSENSE SCREENSHOT HANDLER (Non-blocking + Full Res + Preview)
// ==========================================================

type FullImageRecord = {
  dataUrl: string;      // full screenshot (dataURL)
  filename: string;     // download filename
  createdAt: number;    // timestamp for auto cleanup
};

const FULL_IMAGE_CACHE = new Map<string, FullImageRecord>();
const FULL_IMAGE_TTL = 1000 * 60 * 5; // 5 minutes

function scheduleScreenshotCleanup(key: string, delay = FULL_IMAGE_TTL) {
  setTimeout(() => {
    FULL_IMAGE_CACHE.delete(key);
  }, delay);
}

async function createPreviewDataUrl(blob: Blob, maxW = 800, maxH = 600, quality = 0.7): Promise<string> {
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, Math.min(maxW / bitmap.width, maxH / bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to create OffscreenCanvas context");

    ctx.drawImage(bitmap, 0, 0, w, h);
    const previewBlob = await (canvas as any).convertToBlob({ type: "image/jpeg", quality });
    bitmap.close();

    const reader = new FileReader();
    return await new Promise((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(previewBlob);
    });
  } catch (err) {
    console.warn("[BugSense] Preview downscale failed:", err);
    return "";
  }
}

// 🧠 TAKE_SCREENSHOT & DOWNLOAD_FULL_SCREENSHOT handler
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.action === "TAKE_SCREENSHOT") {
    try {
      console.log("[BugSense Background] TAKE_SCREENSHOT triggered 🖼️");

      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        const tab = tabs?.[0];
        if (!tab || !tab.windowId) {
          sendResponse({ success: false, error: "No active tab" });
          return;
        }

        chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 85 }, async (dataUrl) => {
          if (chrome.runtime.lastError) {
            sendResponse({
              success: false,
              error: chrome.runtime.lastError.message || "captureVisibleTab failed",
            });
            return;
          }

          if (!dataUrl) {
            sendResponse({ success: false, error: "Empty screenshot" });
            return;
          }

          try {
            // Full image storage
            const filename = `bug-sense-screenshot-${Date.now()}.jpg`;
            const key = `bugSense_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            FULL_IMAGE_CACHE.set(key, { dataUrl, filename, createdAt: Date.now() });
            scheduleScreenshotCleanup(key);

            // Generate small preview
            const blob = await (await fetch(dataUrl)).blob();
            let previewUrl = dataUrl;
            try {
              const preview = await createPreviewDataUrl(blob, 600, 400, 0.7);
              if (preview) previewUrl = preview;
            } catch { }

            sendResponse({
              success: true,
              preview: previewUrl,
              fullKey: key,
              filename,
            });
          } catch (err) {
            sendResponse({ success: false, error: String(err) });
          }
        });
      });
    } catch (e) {
      sendResponse({ success: false, error: String(e) });
    }

    return true; // keep sendResponse async
  }

  if (msg?.action === "DOWNLOAD_FULL_SCREENSHOT" && msg.fullKey) {
    try {
      const entry = FULL_IMAGE_CACHE.get(msg.fullKey);
      if (!entry) {
        sendResponse({ success: false, error: "Screenshot expired or missing" });
        return;
      }

      chrome.downloads.download(
        {
          url: entry.dataUrl,
          filename: entry.filename,
          saveAs: true,
        },
        (id) => {
          if (chrome.runtime.lastError) {
            sendResponse({
              success: false,
              error: chrome.runtime.lastError.message || "Download failed",
            });
          } else {
            sendResponse({ success: true, downloadId: id });
          }
          FULL_IMAGE_CACHE.delete(msg.fullKey);
        }
      );
    } catch (e) {
      sendResponse({ success: false, error: String(e) });
    }

    return true; // async
  }
});
// ==========================================================
// 🧠 FINAL: SAVE_ANNOTATED_IMAGE_DATAURL (High Quality JPEG)
// ==========================================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.action === "SAVE_ANNOTATED_IMAGE_DATAURL") {
    try {
      const { dataUrl } = msg;
      if (!dataUrl || !dataUrl.startsWith("data:image")) {
        sendResponse({ success: false, error: "Invalid data URL" });
        return;
      }

      // Force proper JPEG extension and MIME
      const filename = `bug-sense-annotated-${Date.now()}.jpg`;
      const jpegDataUrl = dataUrl.replace(/^data:image\/[^;]+/, "data:image/jpeg");

      chrome.downloads.download(
        {
          url: jpegDataUrl,
          filename,
          saveAs: true,
        },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            console.error("[BugSense] Annotated JPEG download failed:", chrome.runtime.lastError);
            sendResponse({
              success: false,
              error: chrome.runtime.lastError.message || "Download failed",
            });
          } else {
            console.log("[BugSense] Annotated image download started:", downloadId);
            sendResponse({ success: true });
          }
        }
      );
    } catch (err) {
      console.error("[BugSense] SAVE_ANNOTATED_IMAGE_DATAURL failed:", err);
      sendResponse({ success: false, error: String(err) });
    }

    return true; // async response
  }
});

// ---------- Recording & misc handler (single big listener) ----------
chrome.runtime.onMessage.addListener((msg: any, sender, sendResponse) => {
  // Wrap the handler logic in an async IIFE so we can await and always call sendResponse.
  (async () => {
    try {
      if (!msg || !msg.action) {
        // nothing to do
        return;
      }

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
        const url = chrome.runtime.getURL("extension/uploader/uploader.html");
        chrome.windows.create({ url, type: "popup", width: 660, height: 560 }, () => {
          sendResponse({ opened: true });
        });
        return;
      }

      if (msg.action === "OPEN_RECORDER_WINDOW") {
        const url = chrome.runtime.getURL("extension/recorder/recorder.html");
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
                chrome.tabs.captureVisibleTab(winId, { format: "jpeg", quality: 60 }, (dataUrl) => {
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
      // Replace callback-style chrome.identity.getAuthToken with a Promise wrapper so we always sendResponse
      if (msg.action === "APPEND_SHEET_ROW") {
        const { sheetId, range, row } = msg;
        try {
          const token = await new Promise<string>((resolve, reject) => {
            try {
              chrome.identity.getAuthToken({ interactive: true }, (t: any) => {
                if (chrome.runtime.lastError || !t) reject(chrome.runtime.lastError || new Error("No token"));
                else resolve(t);
              });
            } catch (e) {
              reject(e);
            }
          });

          const resp = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
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
            sendResponse({ success: false, error: j || resp.statusText });
            return;
          }

          const j = await resp.json();
          sendResponse({ success: true, result: j });
        } catch (err) {
          sendResponse({ success: false, error: String(err) });
        }
        return true; // keep message channel open for async response
      }

    } catch (outer) {
      console.error("Background onMessage outer error:", outer);
      try {
        sendResponse({ success: false, error: String(outer) });
      } catch { }
    }
  })();

  // indicate we'll call sendResponse asynchronously (for branches that need it)
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
    // Wrap the chrome.identity.getAuthToken callback in a Promise to ensure we always call sendResponse.
    (async () => {
      try {
        const token = await new Promise<string>((resolve, reject) => {
          try {
            chrome.identity.getAuthToken({ interactive: true }, (t: any) => {
              if (chrome.runtime.lastError || !t) reject(chrome.runtime.lastError || new Error("No token"));
              else resolve(t);
            });
          } catch (e) {
            reject(e);
          }
        });
        sendResponse({ success: true, token });
      } catch (e) {
        console.error("[BugSense Background] Failed to get auth token:", e);
        sendResponse({ success: false, error: String(e) });
      }
    })();

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
// bugsense_create_bug (single-shot)
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg.action === "bugsense_create_bug") {
    try {
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
    } catch (err) {
      console.error("bugsense_create_bug failed:", err);
      sendResponse({ success: false, error: String(err) });
    }
    return true;
  }
});

// GET_REPLAY_LOGS handler (keeps channel open and responds)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "GET_REPLAY_LOGS") {
    try {
      chrome.storage.local.get(["replayActionsLog"], (res) => {
        if (chrome.runtime.lastError) {
          console.warn("Error getting replay logs:", chrome.runtime.lastError);
          sendResponse({ success: false, actions: [] });
        } else {
          const actions = res?.replayActionsLog || [];
          console.log("[BugSense Background] Sent replay actions:", actions);
          sendResponse({ success: true, actions: actions });
        }
      });
    } catch (e) {
      sendResponse({ success: false, error: String(e) });
    }
    return true;
  }
});

// OPEN_REPLAY_EXPORT_PAGE
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "OPEN_REPLAY_EXPORT_PAGE") {
    const url = chrome.runtime.getURL("extension/replay-export/replay-export.html");
    chrome.tabs.create({ url, active: true });
  }
});

// ======================================================
// ✅ SINGLE handler for selective area capture
// ======================================================
let captureInProgress = false;

chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg.action !== "HIDE_OVERLAY_AND_CAPTURE") return;

  if (captureInProgress) {
    console.warn("[BugSense] Capture already in progress, skipping duplicate");
    return;
  }
  captureInProgress = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.windowId) throw new Error("No active tab");

    // Make sure overlay disappears visually
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab?.id ?? 0 },
        func: () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
              document.body.offsetHeight; // flush paint
              resolve();
            });
          }),
      });
    } catch (err) {
      console.warn("[BugSense] Repaint script failed:", err);
    }

    await new Promise((r) => setTimeout(r, 150));

    // Do the capture (no sendResponse, pure async)
    const dataUrl = await new Promise<string>((resolve, reject) => {
      chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" }, (url) => {
        if (chrome.runtime.lastError || !url)
          reject(chrome.runtime.lastError?.message || "captureVisibleTab failed");
        else resolve(url);
      });
    });

    const blob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    const scale = self.devicePixelRatio || 1;
    const canvas = new OffscreenCanvas(msg.rect.width, msg.rect.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No OffscreenCanvas context");

    ctx.drawImage(
      bitmap,
      msg.rect.x * scale,
      msg.rect.y * scale,
      msg.rect.width * scale,
      msg.rect.height * scale,
      0,
      0,
      msg.rect.width,
      msg.rect.height
    );
    bitmap.close();

    const croppedBlob = await canvas.convertToBlob({ type: "image/png", quality: 1 });
    const reader = new FileReader();
    reader.onload = () => {
      chrome.runtime.sendMessage({
        action: "TRIGGER_BUG_CREATION_FROM_CONTEXT",
        mode: "selective",
        screenshot: reader.result,
      });
      captureInProgress = false;
    };
    reader.readAsDataURL(croppedBlob);
  } catch (err) {
    console.error("[BugSense] Selective capture failed:", err);
    captureInProgress = false;
  }
});
