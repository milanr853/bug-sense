// extension/content/selectionOverlay.ts
type SelectionRect = { x: number; y: number; width: number; height: number };

let overlay: HTMLDivElement | null = null;
let box: HTMLDivElement | null = null;
let active = false;
let cleaned = false;

function createOverlay(): void {
    overlay = document.createElement("div");
    Object.assign(overlay.style, {
        position: "fixed",
        inset: "0",
        background: "rgba(0,0,0,0.25)",
        cursor: "crosshair",
        zIndex: "2147483647",
        userSelect: "none",
        touchAction: "none",
    } as Partial<CSSStyleDeclaration>);

    box = document.createElement("div");
    Object.assign(box.style, {
        position: "absolute",
        border: "2px dashed #00bfff",
        background: "rgba(0, 191, 255, 0.12)",
        boxSizing: "border-box",
        pointerEvents: "none",
    } as Partial<CSSStyleDeclaration>);

    overlay.appendChild(box);
    document.documentElement.appendChild(overlay);
}

function hardRemoveOverlay() {
    if (overlay) overlay.remove();
    overlay = null;
    box = null;
    active = false;
    cleaned = true;
}

function startSingleSelection(): void {
    if (active) return;
    active = true;
    cleaned = false;

    createOverlay();

    let startX = 0;
    let startY = 0;
    let currentPointerId: number | null = null;

    const onPointerDown = (ev: PointerEvent) => {
        if (ev.button !== 0) return;

        ev.preventDefault();
        startX = ev.clientX;
        startY = ev.clientY;
        currentPointerId = ev.pointerId;

        Object.assign(box!.style, {
            left: `${startX}px`,
            top: `${startY}px`,
            width: "0px",
            height: "0px",
        });

        try {
            (ev.target as Element).setPointerCapture(ev.pointerId);
        } catch { }

        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("pointercancel", onPointerCancel);
    };

    const onPointerMove = (ev: PointerEvent) => {
        if (currentPointerId !== ev.pointerId) return;

        const endX = ev.clientX;
        const endY = ev.clientY;

        const x = Math.min(startX, endX);
        const y = Math.min(startY, endY);
        const w = Math.abs(endX - startX);
        const h = Math.abs(endY - startY);

        Object.assign(box!.style, {
            left: `${x}px`,
            top: `${y}px`,
            width: `${w}px`,
            height: `${h}px`,
        });
    };

    const cleanupListeners = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerCancel);
    };

    const onPointerUp = (ev: PointerEvent) => {
        if (currentPointerId !== ev.pointerId) return;

        cleanupListeners();

        const endX = ev.clientX;
        const endY = ev.clientY;
        const rect: SelectionRect = {
            x: Math.min(startX, endX),
            y: Math.min(startY, endY),
            width: Math.abs(endX - startX),
            height: Math.abs(endY - startY),
        };

        // 🚀 Hide overlay instantly (no transparency seen in capture)
        if (overlay) overlay.style.display = "none";

        // Notify background it’s safe to capture
        chrome.runtime.sendMessage({ action: "HIDE_OVERLAY_AND_CAPTURE", rect });

        // Then hard-remove overlay after short delay (cleanup DOM)
        setTimeout(hardRemoveOverlay, 300);
    };

    const onPointerCancel = () => {
        cleanupListeners();
        hardRemoveOverlay();
    };

    const onKeyDown = (ev: KeyboardEvent) => {
        if (ev.key === "Escape") {
            cleanupListeners();
            hardRemoveOverlay();
        }
    };

    overlay!.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
}

/** Listener entry */
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "START_SELECTIVE_CAPTURE") {
        startSingleSelection();
    }
});
