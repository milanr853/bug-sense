// extension/devtools/DevPanel.tsx
import React, { useEffect, useState, useCallback } from "react";
import { analyzeBug } from "../ai/analyze";
import { FaRegCopy } from "react-icons/fa"; // ✅ --- ADDED THIS IMPORT ---
import { getFormattedDate } from "../utils/formattedDate";

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
  createdAt: string;
  source: { type: "console" | "selection"; raw: any };
  replayActions?: any[];
};

export default function DevPanel() {
  const [errors, setErrors] = useState<ConsoleErrorItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState(false);
  const [clipboardData, setClipboardData] = useState<BugClipboard | null>(null);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);

  // ... (All your useEffects and functions from createBug... to insertIntoSheet... are unchanged) ...

  useEffect(() => {
    const load = () => {
      chrome.storage.local.get(["recentConsoleErrors"], (res) => {
        const arr = Array.isArray(res?.recentConsoleErrors) ? res.recentConsoleErrors : [];
        setErrors(arr.slice(-200).reverse());
      });
    };
    load();
    const onChange = (changes: any, areaName: string) => {
      if (changes.recentConsoleErrors) {
        const arr = Array.isArray(changes.recentConsoleErrors.newValue) ? changes.recentConsoleErrors.newValue : [];
        setErrors(arr.slice(-200).reverse());
      }
      if (changes.bugClipboard && areaName === "local") {
        setSuccessBanner(true);
        setTimeout(() => setSuccessBanner(false), 3000);
      }
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  const captureScreenshot = useCallback(async () => {
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
  }, []);

  const getReplayActions = useCallback(async () => {
    return new Promise<any[]>((resolve) => {
      chrome.runtime.sendMessage({ action: "GET_REPLAY_LOGS" }, (resp) => {
        if (chrome.runtime.lastError) resolve([]);
        else resolve(resp?.actions || []);
      });
    });
  }, []);

  const callAIForBug = useCallback(async (
    source: { console?: ConsoleErrorItem; selectionText?: string },
    screenshot: string | null,
    replayActions: any[]
  ) => {
    try {
      const result = await analyzeBug({
        ...source,
        screenshot,
        replayActions,
      });
      return result;
    } catch (err) {
      console.error("AI call failed:", err);
      const message = source.console?.message || source.selectionText || "Bug captured";
      return {
        title: `Bug Report: ${String(message).slice(0, 120)}`,
        description: source.console?.stack || message || "Bug captured",
        steps: [
          "1. See console error or selected text",
          "2. Reproduce steps from logs / replay (see replay actions)"
        ]
      };
    }
  }, []);

  const createBugFromError = useCallback(async (item: ConsoleErrorItem) => {
    setLoading(true);
    setMessage("Capturing screenshot...");
    try {
      const screenshot = await captureScreenshot();
      setMessage("Fetching recent replay actions...");
      const replayActions = await getReplayActions();
      setMessage("🤖 Analyzing with BugSense AI... This may take a few seconds ⏳");

      const ai = await callAIForBug({ console: item }, screenshot, replayActions);

      const bug: BugClipboard = {
        title: ai.title,
        description: ai.description,
        steps: ai.steps || [],
        screenshotDataUrl: screenshot,
        createdAt: getFormattedDate(),
        source: { type: "console", raw: item },
        replayActions,
      };

      await new Promise((res) => chrome.storage.local.set({ bugClipboard: bug }, () => res(true)));
      setMessage("Bug created and saved to BugSense clipboard ✅");
      setLoading(false);
      return bug;
    } catch (err) {
      console.error(err);
      setMessage("Failed to create bug: " + String(err));
      setLoading(false);
    }
  }, [captureScreenshot, getReplayActions, callAIForBug]);

  const createBugFromSelection = useCallback(async (selectionText: string) => {
    setLoading(true);
    setMessage("Capturing screenshot for UI bug...");
    try {
      const screenshot = await captureScreenshot();
      setMessage("Fetching recent replay actions...");
      const replayActions = await getReplayActions();
      setMessage("🤖 Analyzing UI bug with BugSense AI... ⏳");

      const ai = await callAIForBug({ selectionText: selectionText }, screenshot, replayActions);

      const bug: BugClipboard = {
        title: ai.title,
        description: ai.description,
        steps: ai.steps || [],
        screenshotDataUrl: screenshot,
        createdAt: getFormattedDate(),
        source: { type: "selection", raw: { text: selectionText } },
        replayActions,
      };

      await new Promise((res) => chrome.storage.local.set({ bugClipboard: bug }, () => res(true)));
      setMessage("Bug created and saved to BugSense clipboard ✅");
      setLoading(false);
      return bug;
    } catch (err) {
      console.error(err);
      setMessage("Failed to create bug: " + String(err));
      setLoading(false);
    }
  }, [captureScreenshot, getReplayActions, callAIForBug]);

  useEffect(() => {
    const messageListener = (msg: any) => {
      if (msg.action === "TRIGGER_BUG_CREATION_FROM_CONTEXT" && msg.selectionText) {
        console.log("[BugSense Panel] Received trigger from context menu:", msg.selectionText);
        console.log("[BugSense Panel] Creating new UI bug from selection...");
        createBugFromSelection(msg.selectionText);
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [createBugFromSelection]);

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

  const handlePreviewClick = () => {
    if (isPreviewVisible) {
      setIsPreviewVisible(false);
    } else {
      chrome.storage.local.get(["bugClipboard"], (res) => {
        setClipboardData(res?.bugClipboard || null);
        setIsPreviewVisible(true);
      });
    }
  };

  // ✅ --- ADDED THIS NEW FUNCTION ---
  const handleCopyToClipboard = () => {
    if (clipboardData) {
      const dataToCopy = { ...clipboardData };
      if (dataToCopy.screenshotDataUrl) {
        delete dataToCopy.screenshotDataUrl;
      }
      const jsonString = JSON.stringify(dataToCopy, null, 2);
      try {
        const tempTextArea = document.createElement("textarea");
        tempTextArea.value = jsonString;
        tempTextArea.style.position = "absolute";
        tempTextArea.style.left = "-9999px";
        document.body.appendChild(tempTextArea);
        tempTextArea.select();
        document.execCommand("copy");
        // Clean up
        document.body.removeChild(tempTextArea);
        setMessage("Clipboard JSON copied! ✅");
      } catch (err) {
        console.error("Failed to copy text: ", err);
        setMessage("Failed to copy to clipboard.");
      }
    }
  };

  return (
    <div style={{ padding: 12, width: 420, fontFamily: "Inter, Roboto, sans-serif" }}>
      <h3 style={{ marginBottom: 8 }}>Bug Sense — Console captures</h3>
      {/* ... (rest of the top section) ... */}
      <div style={{ marginBottom: 8, color: "#666", fontSize: 12 }}>
        Select a console message to create an AI-generated bug report. Uses instant screenshot + replay buffer.
      </div>

      {successBanner && (
        <div
          style={{
            background: "#16c60c",
            color: "#fff",
            padding: "6px 10px",
            borderRadius: 6,
            fontSize: 13,
            marginBottom: 10,
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
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        <button
          onClick={handlePreviewClick}
          style={{ background: "#eee", padding: "6px 10px", borderRadius: 6, border: "none", cursor: "pointer" }}
        >
          {isPreviewVisible ? "Hide clipboard" : "Preview clipboard"}
        </button>
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 12, color: "#666" }}>{message}</div>
      </div>

      {/* --- ✅ THIS IS THE MODIFIED PREVIEW BLOCK --- */}
      {isPreviewVisible && (
        <div style={{
          marginTop: 20,
          background: "#f4f4f4",
          border: "1px solid #ddd",
          borderRadius: 4,
          maxHeight: 400, // <-- Increased height slightly
          overflow: "auto"
        }}>
          <h4 style={{
            margin: 0,
            padding: "8px 12px",
            borderBottom: "1px solid #ddd",
            background: "#eee",
            fontSize: 13,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}>
            Clipboard Contents
            <FaRegCopy
              onClick={handleCopyToClipboard}
              style={{ cursor: "pointer", fontSize: 14, color: "#333" }}
              title="Copy JSON"
            />
          </h4>

          {/* ✅ --- THIS IS THE NEW IMAGE PREVIEW --- */}
          {clipboardData?.screenshotDataUrl && (
            <div style={{ padding: 12, borderBottom: '1px solid #ddd', background: '#fff' }}>
              <img
                src={clipboardData.screenshotDataUrl}
                alt="Bug Screenshot"
                style={{ width: '100%', borderRadius: 4, border: '1px solid #ccc' }}
                title="Right-click to copy or save this image"
              />
            </div>
          )}
          {/* --- END OF IMAGE PREVIEW --- */}
          <pre style={{
            margin: 0,
            padding: 12,
            fontSize: 11,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all"
          }}>
            {/* ✅ --- THIS LOGIC HIDES THE IMAGE DATA FROM THE JSON PREVIEW --- */}
            {(() => {
              if (!clipboardData) return "No clipboard data found.";
              // Create a copy to modify for display
              const displayData = { ...clipboardData };

              // Delete the key entirely so it doesn't show in the text preview
              // The image is already displayed above this <pre> block.
              if (displayData.screenshotDataUrl) {
                delete displayData.screenshotDataUrl;
              }
              return JSON.stringify(displayData, null, 2);
            })()}
          </pre>
        </div>
      )}
      {/* --- END OF MODIFIED BLOCK --- */}

    </div>
  );
}