import React, { useRef, useState, useEffect } from "react";

interface MarkerToolProps {
  image?: string; // screenshot data URL
  onClose?: () => void;
}

export default function MarkerTool({ image, onClose }: MarkerToolProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [tool, setTool] = useState<"pen" | "rect" | "arrow" | "text">("pen");
  const [color, setColor] = useState("#ff0000");
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [textInput, setTextInput] = useState("");

  useEffect(() => {
    if (!canvasRef.current || !image) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.src = image;
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
    };
  }, [image]);

  const getPos = (e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setDrawing(true);
    setStartPos(getPos(e));
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing || !canvasRef.current || !startPos) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    const current = getPos(e);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";

    ctx.beginPath();
    if (tool === "pen") {
      ctx.moveTo(startPos.x, startPos.y);
      ctx.lineTo(current.x, current.y);
      ctx.stroke();
      setStartPos(current);
    } else {
      // Clear temporary overlay for shapes
      const img = new Image();
      img.src = image!;
      img.onload = () => {
        ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
        ctx.drawImage(img, 0, 0);
        ctx.strokeStyle = color;
        if (tool === "rect") {
          ctx.strokeRect(startPos.x, startPos.y, current.x - startPos.x, current.y - startPos.y);
        } else if (tool === "arrow") {
          const dx = current.x - startPos.x;
          const dy = current.y - startPos.y;
          const angle = Math.atan2(dy, dx);
          ctx.moveTo(startPos.x, startPos.y);
          ctx.lineTo(current.x, current.y);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(current.x, current.y);
          ctx.lineTo(current.x - 10 * Math.cos(angle - Math.PI / 6), current.y - 10 * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(current.x - 10 * Math.cos(angle + Math.PI / 6), current.y - 10 * Math.sin(angle + Math.PI / 6));
          ctx.closePath();
          ctx.fillStyle = color;
          ctx.fill();
        }
      };
    }
  };

  const stopDrawing = () => setDrawing(false);

  const addText = () => {
    if (!canvasRef.current || !textInput) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    ctx.font = "20px sans-serif";
    ctx.fillStyle = color;
    ctx.fillText(textInput, 50, 50);
    setTextInput("");
  };

  const saveAnnotated = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `bug-sense-annotated-${Date.now()}.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  return (
    <div className="p-3 bg-white rounded-lg shadow-lg">
      <h3 className="font-semibold mb-2 text-gray-700">🖊️ Marker Tool</h3>

      <div className="flex space-x-2 mb-3">
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
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        <button
          onClick={saveAnnotated}
          className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600"
        >
          💾 Save
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="bg-gray-300 text-black px-3 py-1 rounded text-sm hover:bg-gray-400"
          >
            ✖ Close
          </button>
        )}
      </div>

      {tool === "text" && (
        <div className="flex space-x-2 mb-2">
          <input
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Enter text"
            className="border px-2 py-1 text-sm rounded w-full"
          />
          <button
            onClick={addText}
            className="bg-blue-500 text-white px-2 rounded text-sm hover:bg-blue-600"
          >
            Add
          </button>
        </div>
      )}

      <div className="relative">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          className="border rounded cursor-crosshair max-w-full"
        />
      </div>
    </div>
  );
}

