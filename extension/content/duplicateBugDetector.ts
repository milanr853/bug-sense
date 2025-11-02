// extension/content/duplicateBugDetector.ts
// Robust AI Duplicate Bug Detector for Google Sheets.
// - Waits for gridcells (poll), inspects same-origin iframes if present,
// - Falls back to text extraction if grid cells are not available,
// - Runs duplicate detection via utils/transformer.findDuplicates and highlights results.

import { findDuplicates } from "../utils/transformer";

console.log("%c[BugSense] AI Duplicate Bug Detector Active 🧠", "color:#22d3ee");

// ========== CONFIG ==========
const DUP_THRESHOLD = 0.86;
const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 10_000; // wait up to 10s for cells to appear

type RowObject = { rowIndex: number; cells: string[]; rowText: string };

let observer: MutationObserver | null = null;
let lastPairsCount = 0;

/* -------------------- Helpers -------------------- */

function clearPreviousHighlights() {
  const prevOverlay = document.getElementById("bug-sense-duplicates-overlay");
  if (prevOverlay) prevOverlay.remove();

  const highlighted = Array.from(document.querySelectorAll('[role="gridcell"]')) as HTMLElement[];
  highlighted.forEach((c) => {
    if (c.style.backgroundColor && c.style.backgroundColor.includes("255, 230, 230")) {
      c.style.backgroundColor = "";
      c.style.border = "";
    }
  });
}

function renderOverlaySummary(pairs: any[], itemsCount: number) {
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
    fontSize: "13px",
  });

  const title = document.createElement("div");
  title.style.fontWeight = "700";
  title.style.marginBottom = "6px";
  title.innerText = `Bug Sense — Duplicate Scan`;
  overlay.appendChild(title);

  const meta = document.createElement("div");
  meta.style.opacity = "0.85";
  meta.style.marginBottom = "8px";
  meta.innerText = `Rows checked: ${itemsCount} • Duplicates: ${pairs.length}`;
  overlay.appendChild(meta);

  if (pairs.length === 0) {
    const ok = document.createElement("div");
    ok.innerText = "✅ No duplicates found.";
    ok.style.opacity = "0.9";
    overlay.appendChild(ok);
  } else {
    const list = document.createElement("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "6px";

    pairs.slice(0, 40).forEach((p: any) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.gap = "6px";

      const text = document.createElement("div");
      text.style.flex = "1";
      text.style.fontSize = "12px";
      text.style.opacity = "0.95";
      text.innerText = `Row ${p.i + 2} ↔ Row ${p.j + 2} (${(p.score * 100).toFixed(1)}%)`;

      const btn = document.createElement("button");
      btn.innerText = "Jump";
      Object.assign(btn.style, {
        backgroundColor: "#111827",
        color: "white",
        border: "1px solid #374151",
        padding: "3px 8px",
        borderRadius: "6px",
        cursor: "pointer",
        fontSize: "12px",
      });

      btn.onclick = () => {
        const targetRow = p.i + 2;
        const cell = document.querySelector(`[role="gridcell"][aria-rowindex="${targetRow}"]`) as HTMLElement;
        if (cell) {
          cell.scrollIntoView({ behavior: "smooth", block: "center" });
          const rowcells = Array.from(document.querySelectorAll(`[role="gridcell"][aria-rowindex="${targetRow}"]`)) as HTMLElement[];
          rowcells.forEach((c) => {
            c.animate([{ backgroundColor: "#fff5f5" }, { backgroundColor: "" }], { duration: 1200 });
          });
        }
      };

      row.appendChild(text);
      row.appendChild(btn);
      list.appendChild(row);
    });

    overlay.appendChild(list);
  }

  const close = document.createElement("div");
  close.style.marginTop = "8px";
  const closeBtn = document.createElement("button");
  closeBtn.innerText = "Close";
  Object.assign(closeBtn.style, {
    backgroundColor: "#ef4444",
    color: "white",
    border: "none",
    padding: "6px 12px",
    borderRadius: "6px",
    cursor: "pointer",
  });
  closeBtn.onclick = () => overlay.remove();
  close.appendChild(closeBtn);
  overlay.appendChild(close);

  document.body.appendChild(overlay);
}

/* -------------------- Sheet parsing utilities -------------------- */

/**
 * Try to find gridcells in the current document. If not found,
 * try same-origin iframes (iterates and checks contentDocument).
 * Returns an array of HTMLElement grid cells or empty array.
 */
function findGridCellsAcrossFrames(): HTMLElement[] {
  // First try main document
  let cells = Array.from(document.querySelectorAll('[role="gridcell"]')) as HTMLElement[];
  if (cells.length > 0) return cells;

  // Try same-origin iframes (safe access in try/catch)
  const iframes = Array.from(document.querySelectorAll("iframe")) as HTMLIFrameElement[];
  for (const iframe of iframes) {
    try {
      const doc = iframe.contentDocument;
      if (!doc) continue;
      const innerCells = Array.from(doc.querySelectorAll('[role="gridcell"]')) as HTMLElement[];
      if (innerCells.length > 0) return innerCells;
      // also try deeper nested iframes inside this iframe
      const innerIframes = Array.from(doc.querySelectorAll("iframe")) as HTMLIFrameElement[];
      for (const inner of innerIframes) {
        try {
          const doc2 = inner.contentDocument;
          if (!doc2) continue;
          const deeper = Array.from(doc2.querySelectorAll('[role="gridcell"]')) as HTMLElement[];
          if (deeper.length > 0) return deeper;
        } catch { /* cross-origin or blocked */ }
      }
    } catch {
      // cross-origin iframe -> ignore
    }
  }

  return [];
}

/**
 * Build row map (rowIndex -> cells array) from a set of grid cell elements.
 */
function buildRowsFromCells(cells: HTMLElement[]): Map<number, string[]> {
  const rowsMap = new Map<number, string[]>();
  cells.forEach((cellEl) => {
    const ariaRow = cellEl.getAttribute("aria-rowindex");
    const ariaCol = cellEl.getAttribute("aria-colindex");
    const rowIndex = ariaRow ? parseInt(ariaRow, 10) : undefined;
    const colIndex = ariaCol ? parseInt(ariaCol, 10) : undefined;
    const text = cellEl.innerText?.trim() ?? "";

    if (typeof rowIndex === "number") {
      if (!rowsMap.has(rowIndex)) rowsMap.set(rowIndex, []);
      const arr = rowsMap.get(rowIndex)!;
      if (typeof colIndex === "number") arr[colIndex - 1] = text;
      else arr.push(text);
    }
  });
  return rowsMap;
}

/* -------------------- High-level analyze routine -------------------- */

async function runDuplicateDetectionFromRowsMap(rowsMap: Map<number, string[]>) {
  const sortedRowIndices = Array.from(rowsMap.keys()).sort((a, b) => a - b);
  if (sortedRowIndices.length < 2) {
    // nothing to do
    renderOverlaySummary([], 0);
    chrome.runtime.sendMessage({ action: "NO_DUPLICATES" });
    return;
  }

  const header = rowsMap.get(sortedRowIndices[0]) ?? [];

  const dataRows: RowObject[] = [];
  for (const r of sortedRowIndices.slice(1)) {
    const cells = rowsMap.get(r) ?? [];
    const rowText = cells.join(" | ");
    dataRows.push({ rowIndex: r, cells, rowText });
  }

  // Build items for embedding (heuristic: pick useful columns)
  const headerLower = header.map((h) => (h || "").toLowerCase());
  function buildRowString(cells: string[]) {
    const preferred = ["title", "summary", "description", "steps", "repro", "reproduction"];
    const picked: string[] = [];
    for (let i = 0; i < cells.length; i++) {
      const h = headerLower[i] || "";
      const cellText = cells[i] || "";
      if (preferred.some((p) => h.includes(p))) picked.push(cellText);
    }
    if (picked.length === 0) picked.push(...cells.slice(0, 3));
    picked.push(cells.join(" "));
    return picked.filter(Boolean).join(" . ");
  }

  const itemsForEmbedding = dataRows.map((dr) => ({ id: dr.rowIndex, text: buildRowString(dr.cells) }));

  // call transformer util
  const dupResult = await findDuplicates(itemsForEmbedding, DUP_THRESHOLD);
  const pairs = dupResult.pairs ?? [];
  if (!pairs || pairs.length === 0) {
    renderOverlaySummary([], itemsForEmbedding.length);
    lastPairsCount = 0;
    chrome.runtime.sendMessage({ action: "NO_DUPLICATES" });
    return;
  }

  // Map pairs to actual row indices for highlighting
  const groups: Record<number, number[]> = {};
  pairs.forEach((p) => {
    const i = itemsForEmbedding[p.i].id as number;
    const j = itemsForEmbedding[p.j].id as number;
    if (!groups[i]) groups[i] = [];
    groups[i].push(j);
  });

  const duplicateRows = new Set<number>();
  Object.entries(groups).forEach(([rootStr, arr]) => {
    const root = parseInt(rootStr, 10);
    duplicateRows.add(root);
    arr.forEach((r) => duplicateRows.add(r));
  });

  // Apply highlights
  duplicateRows.forEach((rowIndex) => {
    const selector = `[role="gridcell"][aria-rowindex="${rowIndex}"]`;
    const cells = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
    cells.forEach((c) => {
      c.style.backgroundColor = "rgba(255, 230, 230, 0.9)";
      c.style.border = "1px solid rgba(220,20,60,0.6)";
    });
  });

  renderOverlaySummary(pairs, itemsForEmbedding.length);

  lastPairsCount = pairs.length;
  chrome.runtime.sendMessage({
    action: "DUPLICATES_FOUND",
    count: pairs.length,
    rows: Array.from(duplicateRows),
  });
}

/* -------------------- Main analyzer -------------------- */

async function analyzeSheetAndHighlight() {
  try {
    if (!location.href.includes("docs.google.com/spreadsheets")) {
      console.warn("[BugSense] Not a Google Sheet. Skipping.");
      return;
    }

    clearPreviousHighlights();

    // Wait/poll for gridcells (up to timeout)
    const start = Date.now();
    let cells: HTMLElement[] = [];
    while (Date.now() - start < POLL_TIMEOUT_MS) {
      cells = findGridCellsAcrossFrames();
      if (cells.length > 0) break;
      // small delay
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    if (cells.length === 0) {
      // final attempt: fallback to page-level text extraction (best-effort)
      console.warn("[BugSense] No grid cells discovered after wait. Attempting fallback text extraction.");
      const fallbackText = document.querySelector("div.docs-sheet-view")?.innerText || document.body.innerText?.slice(0, 20000);
      if (!fallbackText) {
        // nothing we can do now — render empty overlay and return
        renderOverlaySummary([], 0);
        chrome.runtime.sendMessage({ action: "DUPLICATE_ERROR", error: "No grid cells and no fallback text." });
        return;
      }
      // build fallback items: split lines and analyze
      const lines = fallbackText.split("\n").slice(0, 200).map((l, i) => ({ id: i + 1, text: l }));
      const dupResult = await findDuplicates(lines, DUP_THRESHOLD);
      const pairs = dupResult.pairs ?? [];
      renderOverlaySummary(pairs, lines.length);
      if (pairs.length > 0) {
        chrome.runtime.sendMessage({ action: "DUPLICATES_FOUND", count: pairs.length });
      } else {
        chrome.runtime.sendMessage({ action: "NO_DUPLICATES" });
      }
      return;
    }

    // We have grid cells — build rows and run detection
    const rowsMap = buildRowsFromCells(cells);
    await runDuplicateDetectionFromRowsMap(rowsMap);
  } catch (err) {
    console.error("[BugSense] Duplicate detection error:", err);
    chrome.runtime.sendMessage({ action: "DUPLICATE_ERROR", error: String(err) });
  }
}

/* -------------------- Live watcher -------------------- */

function setupLiveWatcher() {
  if (observer) return;
  const target = document.querySelector("body");
  if (!target) return;

  observer = new MutationObserver((mutations) => {
    const hasChange = mutations.some((m) => m.addedNodes.length > 0 || m.removedNodes.length > 0 || (m.type === "characterData"));
    if (hasChange && document.visibilityState === "visible") {
      // throttle a bit to avoid constant re-runs
      console.log("[BugSense] Sheet changed, re-running duplicate detection...");
      setTimeout(() => analyzeSheetAndHighlight(), 250);
    }
  });

  observer.observe(target, { childList: true, subtree: true, characterData: true });
  console.log("[BugSense] Mutation observer active 🔁");
}

/* -------------------- Init -------------------- */

async function initDuplicateDetector() {
  if (!location.href.includes("docs.google.com/spreadsheets")) return;
  console.log("[BugSense] Initializing Duplicate Bug Detector on Sheet...");
  await analyzeSheetAndHighlight();
  setupLiveWatcher();
}

// Run automatically when sheet tab loads
if (document.readyState === "complete") {
  initDuplicateDetector();
} else {
  window.addEventListener("load", () => initDuplicateDetector());
}

// Manual trigger support
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.action === "RUN_DUPLICATE_SCAN") {
    analyzeSheetAndHighlight();
  }
});
