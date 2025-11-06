import React, { useState } from "react";
import ScreenshotTool from "./components/ScreenshotTool";
import RecorderTool from "./components/RecorderTool";
import MarkerTool from "./components/MarkerTool";
import GifMaker from "./components/GifMaker";
import InstantReplay from "./components/InstantReplay";

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
        <div className="text-lg font-semibold text-gray-400 mb-3 flex items-center" >
          <img
            src="../icons/icon48.png"
            alt="Bug Sense icon"
            style={{
              marginRight: 8,
              width: 20,
              height: 20
            }}
          />
          <div>Bug Sense</div>
        </div>
        {/* <div className="text-xs text-gray-400">v1.0.0</div> */}
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
    <div className="w-[320px] p-3 shadow-lg bg-[#0B1220]">
      <Header />

      <div className="mt-3 space-y-3">
        <ScreenshotTool onAnnotate={handleAnnotate} />

        <RecorderTool />

        <GifMaker />

        <InstantReplay />
      </div>
    </div>
  );
}
