// extension/popup/components/InstantReplay.tsx
import React, { useEffect, useState, useRef } from "react";

/**
 * InstantReplay popup component
 * - Loads recentScreenshots and recentActions from chrome.storage.local
 * - If screenshots available -> shows slideshow (play/pause/prev/next)
 * - If no screenshots -> shows textual list of recent actions
 */

type ScreenshotItem = { screenshot: string; timestamp: number };
type ActionEvent = { type: string; timestamp: number; details: any };

export default function InstantReplay(): JSX.Element {
    const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([]);
    const [actions, setActions] = useState<ActionEvent[]>([]);
    const [playing, setPlaying] = useState(false);
    const [index, setIndex] = useState(0);
    const intervalRef = useRef<number | null>(null);

    useEffect(() => {
        // load both keys
        chrome.storage.local.get(["recentScreenshots", "recentActions"], (res) => {
            if (chrome.runtime.lastError) {
                console.warn("InstantReplay storage.get error:", chrome.runtime.lastError);
            }
            const ss: ScreenshotItem[] = Array.isArray(res?.recentScreenshots) ? res.recentScreenshots : [];
            const ac: ActionEvent[] = Array.isArray(res?.recentActions) ? res.recentActions : [];
            setScreenshots(ss);
            setActions(ac);
            setIndex(0);
        });

        // listen for storage changes (so popup updates live if content script persists while popup open)
        const onChange = (changes: Record<string, chrome.storage.StorageChange>) => {
            if (changes.recentScreenshots) {
                setScreenshots(changes.recentScreenshots.newValue || []);
                setIndex(0);
            }
            if (changes.recentActions) {
                setActions(changes.recentActions.newValue || []);
            }
        };
        chrome.storage.onChanged.addListener(onChange);
        return () => {
            chrome.storage.onChanged.removeListener(onChange);
            stopPlayback();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (playing && screenshots.length > 0) {
            startPlayback();
        } else {
            stopPlayback();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playing, index, screenshots]);

    function startPlayback() {
        stopPlayback(); // clear previous
        const id = window.setInterval(() => {
            setIndex((prev) => {
                const next = prev + 1;
                return next >= screenshots.length ? 0 : next;
            });
        }, 800); // change frames every 800ms (tweak as needed)
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
        setIndex((i) => (i - 1 + screenshots.length) % screenshots.length);
    }

    function nextFrame() {
        setIndex((i) => (i + 1) % screenshots.length);
    }

    function downloadCurrent() {
        if (!screenshots[index]) return;
        const a = document.createElement("a");
        a.href = screenshots[index].screenshot;
        a.download = `replay-frame-${screenshots[index].timestamp}.jpg`;
        a.click();
    }

    // If no screenshots — show textual replay list
    const renderTextual = () => {
        if (!actions || actions.length === 0) {
            return <div className="text-sm text-gray-600">No recent actions to replay yet.</div>;
        }
        const recent = actions
            .slice()
            .reverse()
            .slice(0, 30);
        return (
            <div className="text-left text-sm max-h-48 overflow-auto">
                {recent.map((a, idx) => (
                    <div key={idx} className="py-1 border-b border-gray-100">
                        <div className="text-xs text-gray-500">
                            {new Date(a.timestamp).toLocaleTimeString()}
                        </div>
                        <div className="text-sm">
                            <strong>{String(a.type).toUpperCase()}</strong> —{" "}
                            <span className="text-gray-700">{JSON.stringify(a.details)}</span>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const renderVisual = () => {
        if (!screenshots || screenshots.length === 0) return null;
        const cur = screenshots[index];
        return (
            <div className="space-y-2">
                <div className="bg-black rounded overflow-hidden">
                    <img src={cur.screenshot} alt="replay frame" className="w-full object-contain max-h-48" />
                </div>
                <div className="flex items-center justify-between space-x-2">
                    <div className="flex gap-2">
                        <button onClick={prevFrame} className="px-2 py-1 bg-gray-200 rounded">◀</button>
                        <button onClick={togglePlay} className="px-3 py-1 bg-amber-500 text-white rounded">
                            {playing ? "⏸ Pause" : "▶ Play"}
                        </button>
                        <button onClick={nextFrame} className="px-2 py-1 bg-gray-200 rounded">▶</button>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={downloadCurrent} className="px-2 py-1 bg-green-500 text-white rounded">Download</button>
                        <div className="text-xs text-gray-500">
                            {index + 1}/{screenshots.length} • {new Date(cur.timestamp).toLocaleTimeString()}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-2">
            <div className="text-sm font-medium text-gray-700 text-center">🔁 Instant Visual Replay</div>

            {screenshots && screenshots.length > 0 ? renderVisual() : renderTextual()}

            <div className="text-xs text-gray-500 text-center">
                Shows visual replay (latest ~30s snapshots). If no snapshots available, shows a textual action list.
            </div>
        </div>
    );
}
