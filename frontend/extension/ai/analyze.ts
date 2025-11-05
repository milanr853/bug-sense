import { pipeline, env } from "@xenova/transformers";

// ==============================
// 🔧 Environment Configuration (Type-safe)
// ==============================

// Disable all WebAssembly (WASM) backends — blocked by Chrome CSP
(env.backends.onnx.wasm as any).wasmPaths = "";
(env.backends.onnx.wasm as any).proxy = false;
(env.backends.onnx.wasm as any).simd = false;
(env.backends.onnx.wasm as any).numThreads = 1;

// Disable local model access (since extensions can't serve local assets)
env.allowLocalModels = false;

// Enable fetching models from Hugging Face CDN
env.allowRemoteModels = true;

// Force safe CPU-only backend
(env.backends.onnx as any).threads = 1;
(env.backends.onnx as any).preferJS = true;

// Reduce concurrency (safe for Chrome extensions)
(env as any).maxConcurrency = 1;

// ==============================
// 🧠 Model Initialization
// ==============================
let summarizer: any = null;
let textGenerator: any = null;

export async function initAI() {
    if (!summarizer) {
        console.log("[BugSense AI] Loading summarizer model...");
        summarizer = await pipeline("summarization", "Xenova/t5-small", {
            revision: "main", quantized: true,
        });
        console.log("[BugSense AI] Summarizer ready ✅");
    }

    if (!textGenerator) {
        console.log("[BugSense AI] Loading text generator model...");
        textGenerator = await pipeline("text-generation", "Xenova/distilgpt2", {
            revision: "main", quantized: true,
        });
        console.log("[BugSense AI] Text generator ready ✅");
    }
}

// ==============================
// 🧩 Main AI Analysis Function
// ==============================
export async function analyzeBug(input: {
    console?: any;
    selectionText?: string;
    srcUrl?: string;
    linkUrl?: string;
    screenshot?: string | null;
    replayActions?: any[];
}) {
    const { console: consoleError, selectionText, srcUrl, linkUrl, replayActions } = input;

    // Build contextual prompt for AI
    let contextText = "";
    if (consoleError) {
        contextText = `
Error: ${consoleError.message || ""}
File: ${consoleError.filename || "unknown"}
Line: ${consoleError.lineno || ""}
Stack: ${consoleError.stack || ""}
`;
    } else if (selectionText) {
        contextText = `UI Bug: User selected this text on the page: "${selectionText}"\n`;
    } else if (srcUrl) {
        contextText = `UI Bug: User right-clicked this image: "${srcUrl}"\n`;
    } else if (linkUrl) {
        contextText = `UI Bug: User right-clicked this link: "${linkUrl}"\n`;
    }

    contextText += `\nActions before error: ${JSON.stringify(
        replayActions?.slice(-5) || [],
        null,
        2
    )}`;

    // Ensure AI models are initialized
    await initAI();

    try {
        // Add loading feedback to console
        console.log("🤖 Analyzing with BugSense AI...");

        // 1️⃣ Generate concise title
        const titleSummary = await summarizer(`Summarize this bug: ${contextText}`, {
            max_length: 25,
            min_length: 8,
        });

        // 2️⃣ Generate a detailed description
        const descSummary = await summarizer(
            `Explain the issue clearly for a developer: ${contextText}`,
            { max_length: 80, min_length: 30 }
        );

        // 3️⃣ Generate reproducible steps
        const stepsGen = await textGenerator(
            `Based on this bug, describe how to reproduce it: ${contextText}\nSteps:\n1.`,
            { max_length: 100, temperature: 0.8 }
        );

        const steps = stepsGen[0].generated_text
            .split("\n")
            .filter((s: string) => s.trim().match(/^\d+\./))
            .slice(0, 5);

        console.log("✅ AI generation complete");

        return {
            title: titleSummary?.[0]?.summary_text || "Auto Bug Report",
            description:
                descSummary?.[0]?.summary_text ||
                consoleError?.message ||
                selectionText ||
                srcUrl ||
                linkUrl ||
                "Bug captured",
            steps:
                steps.length > 0
                    ? steps
                    : [
                        "1. Observe the error or selected text on the page",
                        "2. Follow actions similar to replay buffer",
                    ],
        };
    } catch (err) {
        console.error("AI call failed:", err);
        return {
            title: "AI Model Unavailable",
            description:
                "BugSense AI failed to generate bug details. Please retry or check connectivity.",
            steps: ["1. Capture screenshot", "2. Note down observed issue manually"],
        };
    }
}
