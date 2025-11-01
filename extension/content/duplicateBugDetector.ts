// extension/content/duplicateBugDetector.ts
// Detects duplicate bug entries on Google Sheets using transformer.js embeddings.

import { pipeline } from "@xenova/transformers";

// Helper: cosine similarity
function cosine(a: number[], b: number[]) {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Load model (lazy)
let model: any = null;
async function getModel() {
  if (!model) {
    model = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return model;
}

// Extract sheet text content heuristically
function getSheetTexts(): string[] {
  const cells = Array.from(document.querySelectorAll("div[role='gridcell']"));
  const texts: string[] = [];

  for (const cell of cells) {
    const text = (cell as HTMLElement).innerText?.trim() || "";
    if (text && text.length > 3) texts.push(text);
  }

  // deduplicate identical strings before embedding
  return Array.from(new Set(texts));
}

// Highlight duplicates visually
function highlightDuplicates(pairs: [string, string][]) {
  const cells = Array.from(document.querySelectorAll("div[role='gridcell']")) as HTMLElement[];
  for (const [a, b] of pairs) {
    for (const cell of cells) {
      const text = cell.innerText?.trim();
      if (text === a || text === b) {
        cell.style.outline = "2px solid #facc15"; // yellow highlight
      }
    }
  }
}

// Main duplicate detection routine
async function detectDuplicates() {
  try {
    const model = await getModel();
    const texts = getSheetTexts();
    if (texts.length < 2) return;

    const embeddings: number[][] = (await model(texts, { pooling: "mean", normalize: true })).tolist();
    const duplicates: [string, string][] = [];

    for (let i = 0; i < embeddings.length; i++) {
      for (let j = i + 1; j < embeddings.length; j++) {
        const score = cosine(embeddings[i], embeddings[j]);
        if (score > 0.85) {
          duplicates.push([texts[i], texts[j]]);
        }
      }
    }

    if (duplicates.length > 0) {
      highlightDuplicates(duplicates);
      chrome.runtime.sendMessage({
        action: "DUPLICATES_FOUND",
        count: duplicates.length,
      });
    } else {
      chrome.runtime.sendMessage({ action: "NO_DUPLICATES" });
    }
  } catch (err) {
    console.error("Duplicate detection error:", err);
    chrome.runtime.sendMessage({ action: "DUPLICATE_ERROR", error: String(err) });
  }
}

// Listen for popup trigger
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "RUN_DUPLICATE_SCAN") {
    detectDuplicates();
  }
});

