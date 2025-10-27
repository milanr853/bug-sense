/**
 * extension/content/googleSheetAnalyzer.ts
 *
 * Content script that:
 * - extracts Google Sheets visible grid into rows (best-effort)
 * - calls the transformers util to find semantic duplicates
 * - highlights duplicate rows and shows a small overlay with results
 */

/* eslint-disable no-console */

import { findDuplicates } from "../utils/transformer";

type RowObject = { rowIndex: number; cells: string[]; rowText: string };

console.log("GoogleSheetAnalyzer content script loaded");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action === "ANALYZE_SHEET") {
    analyzeVisibleSheet().then((res) => {
      sendResponse({ ok: true, result: res });
    }).catch((err) => {
      console.error("ANALYZE_SHEET failed:", err);
      sendResponse({ ok: false, error: String(err) });
    });
    // indicate async response
    return true;
  }
});

/**
 * High-level flow:
 * 1. detect if current page is a Google Sheet
 * 2. parse visible gridcells into rows (using role="gridcell" and aria-rowindex)
 * 3. determine header row and create objects
 * 4. call findDuplicates() from transformer util
 * 5. show UI highlights and overlay
 */
async function analyzeVisibleSheet() {
  if (!location.href.includes("docs.google.com/spreadsheets")) {
    throw new Error("Not a Google Sheets page (open the spreadsheet tab first).");
  }

  // Try to collect gridcells
  const gridCells = Array.from(document.querySelectorAll('[role="gridcell"]')) as HTMLElement[];

  if (!gridCells || gridCells.length === 0) {
    // fallback: try to read visible plain text cells
    const fallbackText = document.querySelector("div.docs-sheet-view")?.innerText;
    if (!fallbackText) {
      throw new Error("Couldn't detect sheet cells in DOM. Make sure the sheet is open and active.");
    }
    // Fallback simple parsing: split lines (best-effort)
    const lines = fallbackText.split("\n").slice(0, 200);
    const items = lines.map((l, i) => ({ id: i, text: l }));
    const duplicates = await findDuplicates(items, 0.86);
    renderOverlaySummary(duplicates, items);
    return { fallback: true, itemsCount: items.length, duplicates };
  }

  // Build map: rowIndex -> cell text array
  const rowsMap = new Map<number, string[]>();
  gridCells.forEach((cellEl) => {
    const ariaRow = cellEl.getAttribute("aria-rowindex");
    const ariaCol = cellEl.getAttribute("aria-colindex");
    const rowIndex = ariaRow ? parseInt(ariaRow, 10) : undefined;
    const colIndex = ariaCol ? parseInt(ariaCol, 10) : undefined;

    const text = cellEl.innerText?.trim() ?? "";

    if (typeof rowIndex === "number") {
      if (!rowsMap.has(rowIndex)) rowsMap.set(rowIndex, []);
      const arr = rowsMap.get(rowIndex)!;
      // ensure array is large enough
      if (typeof colIndex === "number") {
        arr[colIndex - 1] = text;
      } else {
        arr.push(text);
      }
    }
  });

  // Convert rowsMap to sorted rows array
  const sortedRowIndices = Array.from(rowsMap.keys()).sort((a, b) => a - b);
  if (sortedRowIndices.length === 0) {
    throw new Error("No rows discovered in the sheet DOM.");
  }

  // Determine header row (assume first row in sortedRowIndices)
  const headerRowIndex = sortedRowIndices[0];
  const header = rowsMap.get(headerRowIndex) ?? [];

  // Build row objects starting from next rows (data rows)
  const dataRows: RowObject[] = [];
  for (const r of sortedRowIndices.slice(1)) {
    const cells = rowsMap.get(r) ?? [];
    const rowText = cells.join(" | ");
    dataRows.push({ rowIndex: r, cells, rowText });
  }

  // Create items for duplicate detection: combine likely fields.
  // Heuristic: look for column names like title, description, steps, bug, summary
  const headerLower = header.map((h) => (h || "").toLowerCase());
  function buildRowString(cells: string[]) {
    // prefer columns that match likely names
    const preferred = ["title", "summary", "description", "steps", "repro", "reproduction"];
    const picked: string[] = [];

    for (let i = 0; i < cells.length; i++) {
      const h = headerLower[i] || "";
      const cellText = cells[i] || "";
      if (preferred.some((p) => h.includes(p))) {
        picked.push(cellText);
      }
    }

    // fallback: if no preferred columns identified, use first 3 columns
    if (picked.length === 0) {
      picked.push(...cells.slice(0, 3));
    }

    // also append the entire row text (to catch incidental duplicates)
    picked.push(cells.join(" "));
    return picked.filter(Boolean).join(" . ");
  }

  const itemsForEmbedding = dataRows.map((dr) => ({ id: dr.rowIndex, text: buildRowString(dr.cells) }));

  // Run duplicate detection (threshold tuned; can be adjusted)
  const DUP_THRESHOLD = 0.86;
  const dupResult = await findDuplicates(itemsForEmbedding, DUP_THRESHOLD);

  // Process pairs into grouped duplicates map
  const groups: Record<number, number[]> = {}; // root -> [duplicates]
  dupResult.pairs.forEach((p) => {
    const i = itemsForEmbedding[p.i].id as number;
    const j = itemsForEmbedding[p.j].id as number;
    if (!groups[i]) groups[i] = [];
    groups[i].push(j);
  });

  // Clear previous highlights if any
  clearPreviousHighlights();

  // Highlight rows that were marked duplicates (color them and add small badge)
  const duplicateRows = new Set<number>();
  Object.entries(groups).forEach(([rootStr, arr]) => {
    const root = parseInt(rootStr, 10);
    duplicateRows.add(root);
    arr.forEach((r) => duplicateRows.add(r));
  });

  // Apply highlights in the DOM using aria-rowindex attribute
  duplicateRows.forEach((rowIndex) => {
    const selector = `[role="gridcell"][aria-rowindex="${rowIndex}"]`;
    const cells = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
    cells.forEach((c) => {
      c.style.backgroundColor = "rgba(255, 230, 230, 0.9)";
      c.style.border = "1px solid rgba(220,20,60,0.6)";
    });
  });

  // Render overlay with results
  renderOverlaySummary(dupResult, itemsForEmbedding);

  return {
    header,
    rows: dataRows.length,
    duplicates: dupResult.pairs.length,
    groups
  };
}

/**
 * Removes previously added overlay and highlighted styles.
 */
function clearPreviousHighlights() {
  const prev = document.getElementById("bug-sense-duplicates-overlay");
  if (prev) prev.remove();

  // revert cell styles
  const highlighted = Array.from(document.querySelectorAll('[role="gridcell"]')) as HTMLElement[];
  highlighted.forEach((c) => {
    if (c.style.backgroundColor && c.style.backgroundColor.includes("255, 230, 230")) {
      c.style.backgroundColor = "";
      c.style.border = "";
    }
  });
}

/**
 * Small floating overlay to show summary and allow user to inspect duplicates.
 */
function renderOverlaySummary(dupResult: any, items: { id: number; text: string }[]) {
  clearPreviousHighlights();

  const overlay = document.createElement("div");
  overlay.id = "bug-sense-duplicates-overlay";
  Object.assign(overlay.style, {
    position: "fixed",
    right: "12px",
    bottom: "12px",
    width: "320px",
    maxHeight: "50vh",
    overflowY: "auto",
    zIndex: "1000000",
    backgroundColor: "#0b1220",
    color: "white",
    padding: "12px",
    borderRadius: "8px",
    boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: "13px"
  });

  const title = document.createElement("div");
  title.style.fontWeight = "700";
  title.style.marginBottom = "8px";
  title.innerText = `Bug Sense — Duplicate Analysis`;
  overlay.appendChild(title);

  const meta = document.createElement("div");
  meta.style.opacity = "0.9";
  meta.style.marginBottom = "8px";
  meta.innerText = `Items checked: ${items.length}  •  Pairs detected: ${dupResult.pairs?.length ?? 0}`;
  overlay.appendChild(meta);

  const list = document.createElement("div");
  list.style.display = "flex";
  list.style.flexDirection = "column";
  list.style.gap = "8px";

  if (!dupResult.pairs || dupResult.pairs.length === 0) {
    const ok = document.createElement("div");
    ok.innerText = "No duplicates found (threshold applied).";
    ok.style.opacity = "0.9";
    list.appendChild(ok);
  } else {
    // For each pair, show mini item with score and quick-jump button
    dupResult.pairs.slice(0, 40).forEach((p: any) => {
      const leftId = items[p.i].id;
      const rightId = items[p.j].id;
      const score = (p.score ?? 0).toFixed(3);

      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.gap = "6px";

      const text = document.createElement("div");
      text.style.flex = "1";
      text.style.fontSize = "12px";
      text.style.opacity = "0.95";
      text.innerText = `Row ${leftId} ↔ Row ${rightId} (score ${score})`;

      const btn = document.createElement("button");
      btn.innerText = "Jump";
      Object.assign(btn.style, {
        backgroundColor: "#111827",
        color: "white",
        border: "1px solid #374151",
        padding: "4px 8px",
        borderRadius: "6px",
        cursor: "pointer",
        fontSize: "12px"
      });

      btn.onclick = () => {
        // Scroll to first cell in that row by using aria-rowindex on gridcell
        const cell = document.querySelector(`[role="gridcell"][aria-rowindex="${leftId}"]`) as HTMLElement;
        if (cell) {
          cell.scrollIntoView({ behavior: "smooth", block: "center" });
          // flash the row
          const rowcells = Array.from(document.querySelectorAll(`[role="gridcell"][aria-rowindex="${leftId}"]`)) as HTMLElement[];
          rowcells.forEach((c) => {
            c.animate([{ backgroundColor: "#fff5f5" }, { backgroundColor: "" }], { duration: 1200 });
          });
        }
      };

      row.appendChild(text);
      row.appendChild(btn);
      list.appendChild(row);
    });
  }

  overlay.appendChild(list);

  const close = document.createElement("div");
  close.style.marginTop = "10px";
  const closeBtn = document.createElement("button");
  closeBtn.innerText = "Close";
  Object.assign(closeBtn.style, {
    backgroundColor: "#ef4444",
    color: "white",
    border: "none",
    padding: "6px 12px",
    borderRadius: "6px",
    cursor: "pointer"
  });
  closeBtn.onclick = () => overlay.remove();
  close.appendChild(closeBtn);
  overlay.appendChild(close);

  document.body.appendChild(overlay);
}

