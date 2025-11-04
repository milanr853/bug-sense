// extension/recorder.js
// Final version — no extra popup window, just inline preview in same recorder tab.

let stream = null;
let mediaRecorder = null;
let chunks = [];

const startBtn = document.getElementById("startBtn");
const statusText = document.getElementById("status");
const previewSection = document.getElementById("previewSection");
const preview = document.getElementById("preview");

function setUI(isRecording) {
    if (isRecording) {
        startBtn.disabled = true;
        startBtn.classList.add("opacity-50", "cursor-not-allowed");
        statusText.textContent = "🔴 Recording in progress...";
        previewSection.classList.add("hidden");
    } else {
        startBtn.disabled = false;
        startBtn.classList.remove("opacity-50", "cursor-not-allowed");
        statusText.textContent = "🟢 Ready to record";
    }
}

async function startRecording() {
    try {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        chunks = [];

        try {
            mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9" });
        } catch {
            mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm" });
        }

        mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
            try {
                const blob = new Blob(chunks, { type: "video/webm" });
                const url = URL.createObjectURL(blob);
                preview.src = url;
                preview.autoplay = true;
                previewSection.classList.remove("hidden");

                await chrome.storage.local.set({ recordedVideo: url, isRecording: false });
                setUI(false);
                stream?.getTracks().forEach((t) => t.stop());

                // 🧹 Removed: No new preview window is created
            } catch (err) {
                console.error("Finalize error:", err);
            } finally {
                mediaRecorder = null;
                stream = null;
                chunks = [];
            }
        };

        mediaRecorder.start();
        await chrome.storage.local.set({ isRecording: true });
        setUI(true);

        // Automatically stop when Chrome's native “Stop sharing” is clicked
        stream.getVideoTracks().forEach((t) =>
            t.addEventListener("ended", () => {
                if (mediaRecorder?.state === "recording") {
                    mediaRecorder.stop();
                }
            })
        );
    } catch (err) {
        console.error("getDisplayMedia error:", err);
        alert("Screen capture permission denied or failed.");
        setUI(false);
    }
}

startBtn.addEventListener("click", startRecording);
setUI(false);
