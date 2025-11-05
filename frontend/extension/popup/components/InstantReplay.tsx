import React, { useEffect, useRef, useState } from "react";
import { FaChevronLeft, FaChevronRight, FaDownload, FaPause, FaPlay } from "react-icons/fa";
import DisplayButton from "../../components/DisplayButton";
import { LuStepBack, LuStepForward } from "react-icons/lu";
import { FaBackwardStep, FaForwardStep } from "react-icons/fa6";

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

    // Cleanup video blob URL to prevent memory leaks
    useEffect(() => {
        return () => {
            if (videoUrl) {
                URL.revokeObjectURL(videoUrl);
            }
        };
    }, [videoUrl]);

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

        if (!screenshots || screenshots.length === 0) {
            setError("No screenshots available for export.");
            return;
        }

        try {
            // save current screenshots in storage (so background can access)
            await chrome.storage.local.set({ replayExportQueue: screenshots });

            // open export page via background (keeps popup lightweight)
            chrome.runtime.sendMessage({ action: "OPEN_REPLAY_EXPORT_PAGE" });

            setIsBuilding(true);
            setBuildProgress(0);

            // show a short message
            setTimeout(() => {
                setIsBuilding(false);
                alert("Replay export started in a separate tab — you can close this popup safely.");
            }, 1000);
        } catch (err) {
            console.error("Failed to start replay export:", err);
            setError(String(err));
        }
    }




    return (
        <div className="space-y-3">
            <DisplayButton name="🔁 Instant Visual Replay" onClick={() => setShowReplay(prev => !prev)} color="dark" title="Toggle replay preview" />

            {showReplay && <>
                <div className="text-sm font-medium text-gray-400 text-center">Instant Visual Replay</div>

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
                                    <FaBackwardStep size={16} className="text-gray-500" />
                                </button>

                                <button
                                    onClick={togglePlay}
                                    className="flex items-center justify-center w-8 h-8 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full shadow-sm transition"
                                    title={playing ? "Pause" : "Play"}
                                >
                                    {playing ? <FaPause size={12} /> : <FaPlay size={15} />}
                                </button>

                                <button
                                    onClick={nextFrame}
                                    className="flex items-center justify-center w-8 h-8 bg-gray-200 hover:bg-gray-300 rounded-full transition"
                                    title="Next Frame"
                                >
                                    <FaForwardStep size={16} className="text-gray-500" />
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

                                <div className="text-xs text-gray-400 text-right">
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
                                <div className="text-xs text-gray-400">{new Date(a.timestamp).toLocaleTimeString()}</div>
                                <div className="text-sm">
                                    <strong>{String(a.type).toUpperCase()}</strong> — <span className="text-gray-400">{JSON.stringify(a.details)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="text-xs text-gray-400 text-center">Shows visual replay (latest ~30-60s snapshots). Export to WebM video.</div>
            </>}
        </div>
    );
}
