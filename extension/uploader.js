// extension/uploader.js
// Final version: GIF never appears in main popup, safe & clean processing.

import GIF from "gif.js.optimized";
window.GIF = GIF;

(async function () {
  console.log("[BugSense Uploader] Started");

  const MAX_SIZE = 50 * 1024 * 1024;
  const MAX_SECONDS = 6;
  const FPS = 8;
  const MAX_FRAMES = Math.min(MAX_SECONDS * FPS, 48);

  const el = (id) => document.getElementById(id);
  const fileInput = el("file");
  const startBtn = el("start");
  const closeBtn = el("close");
  const status = el("status");
  const previewImg = el("preview");
  const videoEl = el("video");
  const canvas = el("canvas");
  let controls = el("controls");

  if (!controls) {
    controls = document.createElement("div");
    controls.id = "controls";
    controls.style.marginTop = "10px";
    document.body.appendChild(controls);
  }

  // 🔹 Immediately clear any leftover public key (prevents popup flash)
  chrome.storage.local.remove("generatedGifFromUploader", () => {
    console.log("[BugSense Uploader] Pre-cleaned leftover keys.");
  });

  const safeSetStatus = (msg) => {
    if (status && document.visibilityState === "visible") status.textContent = msg;
    console.log("[Uploader]", msg);
  };

  closeBtn?.addEventListener("click", () => window.close());

  startBtn?.addEventListener("click", async () => {
    const file = fileInput?.files?.[0];
    if (!file) return alert("Please choose a file first.");
    if (file.size > MAX_SIZE) return alert("File too large (max 50MB).");

    // Reset UI
    previewImg.style.display = "none";
    previewImg.src = "";
    controls.innerHTML = "";
    safeSetStatus("Loading video...");

    try {
      const url = URL.createObjectURL(file);
      videoEl.src = url;
      videoEl.muted = true;
      videoEl.playsInline = true;

      await new Promise((res, rej) => {
        videoEl.onloadedmetadata = res;
        videoEl.onerror = rej;
      });

      const duration = Math.min(videoEl.duration || MAX_SECONDS, MAX_SECONDS);
      const framesToCapture = Math.min(Math.ceil(duration * FPS), MAX_FRAMES);

      const targetW = 480;
      const targetH = 270;
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      const gif = new GIF({
        workers: 2,
        quality: 8,
        width: targetW,
        height: targetH,
        workerScript: chrome.runtime.getURL("extension/assets/gif.worker.js"),
        background: "#000",
        repeat: 0,
      });

      let captured = 0;
      for (let i = 0; i < framesToCapture; i++) {
        const t = i / FPS;
        videoEl.currentTime = Math.min(t, duration - 0.05);
        await new Promise((res) => (videoEl.onseeked = res));

        ctx.clearRect(0, 0, targetW, targetH);
        const vw = videoEl.videoWidth || targetW;
        const vh = videoEl.videoHeight || targetH;
        const aspect = vw / vh;
        let drawW = targetW,
          drawH = targetH;
        if (vw > vh) drawH = Math.round(targetW / aspect);
        else drawW = Math.round(targetH * aspect);
        const dx = Math.floor((targetW - drawW) / 2);
        const dy = Math.floor((targetH - drawH) / 2);
        ctx.drawImage(videoEl, 0, 0, vw, vh, dx, dy, drawW, drawH);

        gif.addFrame(ctx, { copy: true, delay: 1000 / FPS });
        captured++;
        safeSetStatus(`Captured ${captured}/${framesToCapture} frames...`);
      }

      safeSetStatus("Rendering GIF (please wait)...");

      gif.on("finished", async (blob) => {
        const blobUrl = URL.createObjectURL(blob);
        previewImg.src = blobUrl;
        previewImg.style.display = "block";
        safeSetStatus("GIF ready 🎉");

        // --- Download button ---
        const downloadBtn = document.createElement("button");
        downloadBtn.textContent = "⬇️ Download GIF";
        downloadBtn.style.marginRight = "8px";
        downloadBtn.onclick = async () => {
          try {
            const blobData = await blob.arrayBuffer();
            const blobCopy = new Blob([blobData], { type: "image/gif" });
            const url = URL.createObjectURL(blobCopy);
            const a = document.createElement("a");
            a.href = url;
            a.download = "bugsense_output.gif";
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
          } catch (err) {
            console.error("Download error:", err);
            alert("Failed to download GIF: " + err.message);
          }
        };

        // --- Copy link ---
        const copyBtn = document.createElement("button");
        copyBtn.textContent = "📋 Copy Path";
        copyBtn.style.marginRight = "8px";
        copyBtn.onclick = async () => {
          try {
            await navigator.clipboard.writeText(blobUrl);
            alert("GIF Blob URL copied!");
          } catch (err) {
            alert("Clipboard error: " + err.message);
          }
        };

        // --- Close button ---
        const manualCloseBtn = document.createElement("button");
        manualCloseBtn.textContent = "❌ Close";
        manualCloseBtn.onclick = () => window.close();

        controls.appendChild(downloadBtn);
        controls.appendChild(copyBtn);
        controls.appendChild(manualCloseBtn);

        // --- Store privately (popup won't detect this key) ---
        chrome.storage.local.set({ generatedGif_temp_private: blobUrl }, () => {
          console.log("[BugSense Uploader] Stored privately (not visible to popup).");
          setTimeout(() => {
            chrome.storage.local.remove("generatedGif_temp_private");
          }, 1000);
        });

        // 🚫 No message to popup anymore
        // chrome.runtime.sendMessage({ action: "GIF_READY", url: blobUrl });
      });

      gif.render();
    } catch (err) {
      console.error("Processing failed:", err);
      alert("GIF generation failed: " + err.message);
      safeSetStatus("Error during processing.");
    }
  });
})();
