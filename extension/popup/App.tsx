import React, { useState } from "react";
import ScreenshotTool from "./components/ScreenshotTool";
import RecorderTool from "./components/RecorderTool";
import MarkerTool from "./components/MarkerTool";
import GifMaker from "./components/GifMaker";

export default function App() {
  const [activeTool, setActiveTool] = useState<"home" | "marker">("home");
  const [annotateImage, setAnnotateImage] = useState<string | null>(null);

  const handleAnnotate = (image: string) => {
    setAnnotateImage(image);
    setActiveTool("marker");
  };

  // Header used for both main and marker views to keep consistent spacing
  const Header = () => (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">Bug Sense</h2>
        <div className="text-xs text-gray-500">v1.0.0</div>
      </div>
      <div />
    </div>
  );

  if (activeTool === "marker" && annotateImage) {
    return (
      <div className="w-[320px] p-3 bg-white rounded-lg shadow-lg">
        <Header />
        <div className="mt-3">
          <MarkerTool
            image={annotateImage}
            onClose={() => {
              setAnnotateImage(null);
              setActiveTool("home");
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="w-[320px] p-3 bg-white rounded-lg shadow-lg">
      <Header />

      <div className="mt-3 space-y-3">
        <ScreenshotTool onAnnotate={handleAnnotate} />

        <RecorderTool />

        <div className="pt-1">
          <GifMaker />
        </div>

        <button
          className="w-full bg-indigo-600 text-white py-2 rounded-md hover:bg-indigo-700 transition"
          onClick={() => {
            // Analyze sheet placeholder
          }}
        >
          🧠 Analyze Sheet
        </button>
      </div>
    </div>
  );
}
