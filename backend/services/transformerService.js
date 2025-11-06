// backend/services/transformerService.js
import { pipeline, env } from "@xenova/transformers";

// Allow remote model loading
env.allowLocalModels = false;
env.allowRemoteModels = true;

// Disable WASM limitations (use Node CPU backend)
env.backends.onnx.wasm.numThreads = 2;
env.backends.onnx.wasm.proxy = false;
env.backends.onnx.wasm.simd = false;

let summarizer = null;
let textGenerator = null;

// Initialize models once
export async function initAI() {
  if (!summarizer) {
    console.log("[BugSense AI] Loading summarizer model...");
    summarizer = await pipeline("summarization", "Xenova/t5-small");
  }
  if (!textGenerator) {
    console.log("[BugSense AI] Loading text generator model...");
    textGenerator = await pipeline("text-generation", "Xenova/distilgpt2");
  }
  console.log("[BugSense AI] Models initialized ✅");
}

// Analyze bug text and generate report
export async function analyzeBug(input = {}) {
  const {
    console: consoleError,
    selectionText,
    srcUrl,
    linkUrl,
    replayActions,
    extraDetails,
  } = input;


  let contextText = "";
  if (consoleError) {
    contextText = `
Error: ${consoleError.message || ""}
File: ${consoleError.filename || "unknown"}
Line: ${consoleError.lineno || ""}
Stack: ${consoleError.stack || ""}
`;
  } else if (selectionText) {
    contextText = `User selected: "${selectionText}"`;
  } else if (srcUrl) {
    contextText = `User right-clicked image: ${srcUrl}`;
  } else if (linkUrl) {
    contextText = `User right-clicked link: ${linkUrl}`;
  }

  contextText += `\nActions before error: ${JSON.stringify(replayActions?.slice(-5) || [], null, 2)}`;

  if (extraDetails) {
    contextText += `\n\n🔍 Additional User Notes:\n${extraDetails}`;
  }

  await initAI();

  const titleSummary = await summarizer(`Summarize this bug: ${contextText}`, {
    max_length: 25,
    min_length: 8,
  });

  const descSummary = await summarizer(
    `Explain the issue clearly for a developer: ${contextText}`,
    { max_length: 80, min_length: 30 }
  );

  const stepsGen = await textGenerator(
    `Based on this bug, describe how to reproduce it: ${contextText}\nSteps:\n1.`,
    { max_length: 100, temperature: 0.8 }
  );

  const steps = stepsGen[0].generated_text
    .split("\n")
    .filter((s) => s.trim().match(/^\d+\./))
    .slice(0, 5);

  return {
    title: titleSummary[0].summary_text || "Auto Bug Report",
    description: descSummary[0].summary_text || "Bug description not available",
    steps:
      steps.length > 0
        ? steps
        : [
          "1. Observe the error on the page",
          "2. Follow actions from replay buffer",
        ],
  };
}
