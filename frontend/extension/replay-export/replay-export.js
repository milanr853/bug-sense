async function main() {
    const prog = document.getElementById("prog");
    const status = document.getElementById("status");

    const res = await chrome.storage.local.get("replayExportQueue");
    const frames = res.replayExportQueue || [];
    if (!frames.length) {
        status.textContent = "❌ No frames found. Please capture again.";
        return;
    }

    status.textContent = `Preparing ${frames.length} frames...`;

    // Determine target resolution
    const firstBlob = await (await fetch(frames[0].screenshot)).blob();
    const firstBitmap = await createImageBitmap(firstBlob);
    let w = firstBitmap.width, h = firstBitmap.height;
    const MAX_W = 1280;
    if (w > MAX_W) {
        const ratio = MAX_W / w;
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    document.body.appendChild(canvas);

    const stream = canvas.captureStream(25);
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";
    const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 3_000_000,
    });

    const chunks = [];
    recorder.ondataavailable = (e) => e.data && chunks.push(e.data);

    const stopPromise = new Promise((res) => {
        recorder.onstop = () => res(new Blob(chunks, { type: mimeType }));
    });

    recorder.start(100);

    for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        try {
            const blob = await (await fetch(f.screenshot)).blob();
            const bmp = await createImageBitmap(blob, {
                resizeWidth: w,
                resizeHeight: h,
                resizeQuality: "high",
            });
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(bmp, 0, 0, w, h);
            bmp.close();
            prog.value = ((i + 1) / frames.length) * 100;
            status.textContent = `Frame ${i + 1}/${frames.length}`;
            await new Promise((r) => setTimeout(r, 80)); // ~12 fps pacing
        } catch (e) {
            console.warn("Frame failed:", e);
        }
    }

    recorder.stop();
    const blob = await stopPromise;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bug-sense-replay-${Date.now()}.webm`;
    a.click();

    status.textContent = "✅ Export complete!";
    chrome.storage.local.remove("replayExportQueue");
}

main();
