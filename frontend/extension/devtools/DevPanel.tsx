// extension/devtools/DevPanel.tsx
import React, { useEffect, useState, useCallback } from "react";
// import { analyzeBug } from "../ai/analyze";
import { FaRegCopy } from "react-icons/fa";
import { getFormattedDate } from "../utils/formattedDate";

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark } from "react-syntax-highlighter/dist/esm/styles/prism";
// ------------------------------------------

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
  source: { type: "console" | "selection" | "image" | "link"; raw: any };
  replayActions?: any[];
};



export default function DevPanel() {
  const [errors, setErrors] = useState<ConsoleErrorItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState(false);
  const [clipboardData, setClipboardData] = useState<BugClipboard | null>(null);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);

  const [showExtraModal, setShowExtraModal] = useState(false);
  const [extraText, setExtraText] = useState("");
  const [onExtraConfirm, setOnExtraConfirm] = useState<null | ((text: string | null) => void)>(null);

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

  // Ask user for additional bug details (optional)
  function promptForExtraDetails(): Promise<string | null> {
    return new Promise((resolve) => {
      setExtraText("");
      setOnExtraConfirm(() => resolve);
      setShowExtraModal(true);
    });
  }

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
    source: {
      console?: ConsoleErrorItem;
      selectionText?: string;
      srcUrl?: string;
      linkUrl?: string;
      extraDetails?: string | null; // ✅ new field
    },
    screenshot: string | null,
    replayActions: any[]
  ) => {
    try {
      setMessage("🤖 Sending data to BugSense AI backend...");
      const response = await fetch("http://localhost:3000/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...source,
          screenshot,
          replayActions,
          extraDetails: source.extraDetails || null,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`AI backend error: ${text}`);
      }

      const ai = await response.json();
      console.log("[BugSense AI] Response from backend:", ai);
      return ai;
    } catch (err) {
      console.error("AI backend call failed:", err);
      const message =
        source.console?.message ||
        source.selectionText ||
        source.srcUrl ||
        source.linkUrl ||
        "Bug captured (AI unavailable)";
      return {
        title: `Bug Report: ${String(message).slice(0, 120)}`,
        description: source.console?.stack || message || "Bug captured manually",
        steps: [
          "1. Observe the error or selected text",
          "2. Reproduce steps from replay buffer",
        ],
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
      // 🧠 Ask user for optional details
      const extraDetails = await promptForExtraDetails();
      setMessage("🤖 Analyzing with BugSense AI... This may take a few seconds ⏳");

      const ai = await callAIForBug(
        { console: item, extraDetails },
        screenshot,
        replayActions
      );

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

  const createBugFromContext = useCallback(async (context: { selectionText?: string, srcUrl?: string, linkUrl?: string }) => {
    setLoading(true);
    setMessage("Capturing screenshot for UI bug...");
    try {
      const screenshot = await captureScreenshot();
      setMessage("Fetching recent replay actions...");
      const replayActions = await getReplayActions();
      // 🧠 Ask user for optional details
      const extraDetails = await promptForExtraDetails();
      setMessage("🤖 Analyzing UI bug with BugSense AI... ⏳");

      const ai = await callAIForBug({ ...context, extraDetails }, screenshot, replayActions);


      let rawSource = context.selectionText
        ? { type: "selection" as const, raw: { text: context.selectionText } }
        : context.srcUrl
          ? { type: "image" as const, raw: { srcUrl: context.srcUrl } }
          : context.linkUrl
            ? { type: "link" as const, raw: { linkUrl: context.linkUrl } }
            : { type: "selection" as const, raw: { text: "Unknown context" } };

      const bug: BugClipboard = {
        title: ai.title,
        description: ai.description,
        steps: ai.steps || [],
        screenshotDataUrl: screenshot,
        createdAt: getFormattedDate(),
        source: rawSource,
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
      if (msg.action === "TRIGGER_BUG_CREATION_FROM_CONTEXT" && msg.selectionText || msg.srcUrl || msg.linkUrl) {
        console.log("[BugSense Panel] Received trigger from context menu:", msg);
        console.log("[BugSense Panel] Creating new UI bug from selection...");
        createBugFromContext({
          selectionText: msg.selectionText,
          srcUrl: msg.srcUrl,
          linkUrl: msg.linkUrl
        });
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [createBugFromContext]);

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

  // ✅ --- THIS IS THE CORRECTED STYLE ---
  return (
    <div style={{
      padding: 12,
      width: '100%', // Takes full width of its parent
      // maxWidth: 420, // <-- REMOVED THIS
      // margin: '0 auto', // <-- REMOVED THIS
      fontFamily: "Inter, Roboto, sans-serif",
      background: "#0B1220",
      color: "#e0e0e0",
      minHeight: "100vh",
      boxSizing: 'border-box' // Keep padding from breaking layout
    }}>
      {/* ... (rest of the component is unchanged) ... */}
      <div className="text-lg font-semibold text-gray-400 mb-2 flex items-center" >
        <img
          src="../icons/icon48.png"
          alt="Bug Sense icon"
          style={{
            marginRight: 8,
            width: 20,
            height: 20
          }}
        />
        <div>Bug Sense — Console captures</div>
      </div>

      <div style={{ marginBottom: 8, color: "#a0a0a0", fontSize: 12 }}>
        Select a console message to create an AI-generated bug report. Uses instant screenshot + replay buffer.
      </div>

      {successBanner && (
        <div
          style={{
            background: "#1a911a",
            color: "#ffffff",
            padding: "6px 10px",
            borderRadius: 6,
            fontSize: 13,
            marginBottom: 10,
          }}
        >
          ✅ Bug captured successfully!
        </div>
      )}

      <div style={{
        maxHeight: 320,
        overflow: "auto",
        border: "1px solid #444",
        padding: 8,
        borderRadius: 6,
        background: "#252525"
      }}>
        {errors.length === 0 && <div style={{ color: "#888" }}>No captured console messages (open site & reproduce)</div>}
        {errors.map((e, idx) => (
          <div key={e.ts + "-" + idx} style={{
            marginBottom: 8,
            padding: 8,
            borderRadius: 6,
            background: "#3c3c3c",
            boxShadow: "0 0 0 1px #444 inset"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#f0f0f0" }}>{String(e.message).slice(0, 120)}</div>
              <div style={{ fontSize: 11, color: "#b0b0b0" }}>{new Date(e.ts).toLocaleTimeString()}</div>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: "#cccccc", whiteSpace: "pre-wrap" }}>{e.stack || (e.raw ? JSON.stringify(e.raw) : "")}</div>

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
                style={{
                  marginRight: 8,
                  background: "#3a7dff",
                  color: "white",
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer"
                }}
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
          style={{
            background: "#555",
            color: "#f0f0f0",
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid #666",
            cursor: "pointer"
          }}
        >
          {isPreviewVisible ? "Hide clipboard" : "Preview clipboard"}
        </button>
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 12, color: "#a0a0a0" }}>{message}</div>
      </div>

      {isPreviewVisible && (
        <div style={{
          marginTop: 20,
          background: "#252525",
          border: "1px solid #444",
          borderRadius: 4,
          maxHeight: 400,
          overflow: "auto"
        }}>
          <h4 className="sticky top-0" style={{
            margin: 0,
            padding: "8px 12px",
            borderBottom: "1px solid #444",
            background: "#333",
            fontSize: 13,
            fontWeight: 600,
            color: "#f0f0f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}>
            Clipboard Contents
            <FaRegCopy
              onClick={handleCopyToClipboard}
              style={{ cursor: "pointer", fontSize: 14, color: "#f0f0f0" }}
              title="Copy JSON (raw)"
            />
          </h4>

          {clipboardData?.screenshotDataUrl && (
            <div style={{ padding: 12, borderBottom: '1px solid #444', background: '#333' }}>
              <img
                src={clipboardData.screenshotDataUrl}
                alt="Bug Screenshot"
                style={{ width: '100%', borderRadius: 4, border: '1px solid #555' }}
                title="Right-click to copy or save this image"
              />
            </div>
          )}

          <SyntaxHighlighter
            language="json"
            style={atomDark}
            customStyle={{
              margin: 0,
              padding: "12px",
              fontSize: "11px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              background: "#2d2d2d"
            }}
          >
            {(() => {
              if (!clipboardData) return "No clipboard data found.";
              const displayData = { ...clipboardData };
              if (displayData.screenshotDataUrl) {
                delete displayData.screenshotDataUrl;
              }
              return JSON.stringify(displayData, null, 2);
            })()}
          </SyntaxHighlighter>
        </div>
      )}

      {showExtraModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: "#0B1220",
              color: "white",
              padding: 20,
              borderRadius: 8,
              width: "90%",
              maxWidth: 400,
              boxShadow: "0 0 10px rgba(0,0,0,0.5)",
            }}
          >
            <h3 style={{ marginTop: 0 }}>📝 Add Extra Details (optional)</h3>
            <textarea
              value={extraText}
              onChange={(e) => setExtraText(e.target.value)}
              placeholder="Describe more about the issue, environment, or special conditions (optional)..."
              style={{
                width: "100%",
                height: 120,
                padding: 8,
                borderRadius: 6,
                border: "1px solid #333",
                background: "#1b1f2b",
                color: "#eee",
                resize: "none",
                fontSize: 13,
                fontFamily: "Inter, sans-serif",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
              <button
                style={{
                  background: "#555",
                  color: "#fff",
                  border: "none",
                  padding: "6px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
                onClick={() => {
                  setShowExtraModal(false);
                  if (onExtraConfirm) onExtraConfirm(null);
                }}
              >
                Skip
              </button>
              <button
                style={{
                  background: "#3a7dff",
                  color: "white",
                  border: "none",
                  padding: "6px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
                onClick={() => {
                  setShowExtraModal(false);
                  if (onExtraConfirm) onExtraConfirm(extraText.trim() || null);
                }}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}