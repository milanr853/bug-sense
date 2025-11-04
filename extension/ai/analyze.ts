// extension/ai/analyze.ts
import { pipeline } from "@xenova/transformers";

let summarizer: any = null;
let textGenerator: any = null;

export async function initAI() {
    if (!summarizer) {
        summarizer = await pipeline("summarization", "Xenova/t5-small");
    }
    if (!textGenerator) {
        textGenerator = await pipeline("text-generation", "Xenova/distilgpt2");
    }
}

// Main AI function to generate bug report details
export async function analyzeBug(input: {
    console?: any;
    selectionText?: string; // <--- ADDED THIS,
    srcUrl?: string; // <-- ADD THIS
    linkUrl?: string;
    screenshot?: string | null;
    replayActions?: any[];
}) {
    const { console: consoleError, selectionText, srcUrl, linkUrl, replayActions } = input;

    // --- THIS IS THE NEW LOGIC ---
    // Build context for the AI based on what we have
    let contextText = "";
    if (consoleError) {
        contextText = `
      Error: ${consoleError.message || ""}
      File: ${consoleError.filename || "unknown"}
      Line: ${consoleError.lineno || ""}
      Stack: ${consoleError.stack || ""}
    `;
    } else if (selectionText) {
        contextText = `UI Bug: User selected this text on the page: "${selectionText}"
    `;
    } else if (srcUrl) {
        contextText = `UI Bug: User right-clicked this image: "${srcUrl}"
    `;
    } else if (linkUrl) { // ✅ --- ADD THIS BLOCK ---
        contextText = `
      UI Bug: User right-clicked this link: "${linkUrl}"
    `;
    }
    contextText += `\nActions before error: ${JSON.stringify(
        replayActions?.slice(-5) || [],
        null,
        2
    )}`;
    // --- END OF NEW LOGIC ---

    // Ensure model initialized
    await initAI();

    // 1️⃣ Generate Title
    const titleSummary = await summarizer(`Summarize this bug: ${contextText}`, {
        max_length: 25,
        min_length: 8,
    });

    // 2️⃣ Generate Description
    const descSummary = await summarizer(
        `Explain the issue clearly for a developer: ${contextText}`,
        { max_length: 80, min_length: 30 }
    );

    // 3️⃣ Generate Steps to Reproduce
    const stepsGen = await textGenerator(
        `Based on this bug, describe how to reproduce it: ${contextText}\nSteps:\n1.`,
        { max_length: 100, temperature: 0.8 }
    );

    const steps = stepsGen[0].generated_text
        .split("\n")
        .filter((s: string) => s.trim().startsWith("1.") || s.trim().match(/^\d+\./))
        .slice(0, 5);

    return {
        title: titleSummary[0].summary_text || "Auto Bug Report",
        description:
            descSummary[0].summary_text ||
            consoleError?.message ||
            selectionText ||
            (srcUrl ? `Image bug: ${srcUrl}` : null) ||
            (linkUrl ? `Link bug: ${linkUrl}` : "Bug captured"),
        steps:
            steps.length > 0
                ? steps
                : [
                    "1. Observe the error or selected text on the page",
                    "2. Follow actions similar to replay buffer",
                ],
    };
}