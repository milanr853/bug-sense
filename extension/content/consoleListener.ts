// extension/content/consoleListener.ts  (append or ensure similar exists)
(function () {
    const KEY = "recentConsoleErrors";
    function pushError(payload: any) {
        try {
            chrome.storage.local.get([KEY], (res) => {
                const arr = Array.isArray(res?.[KEY]) ? res[KEY] : [];
                arr.push({ ...payload, ts: Date.now() });
                // limit length
                const keep = arr.slice(-100);
                chrome.storage.local.set({ [KEY]: keep }, () => { });
            });
        } catch (err) {
            // ignore
        }
    }

    // capture runtime errors
    window.addEventListener("error", (ev: ErrorEvent) => {
        pushError({
            type: "runtime",
            message: ev.message,
            filename: ev.filename,
            lineno: ev.lineno,
            colno: ev.colno,
            stack: ev.error?.stack || null
        });
    });

    // capture unhandled rejections
    window.addEventListener("unhandledrejection", (ev) => {
        pushError({
            type: "promise",
            message: ev.reason?.message || String(ev.reason),
            detail: ev.reason,
            stack: ev.reason?.stack || null
        });
    });

    // wrap console.error (best-effort, inside page)
    const origConsoleError = console.error?.bind(console) || ((...args: any[]) => { });
    console.error = function (...args: any[]) {
        try {
            pushError({ type: "console", message: args.map(x => (typeof x === "string" ? x : JSON.stringify(x))).join(" "), raw: args, ts: Date.now() });
        } catch { }
        origConsoleError(...args);
    };
})();
