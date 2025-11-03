// extension/content/duplicateBugDetector.ts
import { findDuplicates } from "../utils/transformer";
import { getSheetData, highlightDuplicates } from "../utils/sheetsAPI";

console.log("%c[BugSense] AI Duplicate Bug Detector Active 🧠", "color:#22d3ee");

async function initDuplicateDetector() {
  console.log("[BugSense] Fetching Google Sheets data via API...");

  // Extract spreadsheet ID from URL
  const match = window.location.href.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const spreadsheetId = match ? match[1] : null;

  if (!spreadsheetId) {
    console.error("[BugSense] Could not find spreadsheet ID in URL!");
    return;
  }

  try {
    // Fetch data from the sheet named 'bug_report'
    const sheetData: any = await getSheetData(spreadsheetId, "bug_report!A1:Z1000");
    const rows = sheetData.values || [];

    console.log(`[BugSense] Retrieved ${rows.length} rows from Google Sheets ✅`);

    if (rows.length < 2) {
      console.warn("[BugSense] Not enough data rows to analyze duplicates.");
      return;
    }

    // Skip header row
    const header = rows[0];
    const dataRows = rows.slice(1);

    // Prepare for duplicate detection
    const itemsForEmbedding = dataRows.map((cells: any, i: any) => ({
      id: i + 1,
      text: cells.join(" . ")
    }));

    // Find duplicates (via AI/semantic or string match)
    const dupResult = await findDuplicates(itemsForEmbedding, 0.86);
    const pairs = dupResult.pairs ?? [];

    console.log(`[BugSense] Duplicate check complete — found ${pairs.length} pairs.`);

    if (pairs.length > 0) {
      // Call highlight function to mark them red
      await highlightDuplicates(spreadsheetId, rows, pairs);
    }

    // Show enhanced overlay summary
    renderOverlaySummary(pairs, itemsForEmbedding.length);
  } catch (err) {
    console.error("[BugSense] Sheets API failed:", err);
  }
}

// 🧩 Enhanced overlay with row details
function renderOverlaySummary(pairs: any[], totalRows: number) {
  const overlay = document.createElement("div");
  overlay.id = "bugsense-summary";
  Object.assign(overlay.style, {
    position: "fixed",
    right: "12px",
    bottom: "12px",
    background: "#0b1220",
    color: "white",
    padding: "12px",
    borderRadius: "8px",
    zIndex: "999999",
    width: "320px",
    fontFamily: "Inter, sans-serif",
    boxShadow: "0 2px 6px rgba(0,0,0,0.25)"
  });

  const title = document.createElement("div");
  title.innerText = "BugSense — Duplicate Report";
  title.style.fontWeight = "bold";
  title.style.marginBottom = "6px";
  overlay.appendChild(title);

  const body = document.createElement("div");
  if (pairs.length === 0) {
    body.innerText = "✅ No duplicates found!";
  } else {
    const rowIndices: number[] = [];
    pairs.forEach((p: any) => {
      if (Array.isArray(p)) {
        // some AI functions return [i, j] form
        rowIndices.push(...p.map((id: number) => id + 2)); // +2 because we skipped header
      } else if (p.i !== undefined && p.j !== undefined) {
        rowIndices.push(p.i + 2, p.j + 2);
      }
    });
    const uniqueRows = [...new Set(rowIndices.sort((a, b) => a - b))];
    body.innerText = `⚠️ ${pairs.length} duplicate ${pairs.length > 1 ? "pairs" : "pair"
      } detected! (Rows ${uniqueRows.join(", ")})`;
  }
  overlay.appendChild(body);

  // Add buttons
  const footer = document.createElement("div");
  footer.style.marginTop = "8px";
  footer.style.display = "flex";
  footer.style.justifyContent = "space-between";
  footer.style.alignItems = "center";

  const close = document.createElement("button");
  close.innerText = "Close";
  Object.assign(close.style, {
    padding: "4px 8px",
    border: "none",
    background: "#ef4444",
    color: "white",
    borderRadius: "6px",
    cursor: "pointer",
  });
  close.onclick = () => overlay.remove();

  // Add reconnect button
  const reconnectBtn = document.createElement("button");
  reconnectBtn.textContent = "Reconnect Google";
  Object.assign(reconnectBtn.style, {
    background: "#2563eb",
    color: "white",
    border: "none",
    borderRadius: "6px",
    padding: "4px 8px",
    cursor: "pointer",
  });

  reconnectBtn.onclick = () => {
    chrome.identity.clearAllCachedAuthTokens(() => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (token) {
          console.log("[BugSense] Reconnected with Google ✅");
          alert("Successfully reconnected!");
        } else {
          console.error("[BugSense] Reconnect failed:", chrome.runtime.lastError);
          alert("Reconnect failed. Try again.");
        }
      });
    });
  };

  footer.appendChild(close);
  footer.appendChild(reconnectBtn);
  overlay.appendChild(footer);

  document.body.appendChild(overlay);
}

// Auto-run on load
if (document.readyState === "complete") {
  initDuplicateDetector();
} else {
  window.addEventListener("load", initDuplicateDetector);
}
