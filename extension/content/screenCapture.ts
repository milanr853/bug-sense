console.log("Screen Capture Content Script loaded 🚀");

let markerOverlay: HTMLDivElement | null = null;
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let drawing = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "SHOW_MARKER_TOOL") {
    const { image } = message;
    createAnnotationOverlay(image);
  }
});

function createAnnotationOverlay(image: string) {
  if (markerOverlay) {
    markerOverlay.remove();
  }

  markerOverlay = document.createElement("div");
  markerOverlay.id = "bug-sense-marker-overlay";
  Object.assign(markerOverlay.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100vw",
    height: "100vh",
    backgroundColor: "rgba(0,0,0,0.3)",
    zIndex: "999999",
    cursor: "crosshair",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  });

  // Create image + canvas container
  const container = document.createElement("div");
  container.style.position = "relative";

  const img = document.createElement("img");
  img.src = image;
  img.style.maxWidth = "90vw";
  img.style.maxHeight = "90vh";
  img.style.border = "2px solid white";
  img.style.borderRadius = "8px";

  canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || 1920;
  canvas.height = img.naturalHeight || 1080;
  canvas.style.position = "absolute";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";

  ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.strokeStyle = "red";
    ctx.lineWidth = 3;
  }

  container.appendChild(img);
  container.appendChild(canvas);
  markerOverlay.appendChild(container);

  document.body.appendChild(markerOverlay);

  addDrawingListeners(canvas);
  addControlButtons(container, img);
}

function addDrawingListeners(canvas: HTMLCanvasElement) {
  canvas.addEventListener("mousedown", () => (drawing = true));
  canvas.addEventListener("mouseup", () => (drawing = false));
  canvas.addEventListener("mousemove", draw);
}

function draw(e: MouseEvent) {
  if (!drawing || !ctx) return;
  const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y);
}

function addControlButtons(container: HTMLDivElement, img: HTMLImageElement) {
  const buttonContainer = document.createElement("div");
  Object.assign(buttonContainer.style, {
    position: "absolute",
    top: "10px",
    right: "10px",
    display: "flex",
    gap: "8px",
  });

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "💾 Save";
  Object.assign(saveBtn.style, {
    backgroundColor: "#10b981",
    color: "white",
    border: "none",
    borderRadius: "6px",
    padding: "6px 12px",
    cursor: "pointer",
  });

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "❌ Cancel";
  Object.assign(cancelBtn.style, {
    backgroundColor: "#ef4444",
    color: "white",
    border: "none",
    borderRadius: "6px",
    padding: "6px 12px",
    cursor: "pointer",
  });

  saveBtn.onclick = () => saveAnnotatedImage(img);
  cancelBtn.onclick = () => markerOverlay?.remove();

  buttonContainer.appendChild(saveBtn);
  buttonContainer.appendChild(cancelBtn);
  container.appendChild(buttonContainer);
}

function saveAnnotatedImage(img: HTMLImageElement) {
  if (!canvas || !ctx) return;

  const tempCanvas = document.createElement("canvas");
  const tempCtx = tempCanvas.getContext("2d")!;
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;

  // Draw base image + annotation
  tempCtx.drawImage(img, 0, 0, canvas.width, canvas.height);
  tempCtx.drawImage(canvas, 0, 0);

  const finalImage = tempCanvas.toDataURL("image/png");

  const link = document.createElement("a");
  link.download = `bug-sense-annotated-${Date.now()}.png`;
  link.href = finalImage;
  link.click();

  markerOverlay?.remove();
}

