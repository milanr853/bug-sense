import React, { useRef, useState } from "react";
import GIF from "gif.js.optimized";

export default function GifMaker() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // size limit: 50 MB. If larger, reject to avoid crash.
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
  const MAX_SECONDS = 6; // capture at most first 6 seconds
  const MAX_FRAMES = 40;

  const handleSelectVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      alert("Selected file is too large. Please use a shorter recording (< 50MB).");
      return;
    }

    // Use FileReader -> dataURL (safe path), but with error handling
    const reader = new FileReader();
    reader.onerror = (err) => {
      console.error("File read error", err);
      alert("Failed to read file. Try a smaller file.");
    };
    reader.onload = () => {
      setVideoUrl(reader.result as string);
    };
    try {
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("FileReader threw", err);
      alert("Unable to read file.");
    }
  };

  const generateGIF = async () => {
    if (!videoUrl || !canvasRef.current) return;
    setGenerating(true);

    const video = document.createElement("video");
    video.src = videoUrl;
    video.muted = true;
    video.crossOrigin = "anonymous";

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;
    // set reasonable canvas size
    canvas.width = 480;
    canvas.height = 270;

    // Create GIF instance
    const gif = new GIF({
      workers: 2,
      quality: 10,
      workerScript: chrome.runtime.getURL("assets/_commonjsHelpers-DaWZu8wl.js"), // fallback
    });

    // capture frames up to MAX_FRAMES or first MAX_SECONDS
    await video.play().catch((err) => {
      console.error("Video play failed:", err);
      setGenerating(false);
      alert("Unable to play the video for GIF generation.");
    });

    let framesCaptured = 0;
    const captureFrame = () => {
      // stop conditions
      if (video.ended || framesCaptured >= MAX_FRAMES || video.currentTime >= MAX_SECONDS) {
        video.pause();
        finalize();
        return;
      }

      // draw and add frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      try {
        gif.addFrame(ctx, { copy: true, delay: 100 });
      } catch (err) {
        console.error("gif.addFrame error", err);
      }
      framesCaptured++;
      // capture next frame after slight delay to allow video to progress
      setTimeout(() => {
        captureFrame();
      }, 100); // ~10fps
    };

    const finalize = () => {
      gif.on("finished", (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        setGifUrl(url);
        setGenerating(false);
      });
      try {
        gif.render();
      } catch (err) {
        console.error("gif.render error", err);
        alert("GIF generation failed. Try a smaller clip.");
        setGenerating(false);
      }
    };

    // start capturing after a little delay to ensure frames available
    setTimeout(() => captureFrame(), 250);
  };

  const downloadGIF = () => {
    if (!gifUrl) return;
    const a = document.createElement("a");
    a.href = gifUrl;
    a.download = `bug-sense-gif-${Date.now()}.gif`;
    a.click();
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">
        🎬 Select Recording to Convert (max 50MB, first 6s)
      </label>
      <input
        type="file"
        accept="video/webm,video/mp4"
        onChange={handleSelectVideo}
        className="border rounded px-2 py-1 text-sm w-full"
      />

      {videoUrl && (
        <div className="text-center mt-2">
          <video src={videoUrl} controls className="rounded-lg w-full max-h-48 shadow" />
          <button
            onClick={generateGIF}
            disabled={generating}
            className={`mt-2 w-full ${generating ? "bg-gray-400" : "bg-purple-500 hover:bg-purple-600"} text-white py-2 rounded-lg`}
          >
            {generating ? "Generating GIF..." : "🔁 Create GIF"}
          </button>
        </div>
      )}

      {gifUrl && (
        <div className="mt-4 text-center">
          <img src={gifUrl} alt="Generated GIF" className="rounded-lg mx-auto shadow-md" />
          <button onClick={downloadGIF} className="mt-2 bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded">💾 Download GIF</button>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
