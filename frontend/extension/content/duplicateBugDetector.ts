// extension/content/duplicateBugDetector.ts
import { findDuplicates } from "../ai/transformer";
import { clearHighlights, getSheetData, highlightDuplicates } from "../utils/sheetsAPI";
import { addIgnoredPair, getIgnoredPairs, isIgnoredPair } from "../utils/cache";


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
    // Filter out previously ignored pairs
    const ignored = await getIgnoredPairs();
    const filteredPairs = pairs.filter((p) => {
      const key = [p.i, p.j].sort().join("-");
      return !ignored.includes(key);
    });

    console.log(`[BugSense] ${filteredPairs.length} active duplicate pairs after ignoring cached ones.`);


    console.log(`[BugSense] Duplicate check complete — found ${pairs.length} pairs.`);

    if (filteredPairs.length > 0) {
      // Call highlight function to mark them red
      await highlightDuplicates(spreadsheetId, rows, filteredPairs);
    }

    // Show enhanced overlay summary
    renderOverlaySummary(filteredPairs, itemsForEmbedding.length);
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
    padding: "14px",
    borderRadius: "8px",
    zIndex: "999999",
    width: "340px",
    fontFamily: "Inter, sans-serif",
    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
  });

  const title = document.createElement("div");
  title.innerText = "🧠 BugSense — Duplicate Verification";
  title.style.fontWeight = "bold";
  title.style.marginBottom = "6px";
  overlay.appendChild(title);

  const body = document.createElement("div");
  if (pairs.length === 0) {
    body.innerText = "✅ No duplicates found!";
  } else {
    const rowIndices: number[] = [];
    pairs.forEach((p: any) => rowIndices.push(p.i + 2, p.j + 2));
    const uniqueRows = [...new Set(rowIndices.sort((a, b) => a - b))];
    body.innerText = `⚠️ ${pairs.length} potential duplicates found (Rows ${uniqueRows.join(", ")})`;
  }
  overlay.appendChild(body);

  // 🧩 Add buttons
  const footer = document.createElement("div");
  footer.style.marginTop = "10px";
  footer.style.display = "flex";
  footer.style.justifyContent = "space-between";
  footer.style.gap = "8px";

  const confirmDup = document.createElement("button");
  confirmDup.innerText = "Confirm Duplicates";
  Object.assign(confirmDup.style, {
    flex: "1",
    padding: "6px 10px",
    background: "#22c55e",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",

  });

  confirmDup.onclick = async () => {
    alert("Duplicates confirmed. You can now remove them manually from your sheet.");
    overlay.remove();
  };

  const markNotDup = document.createElement("button");
  markNotDup.innerText = "Mark as Not Duplicates";
  Object.assign(markNotDup.style, {
    flex: "1",
    padding: "6px 10px",
    background: "#eab308",
    color: "#0b1220",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  });

  // inside the onclick:
  markNotDup.onclick = async () => {
    // cache as ignored
    for (const p of pairs) {
      await addIgnoredPair(p.i, p.j);
    }

    // remove red highlight from Google Sheet
    try {
      const match = window.location.href.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      const spreadsheetId = match ? match[1] : null;
      if (spreadsheetId) {
        await clearHighlights(spreadsheetId, pairs);
      }
    } catch (err) {
      console.error("[BugSense] Failed to clear highlights:", err);
    }

    alert("Marked as not duplicates — highlights removed and will be skipped next time.");
    overlay.remove();
  };

  const close = document.createElement("button");
  close.innerText = "Close";
  Object.assign(close.style, {
    flex: "1",
    padding: "6px 10px",
    background: "#ef4444",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  });
  close.onclick = () => overlay.remove();

  footer.appendChild(confirmDup);
  footer.appendChild(markNotDup);
  footer.appendChild(close);
  // 💡 Tip section (👉 append here, before the footer)
  const tip = document.createElement("div");
  tip.innerHTML = "<small>💡 Tip: Once confirmed, open your sheet and delete marked rows manually to keep it clean.</small>";
  tip.style.marginTop = "8px";
  tip.style.color = "#9ca3af";
  overlay.appendChild(tip);

  overlay.appendChild(footer);

  document.body.appendChild(overlay);
}

// Auto-run on load
if (document.readyState === "complete") {
  initDuplicateDetector();
} else {
  window.addEventListener("load", initDuplicateDetector);
}
