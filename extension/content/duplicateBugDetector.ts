import { findDuplicates } from "../utils/transformer";
import { getSheetData } from "../utils/sheetsAPI";

console.log("%c[BugSense] AI Duplicate Bug Detector Active 🧠", "color:#22d3ee");

async function initDuplicateDetector() {
  console.log("[BugSense] Fetching Google Sheets data via API...");

  // Extract spreadsheet ID from current URL
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
    const itemsForEmbedding = dataRows.map((cells, i) => ({
      id: i + 1,
      text: cells.join(" . ")
    }));

    const dupResult = await findDuplicates(itemsForEmbedding, 0.86);
    const pairs = dupResult.pairs ?? [];

    console.log(`[BugSense] Duplicate check complete — found ${pairs.length} pairs.`);

    // Show quick overlay summary
    renderOverlaySummary(pairs, itemsForEmbedding.length);
  } catch (err) {
    console.error("[BugSense] Sheets API failed:", err);
  }
}

function renderOverlaySummary(pairs: any[], itemsCount: number) {
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
    width: "300px",
    fontFamily: "Inter, sans-serif",
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
    body.innerText = `⚠️ ${pairs.length} duplicate pairs detected!`;
  }
  overlay.appendChild(body);

  const close = document.createElement("button");
  close.innerText = "Close";
  Object.assign(close.style, {
    marginTop: "8px",
    padding: "4px 8px",
    border: "none",
    background: "#ef4444",
    color: "white",
    borderRadius: "6px",
    cursor: "pointer",
  });
  close.onclick = () => overlay.remove();

  overlay.appendChild(close);
  document.body.appendChild(overlay);
}

// Run detector on load
if (document.readyState === "complete") {
  initDuplicateDetector();
} else {
  window.addEventListener("load", initDuplicateDetector);
}
