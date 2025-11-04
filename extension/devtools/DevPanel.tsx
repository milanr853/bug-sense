// extension/devtools/DevPanel.tsx
import React, { useEffect, useState } from "react";
import { analyzeBug } from "../ai/analyze";

type ConsoleErrorItem = {
  ts: number;
  type: string;
  message: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  stack?: string | null;
  raw?: any;
};

type BugClipboard = {
  title: string;
  description: string;
  steps: string[];
  screenshotDataUrl?: string | null;
  createdAt: number;
  source: { type: "console"; raw: ConsoleErrorItem };
  replayActions?: any[];
};

export default function DevPanel() {
  const [errors, setErrors] = useState<ConsoleErrorItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState(false); // ✅ added

  useEffect(() => {
    // load errors from storage
    const load = () => {
      chrome.storage.local.get(["recentConsoleErrors"], (res) => {
        const arr = Array.isArray(res?.recentConsoleErrors) ? res.recentConsoleErrors : [];
        setErrors(arr.slice(-200).reverse());
      });
    };
    load();

    // listen for updates
    const onChange = (changes: any, areaName: string) => {
      if (changes.recentConsoleErrors) {
        const arr = Array.isArray(changes.recentConsoleErrors.newValue) ? changes.recentConsoleErrors.newValue : [];
        setErrors(arr.slice(-200).reverse());
      }

      // ✅ Listen for bug clipboard changes to trigger success banner
      if (changes.bugClipboard && areaName === "local") {
        setSuccessBanner(true);
        setTimeout(() => setSuccessBanner(false), 3000);
      }
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  // ✅ ADD THIS NEW useEffect BLOCK
  useEffect(() => {
    const messageListener = (msg: any) => {
      if (msg.action === "TRIGGER_BUG_CREATION_FROM_CONTEXT" && msg.selectionText) {
        console.log("[BugSense Panel] Received trigger from context menu:", msg.selectionText);
        const selectedText = msg.selectionText;
        const foundError = errors.find(err =>
          err.message.includes(selectedText) ||
          (err.stack && err.stack.includes(selectedText))
        );
        if (foundError) {
          console.log("[BugSense Panel] Found matching error, creating bug...");
          createBugFromError(foundError);
        } else {
          console.warn("[BugSense Panel] Could not find matching error for:", selectedText);
          setMessage("Error: Could not find matching error in the panel.");
        }
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [errors, createBugFromError]);

  async function captureScreenshot() {
    return new Promise<string | null>((resolve) => {
      chrome.runtime.sendMessage({ action: "CAPTURE_FRAME" }, (resp) => {
        if (chrome.runtime.lastError) {
          console.warn("CAPTURE_FRAME runtime error:", chrome.runtime.lastError);
          resolve(null);
          return;
        }
        resolve(resp?.screenshot || null);
      });
    });
  }

  async function getReplayActions() {
    return new Promise<any[]>((resolve) => {
      chrome.runtime.sendMessage({ action: "GET_REPLAY_LOGS" }, (resp) => {
        if (chrome.runtime.lastError) resolve([]);
        else resolve(resp?.actions || []);
      });
    });
  }

  async function callAIForBug(consoleItem: ConsoleErrorItem, screenshot: string | null, replayActions: any[]) {
    try {
      const result = await analyzeBug({
        console: consoleItem,
        screenshot,
        replayActions,
      });
      return result;
    } catch (err) {
      console.error("AI call failed:", err);
      return {
        title: `Console error: ${String(consoleItem.message).slice(0, 120)}`,
        description: consoleItem.stack || consoleItem.message || "Console error captured",
        steps: [
          "1. See console error in DevTools",
          "2. Reproduce steps from logs / replay (see replay actions)"
        ]
      };
    }
  }

  async function createBugFromError(item: ConsoleErrorItem) {
    setLoading(true);
    setMessage("Capturing screenshot...");
    try {
      const screenshot = await captureScreenshot();
      setMessage("Fetching recent replay actions...");
      const replayActions = await getReplayActions();

      // 🧠 Add this line (AI analysis spinner feedback)
      setMessage("🤖 Analyzing with BugSense AI... This may take a few seconds ⏳");

      // Run local Transformer.js model (or backend, depending on setup)
      const ai = await callAIForBug(item, screenshot, replayActions).catch((e) => {
        console.warn("AI fallback: ", e);
        return {
          title: `Console error: ${String(item.message).slice(0, 120)}`,
          description: item.stack || item.message || "Console error captured",
          steps: [
            "1. See console error in DevTools",
            "2. Reproduce steps from logs / replay (see replay actions)"
          ]
        };
      });

      const bug: BugClipboard = {
        title: ai.title,
        description: ai.description,
        steps: ai.steps || [],
        screenshotDataUrl: screenshot,
        createdAt: Date.now(),
        source: { type: "console", raw: item },
        replayActions,
      };

      // store in local clipboard key
      await new Promise((res) => chrome.storage.local.set({ bugClipboard: bug }, () => res(true)));

      setMessage("Bug created and saved to BugSense clipboard ✅");
      setLoading(false);
      return bug;
    } catch (err) {
      console.error(err);
      setMessage("Failed to create bug: " + String(err));
      setLoading(false);
    }
  }


  async function insertIntoSheet(bug: BugClipboard) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      let spreadsheetId: string | null = null;
      if (tab?.url) {
        const m = String(tab.url).match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        spreadsheetId = m ? m[1] : null;
      }
      if (!spreadsheetId) {
        const input = prompt("Enter target Google Spreadsheet ID (or click Cancel to abort)");
        if (!input) return;
        spreadsheetId = input;
      }

      const range = "bug_report!A1:Z1";
      const row = [
        bug.title,
        bug.description,
        (bug.steps || []).join("\n"),
        bug.screenshotDataUrl ? "screenshot_attached" : "",
        new Date(bug.createdAt).toISOString(),
        "Bug Sense",
      ];

      setMessage("Appending row to spreadsheet...");
      chrome.runtime.sendMessage({ action: "APPEND_SHEET_ROW", sheetId: spreadsheetId, range, row }, (resp) => {
        if (chrome.runtime.lastError) {
          setMessage("Append failed: " + chrome.runtime.lastError.message);
          return;
        }
        if (resp?.success) setMessage("Row appended ✅");
        else setMessage("Append failed: " + JSON.stringify(resp?.error || "unknown"));
      });
    } catch (err) {
      console.error(err);
      setMessage("Insert error: " + String(err));
    }
  }

  return (
    <div style={{ padding: 12, width: 420, fontFamily: "Inter, Roboto, sans-serif" }}>
      <h3 style={{ marginBottom: 8 }}>Bug Sense — Console captures</h3>
      <div style={{ marginBottom: 8, color: "#666", fontSize: 12 }}>
        Select a console message to create an AI-generated bug report. Uses instant screenshot + replay buffer.
      </div>

      {/* ✅ Success banner */}
      {successBanner && (
        <div
          style={{
            background: "#16c60c",
            color: "#fff",
            padding: "6px 10px",
            borderRadius: 6,
            fontSize: 13,
            marginBottom: 10,
            animation: "fadeout 3s forwards",
          }}
        >
          ✅ Bug captured successfully!
        </div>
      )}

      <div style={{ maxHeight: 320, overflow: "auto", border: "1px solid #eee", padding: 8, borderRadius: 6 }}>
        {errors.length === 0 && <div style={{ color: "#888" }}>No captured console messages (open site & reproduce)</div>}
        {errors.map((e, idx) => (
          <div key={e.ts + "-" + idx} style={{ marginBottom: 8, padding: 8, borderRadius: 6, background: "#fff", boxShadow: "0 0 0 1px #eee inset" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{String(e.message).slice(0, 120)}</div>
              <div style={{ fontSize: 11, color: "#999" }}>{new Date(e.ts).toLocaleTimeString()}</div>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: "#444", whiteSpace: "pre-wrap" }}>{e.stack || (e.raw ? JSON.stringify(e.raw) : "")}</div>

            <div style={{ marginTop: 8 }}>
              <button
                onClick={async () => {
                  setMessage("Creating bug...");
                  const bug = await createBugFromError(e as ConsoleErrorItem);
                  if (bug) {
                    const ok = confirm("Bug created and saved to clipboard. Insert into sheet now?");
                    if (ok) insertIntoSheet(bug);
                  }
                }}
                disabled={loading}
                style={{ marginRight: 8, background: "#0b5cff", color: "white", padding: "6px 10px", borderRadius: 6, border: "none", cursor: "pointer" }}
              >
                Create bug from this error
              </button>

              <button
                onClick={() => {
                  chrome.storage.local.get(["bugClipboard"], (res) => {
                    alert("Current Bug clipboard preview:\n\n" + JSON.stringify(res?.bugClipboard || {}, null, 2));
                  });
                }}
                style={{ background: "#eee", padding: "6px 10px", borderRadius: 6, border: "none", cursor: "pointer" }}
              >
                Preview clipboard
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 12, color: "#666" }}>{message}</div>
      </div>
    </div>
  );
}
