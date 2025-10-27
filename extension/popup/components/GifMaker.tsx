import React, { useState, useRef } from "react";



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

    const frames: string[] = [];

    await video.play();
    let frameCount = 0;

    const captureFrame = () => {
      if (frameCount > 40) {
        video.pause();
        createGIF(frames);
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL("image/webp"));
      frameCount++;
      requestAnimationFrame(captureFrame);
    };

    captureFrame();
  };

  const createGIF = (frames: string[]) => {
    const delay = 100; // ms between frames
    const gifBlob = new Blob(frames, { type: "image/webp" });
    const gifUrl = URL.createObjectURL(gifBlob);
    setGifUrl(gifUrl);
    setGenerating(false);
  };

  const downloadGIF = () => {
    if (!gifUrl) return;
    const a = document.createElement("a");
    a.href = gifUrl;
    a.download = `bug-sense-gif-${Date.now()}.webp`;
    a.click();
  };

  return (
    <div className="w-full">
      <label className="w-full bg-yellow-500 text-white py-2 rounded-lg hover:bg-yellow-600 cursor-pointer text-center block">
        🎬 Select Recording
        <input
          type="file"
          accept="video/webm"
          onChange={handleSelectVideo}
          className="hidden"
        />
      </label>


      {videoUrl && (
        <div className="mt-3 text-center">
          <video
            src={videoUrl}
            controls
            className="rounded-lg shadow-md w-full max-h-48"
          ></video>
          <button
            onClick={generateGIF}
            disabled={generating}
            className={`mt-2 px-3 py-1 rounded text-white ${generating
              ? "bg-gray-400"
              : "bg-purple-500 hover:bg-purple-600"
              }`}
          >
            {generating ? "Generating..." : "Generate GIF"}
          </button>
        </div>
      )}

      {gifUrl && (
        <div className="mt-4 text-center">
          <img src={gifUrl} alt="Generated GIF" className="mx-auto rounded" />
          <button
            onClick={downloadGIF}
            className="mt-2 bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600"
          >
            💾 Download GIF
          </button>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

