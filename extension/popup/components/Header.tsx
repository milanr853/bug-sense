// extension/popup/components/Header.tsx

export default function Header() {
  const runDuplicateScan = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: "RUN_DUPLICATE_SCAN" });
      }
    });
  };

  return (
    <div className="flex items-center justify-between">
      <h1 className="text-lg font-semibold text-gray-800">Bug Sense</h1>
      <button
        onClick={runDuplicateScan}
        className="bg-indigo-600 text-white px-2 py-1 text-xs rounded hover:bg-indigo-700"
      >
        🔍 Scan Duplicates
      </button>
    </div>
  );
}
