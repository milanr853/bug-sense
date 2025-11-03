// extension/content/replayListener.ts
// Content script for Bug Sense: Records user actions, captures tab snapshots, and
// persists replay data. Designed to survive SPA navigation & avoid context invalidation errors.

type ActionEvent = {
    type: "click" | "keypress";
    timestamp: number;
    details: any;
};

// Configuration constants
const MAX_BUFFER_TIME = 60000; // 60s window of actions
const SCREENSHOT_THROTTLE_MS = 2000; // capture every 2 seconds
const MAX_SCREENSHOTS = 30; // store last 30 frames (~60s)

let actions: ActionEvent[] = [];
let lastScreenshotTime = 0;

console.log("[BugSense Replay Listener] active ✅");

// ─────────────────────────────────────────────────────────────────────────────
//  Safe chrome.storage.set wrapper to avoid “Extension context invalidated” errors
// ─────────────────────────────────────────────────────────────────────────────
function safeStorageSet(obj: Record<string, any>) {
    try {
        if (!chrome?.storage?.local) return; // context may be invalid
        chrome.storage.local.set(obj, () => {
            if (chrome.runtime?.lastError) {
                console.warn("[BugSense] safeStorageSet warning:", chrome.runtime.lastError.message);
            }
        });
    } catch (err) {
        if (String(err).includes("Extension context invalidated")) {
            console.log("[BugSense] Context invalidated — skipping write (safe)");
            return;
        }
        console.warn("[BugSense] safeStorageSet exception:", err);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Core persistence helpers
// ─────────────────────────────────────────────────────────────────────────────
async function persistActions() {
    try {
        safeStorageSet({ recentActions: actions });
    } catch (err) {
        console.warn("[BugSense] persistActions error:", err);
    }
}

async function persistScreenshotIfAvailable(screenshotDataUrl?: string) {
    if (!screenshotDataUrl) return;
    try {
        chrome.storage.local.get(["recentScreenshots"], (res) => {
            const existing: Array<{ screenshot: string; timestamp: number }> =
                Array.isArray(res?.recentScreenshots) ? res.recentScreenshots : [];
            const appended = [...existing, { screenshot: screenshotDataUrl, timestamp: Date.now() }].slice(-MAX_SCREENSHOTS);
            safeStorageSet({ recentScreenshots: appended });
        });
    } catch (err) {
        console.warn("[BugSense] persistScreenshotIfAvailable exception:", err);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Utility: prune old events
// ─────────────────────────────────────────────────────────────────────────────
function pruneOld() {
    const now = Date.now();
    actions = actions.filter((a) => now - a.timestamp < MAX_BUFFER_TIME);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Screenshot capture (request background via message)
// ─────────────────────────────────────────────────────────────────────────────
// async function requestCaptureFrame(): Promise<string | null> {
//     try {
//         return await new Promise((resolve) => {
//             try {
//                 chrome.runtime.sendMessage({ action: "CAPTURE_FRAME" }, (resp) => {
//                     if (chrome.runtime.lastError) {
//                         console.warn("[replayListener] CAPTURE_FRAME runtime error:", chrome.runtime.lastError);
//                         resolve(null);
//                         return;
//                     }
//                     if (resp?.success && resp.screenshot) {
//                         resolve(resp.screenshot as string);
//                         return;
//                     }
//                     resolve(null);
//                 });
//             } catch (err) {
//                 console.warn("[replayListener] CAPTURE_FRAME sendMessage exception:", err);
//                 resolve(null);
//             }
//         });
//     } catch (err) {
//         console.warn("[replayListener] requestCaptureFrame outer error:", err);
//         return null;
//     }
// }
async function requestCaptureFrame(): Promise<string | null> {
    try {
        if (!chrome.runtime?.id) {
            console.log("[replayListener] Extension context invalidated — skipping CAPTURE_FRAME");
            return null; // 👈 return explicit null instead of undefined
        }

        const result = await new Promise<string | null>((resolve) => {
            try {
                chrome.runtime.sendMessage({ action: "CAPTURE_FRAME" }, (resp) => {
                    if (chrome.runtime.lastError) {
                        console.warn("[replayListener] CAPTURE_FRAME runtime error:", chrome.runtime.lastError);
                        resolve(null);
                        return;
                    }

                    if (resp?.success && resp.screenshot) {
                        resolve(resp.screenshot as string);
                        return;
                    }

                    resolve(null);
                });
            } catch (err) {
                console.warn("[replayListener] CAPTURE_FRAME sendMessage exception:", err);
                resolve(null);
            }
        });

        return result; // ✅ ensures Promise<string | null> consistency

    } catch (err) {
        if (String(err).includes("Extension context invalidated")) {
            console.log("[replayListener] Safe ignore: context invalidated");
            return null; // 👈 always return null to match type
        } else {
            console.warn("[replayListener] requestCaptureFrame outer error:", err);
            return null;
        }
    }
}


async function maybeCapture() {
    try {
        const now = Date.now();
        if (now - lastScreenshotTime < SCREENSHOT_THROTTLE_MS) return;
        lastScreenshotTime = now;
        const screenshot = await requestCaptureFrame();
        if (screenshot) await persistScreenshotIfAvailable(screenshot);
    } catch (err) {
        console.warn("[replayListener] maybeCapture error:", err);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Event handlers
// ─────────────────────────────────────────────────────────────────────────────
async function handleClick(e: MouseEvent) {
    try {
        const target = e.target as HTMLElement | null;
        const details = {
            tag: target?.tagName || "unknown",
            text: target?.innerText?.slice(0, 100) ?? null,
            x: e.clientX,
            y: e.clientY,
        };
        actions.push({ type: "click", timestamp: Date.now(), details });
        pruneOld();
        persistActions();
        await maybeCapture();
    } catch (err) {
        console.warn("[replayListener] handleClick error:", err);
    }
}

async function handleKeypress(e: KeyboardEvent) {
    try {
        const details = { key: e.key };
        actions.push({ type: "keypress", timestamp: Date.now(), details });
        pruneOld();
        persistActions();
        await maybeCapture();
    } catch (err) {
        console.warn("[replayListener] handleKeypress error:", err);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Listener management
// ─────────────────────────────────────────────────────────────────────────────
function addListeners() {
    try {
        window.addEventListener("click", handleClick, true);
        window.addEventListener("keypress", handleKeypress, true);
        console.log("[BugSense Replay Listener] listeners attached");
    } catch (err) {
        console.warn("[replayListener] addListeners error:", err);
    }
}

function removeListeners() {
    try {
        window.removeEventListener("click", handleClick, true);
        window.removeEventListener("keypress", handleKeypress, true);
        console.log("[BugSense Replay Listener] listeners removed");
    } catch (err) {
        console.warn("[replayListener] removeListeners error:", err);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Initialization logic
// ─────────────────────────────────────────────────────────────────────────────
function init() {
    try {
        chrome.storage.local.get(["recentActions", "recentScreenshots"], (res) => {
            try {
                const existing: ActionEvent[] = Array.isArray(res?.recentActions) ? res.recentActions : [];
                actions = existing.filter((a) => Date.now() - a.timestamp < MAX_BUFFER_TIME);
            } catch {
                actions = [];
            }
        });
    } catch (err) {
        console.warn("[replayListener] init storage get error:", err);
    }
    addListeners();
}

// ─────────────────────────────────────────────────────────────────────────────
//  Handle page lifecycle events (SPA/bfcache friendly)
// ─────────────────────────────────────────────────────────────────────────────
window.addEventListener("pageshow", (ev: PageTransitionEvent) => {
    try {
        console.log("[replayListener] pageshow (persisted=" + (ev.persisted ? "yes" : "no") + ")");
        removeListeners();
        init();
    } catch (err) {
        console.warn("[replayListener] pageshow handler error:", err);
    }
});

window.addEventListener("pagehide", () => {
    try {
        removeListeners();
    } catch (err) {
        console.warn("[replayListener] pagehide handler error:", err);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  Cleanup and trimming on unload (prevent memory bloat)
// ─────────────────────────────────────────────────────────────────────────────
window.addEventListener("beforeunload", () => {
    try {
        chrome.storage.local.get(["recentScreenshots"], (res) => {
            const arr = Array.isArray(res?.recentScreenshots) ? res.recentScreenshots : [];
            const trimmed = arr.slice(-MAX_SCREENSHOTS);
            safeStorageSet({ recentScreenshots: trimmed });
        });
    } catch { }
});

// ─────────────────────────────────────────────────────────────────────────────
//  Message listener for replay requests
// ─────────────────────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    try {
        if (msg?.action === "GET_REPLAY_LOGS") {
            pruneOld();
            sendResponse({ success: true, actions: actions.slice() });
        }
    } catch (err) {
        console.warn("[replayListener] onMessage handler error:", err);
        try {
            sendResponse({ success: false, error: String(err) });
        } catch { }
    }
    return true;
});

// ─────────────────────────────────────────────────────────────────────────────
//  Initialize script
// ─────────────────────────────────────────────────────────────────────────────
init();
