import React, { useState, useRef } from "react";
import GIF from "gif.js.optimized";

export default function GifMaker() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleSelectVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
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
    canvas.width = 480;
    canvas.height = 270;

    const gif = new GIF({
      workers: 2,
      quality: 10,
      workerScript: chrome.runtime.getURL("assets/_commonjsHelpers-DaWZu8wl.js"), // fallback path handled by Vite
    });

    const frames: string[] = [];
    await video.play();

    const captureFrame = () => {
      if (video.ended || frames.length > 40) {
        video.pause();
        finalizeGIF();
        return;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      gif.addFrame(ctx, { copy: true, delay: 100 });
      frames.push("frame");
      requestAnimationFrame(captureFrame);
    };

    const finalizeGIF = () => {
      gif.on("finished", (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        setGifUrl(url);
        setGenerating(false);
      });
      gif.render();
    };

    captureFrame();
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
        🎬 Select Recording to Convert
      </label>
      <input
        type="file"
        accept="video/webm"
        onChange={handleSelectVideo}
        className="border rounded px-2 py-1 text-sm w-full"
      />

      {videoUrl && (
        <div className="text-center mt-2">
          <video src={videoUrl} controls className="rounded-lg w-full max-h-48 shadow" />
          <button
            onClick={generateGIF}
            disabled={generating}
            className={`mt-2 w-full ${
              generating ? "bg-gray-400" : "bg-purple-500 hover:bg-purple-600"
            } text-white py-2 rounded-lg`}
          >
            {generating ? "Generating GIF..." : "🔁 Create GIF"}
          </button>
        </div>
      )}

      {gifUrl && (
        <div className="mt-4 text-center">
          <img src={gifUrl} alt="Generated GIF" className="rounded-lg mx-auto shadow-md" />
          <button
            onClick={downloadGIF}
            className="mt-2 bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded"
          >
            💾 Download GIF
          </button>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

