/**
 * extension/utils/transformer.ts
 *
 * Minimal wrapper around @xenova/transformers for:
 * - loading a sentence embedding pipeline
 * - embedding texts
 * - computing cosine similarities and detecting duplicates
 *
 * NOTE: This runs in the browser and will download model files on first use.
 */

import { pipeline, env } from "@xenova/transformers";

type TensorLike = {
  tolist?: () => number[][];
  data?: Float32Array;
  dims?: number[];
};

let extractor: any = null;
let initializing = false;

/**
 * Initialize the feature-extraction pipeline (lazy).
 * Uses Xenova/all-MiniLM-L6-v2 (small & performant).
 */
export async function initModel() {
  if (extractor || initializing) return;
  initializing = true;

  try {
    // allowLocalModels is false by default; we rely on hosted model via transformers.js
    // If you want to use local model files, set env.allowLocalModels = true and ensure files are available.
    env.allowLocalModels = false;

    // Load a feature-extraction pipeline which returns embeddings.
    extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  } catch (err) {
    console.error("Failed to initialize transformer pipeline:", err);
    extractor = null;
    throw err;
  } finally {
    initializing = false;
  }
}

/**
 * Embed an array of texts to vectors (JS arrays).
 * Returns number[][] where each item is the embedding vector (length ~384).
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!extractor) {
    await initModel();
  }
  if (!extractor) throw new Error("Transformer extractor not initialized");

  // The extractor may accept an array of strings or a single string.
  // We request pooling mean + normalize so vectors are comparable via cosine.
  const options = { pooling: "mean", normalize: true };

  const output: TensorLike = await extractor(texts, options);
  // Many pipelines return a Tensor-like object with tolist() or `data` + `dims`.
  if (output?.tolist) {
    const arr = output.tolist() as number[][];
    return arr;
  }

  // Fallback: try to read output.data + dims
  if (output?.data && output?.dims) {
    const dims = output.dims[1] || output.dims[0];
    const floatArr = Array.from(output.data as Float32Array);
    const vectors: number[][] = [];
    for (let i = 0; i < floatArr.length; i += dims) {
      vectors.push(floatArr.slice(i, i + dims));
    }
    return vectors;
  }

  throw new Error("Unknown embedding output shape");
}

/**
 * Cosine similarity between two vectors a and b.
 */
export function cosineSimilarity(a: number[], b: number[]) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Given an array of objects with a `text` property (string),
 * returns a mapping of duplicates based on semantic similarity.
 *
 * threshold: cosine similarity threshold (0..1). Default 0.85 (adjustable).
 *
 * Returns:
 * {
 *   embeddings: number[][],
 *   pairs: Array<{i:number, j:number, score:number}>  // pairs above threshold
 * }
 */
export async function findDuplicates(items: { id?: string | number; text: string }[], threshold = 0.85) {
  if (!Array.isArray(items) || items.length === 0) {
    return { embeddings: [], pairs: [] };
  }

  // Concatenate texts (shorten if too long)
  const texts = items.map((it) => {
    // trim long input to ~250 tokens (approx). Keep within model limits.
    const t = (it.text || "").trim();
    if (t.length > 2000) return t.slice(0, 2000);
    return t;
  });

  // Compute embeddings
  const embeddings = await embedTexts(texts);

  // Compute pairwise similarity
  const pairs: Array<{ i: number; j: number; score: number }> = [];
  for (let i = 0; i < embeddings.length; i++) {
    for (let j = i + 1; j < embeddings.length; j++) {
      const score = cosineSimilarity(embeddings[i], embeddings[j]);
      if (score >= threshold) {
        pairs.push({ i, j, score });
      }
    }
  }

  return { embeddings, pairs };
}

