import React, { useEffect, useRef, useState } from "react";
import { FaDownload, FaPause, FaPlay } from "react-icons/fa";

/**
 * extension/popup/components/InstantReplay.tsx
 *
 * Adds "Session Replay Download" feature: combines screenshots stored in
 * chrome.storage.local.recentScreenshots into a WebM video (client-side)
 * using a Canvas + MediaRecorder.
 *
 * - Preserves frame timing when timestamps exist (clamped to sane ranges).
 * - Shows build progress and allows direct download when ready.
 * - Provides a preview player after building.
 */

type ScreenshotItem = { screenshot: string; timestamp: number };

type ActionEvent = { type: string; timestamp: number; details: any };

const DEFAULT_FRAME_INTERVAL_MS = 800; // used if timestamps not available or identical
const MIN_FRAME_MS = 40; // ~25fps max
const MAX_FRAME_MS = 5000; // cap extremely large gaps

export default function InstantReplay(): JSX.Element {
    const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([]);
    const [actions, setActions] = useState<ActionEvent[]>([]);
    const [playing, setPlaying] = useState(false);
    const [index, setIndex] = useState(0);

    // export-related state
    const [isBuilding, setIsBuilding] = useState(false);
    const [buildProgress, setBuildProgress] = useState(0);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showReplay, setShowReplay] = useState(false);
    const intervalRef = useRef<number | null>(null);

    useEffect(() => {
        chrome.storage.local.get(["recentScreenshots", "recentActions"], (res) => {
            if (chrome.runtime.lastError) {
                console.warn("InstantReplay storage.get error:", chrome.runtime.lastError);
            }
            const ss: ScreenshotItem[] = Array.isArray(res?.recentScreenshots) ? res.recentScreenshots : [];
            const ac: ActionEvent[] = Array.isArray(res?.recentActions) ? res.recentActions : [];
            // Normalize timestamps & sort
            const normalized = ss
                .map((s) => ({ screenshot: s.screenshot, timestamp: Number(s.timestamp) || Date.now() }))
                .sort((a, b) => a.timestamp - b.timestamp);
            setScreenshots(normalized);
            setActions(ac);
            setIndex(0);
        });

        const onChange = (changes: Record<string, chrome.storage.StorageChange>) => {
            if (changes.recentScreenshots) {
                const newVal = changes.recentScreenshots.newValue || [];
                const normalized = Array.isArray(newVal)
                    ? newVal.map((s: any) => ({ screenshot: s.screenshot, timestamp: Number(s.timestamp) || Date.now() })).sort((a: ScreenshotItem, b: ScreenshotItem) => a.timestamp - b.timestamp)
                    : [];
                setScreenshots(normalized);
                setIndex(0);
            }
            if (changes.recentActions) setActions(changes.recentActions.newValue || []);
        };

        chrome.storage.onChanged.addListener(onChange);
        return () => chrome.storage.onChanged.removeListener(onChange);
    }, []);

    useEffect(() => {
        if (playing && screenshots.length > 0) startPlayback();
        else stopPlayback();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playing, index, screenshots]);

    function startPlayback() {
        stopPlayback();
        const id = window.setInterval(() => {
            setIndex((prev) => {
                const next = prev + 1;
                return next >= screenshots.length ? 0 : next;
            });
        }, 800);
        intervalRef.current = id as unknown as number;
    }

    function stopPlayback() {
        if (intervalRef.current !== null) {
            window.clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }

    function togglePlay() {
        setPlaying((p) => !p);
    }

    function prevFrame() {
        setIndex((i) => (i - 1 + screenshots.length) % Math.max(1, screenshots.length));
    }

    function nextFrame() {
        setIndex((i) => (i + 1) % Math.max(1, screenshots.length));
    }

    // ---------- VIDEO BUILDING ----------

    async function buildVideoAndDownload() {
        setError(null);
        setVideoUrl(null);

        if (!screenshots || screenshots.length === 0) {
            setError("No screenshots available for export.");
            return;
        }

        setIsBuilding(true);
        setBuildProgress(0);

        try {
            // Prepare ordered frames
            const frames = screenshots.slice();

            // Compute durations between frames using timestamps
            const durations: number[] = [];
            for (let i = 0; i < frames.length - 1; i++) {
                const dt = Math.max(MIN_FRAME_MS, Math.min(MAX_FRAME_MS, frames[i + 1].timestamp - frames[i].timestamp || DEFAULT_FRAME_INTERVAL_MS));
                durations.push(dt);
            }
            // Last frame duration use default
            durations.push(DEFAULT_FRAME_INTERVAL_MS);

            // Load first image to get natural size
            const firstImg = new Image();
            firstImg.src = frames[0].screenshot;
            await firstImg.decode();
            let targetW = firstImg.naturalWidth || 1280;
            let targetH = firstImg.naturalHeight || 720;

            // cap maximum size to avoid huge memory usage
            const MAX_W = 1280;
            if (targetW > MAX_W) {
                const ratio = MAX_W / targetW;
                targetW = Math.round(targetW * ratio);
                targetH = Math.round(targetH * ratio);
            }

            // create canvas and capture stream
            const canvas = document.createElement("canvas");
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Unable to get canvas context");

            // Try a safe MIME type for Chrome
            const mimeCandidates = [
                "video/webm;codecs=vp9",
                "video/webm;codecs=vp8",
                "video/webm",
            ];

            const stream = (canvas as any).captureStream?.(30) as MediaStream;
            if (!stream) throw new Error("Your browser does not support canvas.captureStream()");

            let recorder: MediaRecorder | null = null;
            let mimeTypeUsed = "video/webm";
            for (const m of mimeCandidates) {
                try {
                    if (!MediaRecorder.isTypeSupported || MediaRecorder.isTypeSupported(m)) {
                        recorder = new MediaRecorder(stream, { mimeType: m });
                        mimeTypeUsed = m;
                        break;
                    }
                } catch (e) {
                    // try next
                }
            }

            // fallback
            if (!recorder) recorder = new MediaRecorder(stream);

            const chunks: BlobPart[] = [];
            recorder.ondataavailable = (ev) => {
                if (ev.data && ev.data.size > 0) chunks.push(ev.data);
            };

            const stopPromise = new Promise<Blob>((resolve, reject) => {
                recorder!.onstop = () => {
                    try {
                        const blob = new Blob(chunks, { type: mimeTypeUsed });
                        resolve(blob);
                    } catch (e) {
                        reject(e);
                    }
                };
            });

            recorder.start(1000 / 30); // hint interval

            // Draw frames sequentially, waiting for the duration of each frame so recorder captures them
            for (let i = 0; i < frames.length; i++) {
                const img = new Image();
                img.src = frames[i].screenshot;
                await img.decode();

                // draw scaled to canvas
                // maintain aspect fit
                const arCanvas = canvas.width / canvas.height;
                const arImg = (img.naturalWidth || canvas.width) / (img.naturalHeight || canvas.height);
                let drawW = canvas.width,
                    drawH = canvas.height,
                    offsetX = 0,
                    offsetY = 0;
                if (arImg > arCanvas) {
                    // image is wider
                    drawW = canvas.width;
                    drawH = Math.round(canvas.width / arImg);
                    offsetY = Math.round((canvas.height - drawH) / 2);
                } else {
                    drawH = canvas.height;
                    drawW = Math.round(canvas.height * arImg);
                    offsetX = Math.round((canvas.width - drawW) / 2);
                }

                ctx.clearRect(0, 0, canvas.width, canvas.height);
                // optional black background
                ctx.fillStyle = "#000";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

                // progress
                setBuildProgress(Math.round(((i + 1) / frames.length) * 100));

                // wait for duration
                const waitMs = Math.max(MIN_FRAME_MS, Math.min(MAX_FRAME_MS, durations[i] || DEFAULT_FRAME_INTERVAL_MS));
                await new Promise((r) => setTimeout(r, waitMs));
            }

            // stop recorder and get blob
            recorder.stop();
            const recordedBlob = await stopPromise;

            // create object URL and prompt download
            const url = URL.createObjectURL(recordedBlob);
            setVideoUrl(url);

            // Auto-download
            const a = document.createElement("a");
            a.href = url;
            a.download = `bug-sense-replay-${Date.now()}.webm`;
            a.click();

            setBuildProgress(100);
            setIsBuilding(false);
        } catch (err: any) {
            console.error("buildVideoAndDownload error:", err);
            setError(String(err?.message || err));
            setIsBuilding(false);
        }
    }

    // function downloadPreview() {
    //     if (!videoUrl) return;
    //     const a = document.createElement("a");
    //     a.href = videoUrl;
    //     a.download = `bug-sense-replay-${Date.now()}.webm`;
    //     a.click();
    // }

    return (
        <div className="space-y-2">
            <button
                onClick={() => setShowReplay(prev => !prev)}
                className="w-full bg-slate-400 hover:bg-slate-500 text-white py-2 rounded-lg transition"
                title="Toggle replay preview"
            >
                🔁 Instant Visual Replay
            </button>

            {showReplay && <>
                <div className="text-sm font-medium text-gray-700 text-center">🔁 Instant Visual Replay</div>

                {screenshots && screenshots.length > 0 ? (
                    <div className="space-y-2">
                        <div className="bg-black rounded overflow-hidden">
                            <img src={screenshots[index].screenshot} alt="replay frame" className="w-full object-contain max-h-48" />
                        </div>

                        <div className="flex items-center justify-between gap-3 py-1">
                            {/* Left controls: prev / play-pause / next */}
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={prevFrame}
                                    className="flex items-center justify-center w-8 h-8 bg-gray-200 hover:bg-gray-300 rounded-full transition"
                                    title="Previous Frame"
                                >
                                    ◀
                                </button>

                                <button
                                    onClick={togglePlay}
                                    className="flex items-center justify-center w-8 h-8 bg-amber-500 hover:bg-amber-600 text-white rounded-full shadow-sm transition"
                                    title={playing ? "Pause" : "Play"}
                                >
                                    {playing ? <FaPause size={12} /> : <FaPlay size={15} />}
                                </button>

                                <button
                                    onClick={nextFrame}
                                    className="flex items-center justify-center w-8 h-8 bg-gray-200 hover:bg-gray-300 rounded-full transition"
                                    title="Next Frame"
                                >
                                    ▶
                                </button>
                            </div>

                            {/* Right controls: download + index/timestamp */}
                            <div className="flex items-center gap-3">
                                <button
                                    title="Download Replay as Video"
                                    onClick={buildVideoAndDownload}
                                    disabled={isBuilding}
                                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md font-medium text-white shadow-sm transition ${isBuilding
                                        ? "bg-indigo-400 cursor-wait"
                                        : "bg-indigo-600 hover:bg-indigo-700"
                                        }`}
                                >
                                    {isBuilding ? (
                                        <span className="text-xs">{`Building... ${buildProgress}%`}</span>
                                    ) : (
                                        <>
                                            <FaDownload size={14} />
                                            <span className="text-xs font-semibold">Export</span>
                                        </>
                                    )}
                                </button>

                                <div className="text-xs text-gray-500 text-right">
                                    {index + 1}/{screenshots.length} • <br />
                                    {new Date(screenshots[index].timestamp).toLocaleTimeString()}
                                </div>
                            </div>
                        </div>


                        {/* progress bar */}
                        {isBuilding && (
                            <div className="w-full bg-gray-200 h-2 rounded overflow-hidden mt-2">
                                <div className="bg-blue-500 h-2" style={{ width: `${buildProgress}%`, transition: "width 0.2s" }} />
                            </div>
                        )}

                        {error && <div className="text-xs text-red-600">{error}</div>}

                        {videoUrl && (
                            <div className="mt-2">
                                <video src={videoUrl} controls className="w-full rounded shadow-md" />
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-sm text-gray-600">No recent screenshots available. Showing textual actions instead.</div>
                )}

                {/* textual fallback */}
                {screenshots.length === 0 && actions && actions.length > 0 && (
                    <div className="text-left text-sm max-h-48 overflow-auto">
                        {actions.slice().reverse().slice(0, 30).map((a, idx) => (
                            <div key={idx} className="py-1 border-b border-gray-100">
                                <div className="text-xs text-gray-500">{new Date(a.timestamp).toLocaleTimeString()}</div>
                                <div className="text-sm">
                                    <strong>{String(a.type).toUpperCase()}</strong> — <span className="text-gray-700">{JSON.stringify(a.details)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="text-xs text-gray-500 text-center">Shows visual replay (latest ~30-60s snapshots). Export to WebM video.</div>
            </>}
        </div>
    );
}
