import React, { useRef, useState, useEffect } from "react";
import { IoIosSave } from "react-icons/io";
import { IoClose } from "react-icons/io5";

interface MarkerToolProps {
  image?: string;
  onClose?: () => void;
}

export default function MarkerTool({ image, onClose }: MarkerToolProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<"pen" | "rect" | "arrow" | "text">("pen");
  const [color, setColor] = useState("#ff0000");
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [textInput, setTextInput] = useState("");
  const [textPos, setTextPos] = useState<{ x: number; y: number } | null>(null);
  const backgroundRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!image || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;
    const img = new Image();
    img.src = image;
    img.onload = () => {
      // 🔧 draw at the real pixel size of the screenshot
      const dpr = window.devicePixelRatio || 1;
      canvas.width = img.naturalWidth * dpr;
      canvas.height = img.naturalHeight * dpr;
      ctx.scale(dpr, dpr);
      ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);

      // Keep visible size responsive in popup
      canvas.style.width = "100%";
      canvas.style.height = "auto";

      backgroundRef.current = img;
    };
  }, [image]);

  // map client coords -> canvas pixel coords
  const toCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === "text") {
      const pos = toCanvasCoords(e);
      setTextPos(pos);
      return;
    }

    const pos = toCanvasCoords(e);
    setIsDrawing(true);
    setStartPos(pos);

    // snapshot current canvas state once (for shape overlays)
    if (canvasRef.current) {
      const snap = new Image();
      snap.src = canvasRef.current.toDataURL();
      backgroundRef.current = snap;
    }

    // init pen drawing path
    if (tool === "pen" && canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d")!;
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPos || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d")!;
    const pos = toCanvasCoords(e);

    // pen: continuous without re-draw from snapshot (smooth)
    if (tool === "pen") {
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      return;
    }

    // other tools: redraw snapshot then draw shape overlay
    const bg = backgroundRef.current;
    if (bg) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      ctx.drawImage(bg, 0, 0);
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";

    if (tool === "rect") {
      ctx.strokeRect(startPos.x, startPos.y, pos.x - startPos.x, pos.y - startPos.y);
    } else if (tool === "arrow") {
      ctx.beginPath();
      ctx.moveTo(startPos.x, startPos.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      // arrow head
      const angle = Math.atan2(pos.y - startPos.y, pos.x - startPos.x);
      const headlen = Math.max(8, canvasRef.current.width / 120);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(pos.x - headlen * Math.cos(angle - Math.PI / 6), pos.y - headlen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(pos.x - headlen * Math.cos(angle + Math.PI / 6), pos.y - headlen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
    setStartPos(null);
  };

  const addText = () => {
    if (!canvasRef.current || !textPos || !textInput) return;
    const ctx = canvasRef.current.getContext("2d")!;
    ctx.font = "20px sans-serif";
    ctx.fillStyle = color;
    ctx.fillText(textInput, textPos.x, textPos.y);
    setTextInput("");
    setTextPos(null);
  };

  const saveAnnotated = () => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          console.error("[BugSense] Failed to create annotated blob");
          return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          chrome.runtime.sendMessage(
            { action: "SAVE_ANNOTATED_IMAGE_DATAURL", dataUrl },
            (resp) => {
              if (resp?.success) {
                console.log("[BugSense] Annotated image saved successfully ✅");
              } else {
                console.error("[BugSense] MarkerTool background failed:", resp?.error);
              }
            }
          );
        };
        reader.readAsDataURL(blob);
      },
      "image/jpeg",
      1.0 // maximum quality
    );
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <select
            value={tool}
            onChange={(e) => setTool(e.target.value as any)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="pen">Pen</option>
            <option value="rect">Rectangle</option>
            <option value="arrow">Arrow</option>
            <option value="text">Text</option>
          </select>

          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-10 h-8 p-0 border rounded"
            aria-label="color"
          />
        </div>

        <div className="flex items-center gap-2">
          <button title="Save"
            onClick={saveAnnotated}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1 rounded text-sm"
          >
            <IoIosSave />
          </button>

          <button title="Close"
            onClick={onClose}
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-1 rounded text-sm"
          >
            <IoClose />
          </button>
        </div>
      </div>

      {tool === "text" && (
        <div className="mt-2 flex gap-2">
          <input
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Enter text"
            className="flex-1 border rounded px-2 py-1 text-sm"
          />
          <button onClick={addText} className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm">
            Add
          </button>
        </div>
      )}

      <div className="mt-3 border rounded overflow-hidden bg-black">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="w-full block"
          style={{ cursor: "crosshair", display: "block" }}
        />
      </div>
    </div>
  );
}
