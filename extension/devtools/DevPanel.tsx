// extension/devtools/DevPanel.tsx
import React, { useEffect, useState } from "react";

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

// The bug clipboard format
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

  useEffect(() => {
    // load errors from storage
    const load = () => {
      chrome.storage.local.get(["recentConsoleErrors"], (res) => {
        const arr = Array.isArray(res?.recentConsoleErrors) ? res.recentConsoleErrors : [];
        // show newest first
        setErrors(arr.slice(-200).reverse());
      });
    };

    load();

    // listen for storage updates (new console errors)
    const onChange = (changes: any, areaName: string) => {
      if (changes.recentConsoleErrors) {
        const arr = Array.isArray(changes.recentConsoleErrors.newValue) ? changes.recentConsoleErrors.newValue : [];
        setErrors(arr.slice(-200).reverse());
      }
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => {
      try {
        chrome.storage.onChanged.removeListener(onChange);
      } catch { }
    };
  }, []);

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
    // if you expose a GET_REPLAY_LOGS message from background/existing code, call it.
    return new Promise<any[]>((resolve) => {
      chrome.runtime.sendMessage({ action: "GET_REPLAY_LOGS" }, (resp) => {
        if (chrome.runtime.lastError) {
          resolve([]);
        } else {
          resolve(resp?.actions || []);
        }
      });
    });
  }

  async function callAIForBug(consoleItem: ConsoleErrorItem, screenshot: string | null, replayActions: any[]) {
    // call your backend ai route. Adjust URL if needed.
    try {
      // const res = await fetch(chrome.runtime.getURL("/ai/analyze") 
      const res = await fetch("http://localhost:3000/ai/analyze"
        , {
          // In dev you may directly call "http://localhost:3000/ai/analyze"
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "console",
            console: consoleItem,
            screenshot,
            replayActions,
          }),
        });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error("AI service error: " + txt);
      }

      const j = await res.json();
      // expect j: { title, description, steps: string[] }
      return j;
    } catch (err) {
      console.error("AI call failed:", err);
      throw err;
    }
  }

  async function createBugFromError(item: ConsoleErrorItem) {
    setLoading(true);
    setMessage("Capturing screenshot...");
    try {
      const screenshot = await captureScreenshot();
      setMessage("Fetching recent replay actions...");
      const replayActions = await getReplayActions();

      setMessage("Asking AI to generate bug details...");
      // NOTE: replace the fetch URL above with your backend AI endpoint if different.
      const ai = await callAIForBug(item, screenshot, replayActions).catch((e) => {
        // Fallback: create simple title & steps
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
      // Prompt for spreadsheet ID and target range (or detect from current tab)
      // We will try to auto-detect spreadsheetId from current tab URL (docs.google.com/spreadsheets)
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

      // default range name — you may prompt user for the sheet name; using 'bug_report!A:Z' for example
      const range = "bug_report!A1:Z1"; // for append we use append endpoint; range param is used in appendRow func
      // assemble row values in the order your sheet expects. Example:
      const row = [
        bug.title,
        bug.description,
        (bug.steps || []).join("\n"),
        bug.screenshotDataUrl ? "screenshot_attached" : "",
        new Date(bug.createdAt).toISOString(),
        "Bug Sense", // reported by
      ];

      setMessage("Appending row to spreadsheet...");
      // Use background message to append
      chrome.runtime.sendMessage({ action: "APPEND_SHEET_ROW", sheetId: spreadsheetId, range: "bug_report!A1:Z1000", row }, (resp) => {
        if (chrome.runtime.lastError) {
          setMessage("Append failed: " + String(chrome.runtime.lastError.message));
          return;
        }
        if (resp?.success) {
          setMessage("Row appended ✅");
        } else {
          setMessage("Append failed: " + JSON.stringify(resp?.error || "unknown"));
        }
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
                    // show quick actions
                    const ok = confirm("Bug created and saved to clipboard. Insert into sheet now?");
                    if (ok) {
                      insertIntoSheet(bug);
                    }
                  }
                }}
                disabled={loading}
                style={{ marginRight: 8, background: "#0b5cff", color: "white", padding: "6px 10px", borderRadius: 6, border: "none", cursor: "pointer" }}
              >
                Create bug from this error
              </button>

              <button
                onClick={() => {
                  // open full details view
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
