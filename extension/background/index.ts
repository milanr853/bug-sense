chrome.runtime.onInstalled.addListener(() => {
  console.log("Chrome Bug Helper Extension Installed ✅");

  chrome.contextMenus.create({
    id: "createBugReport",
    title: "Create bug report from this error",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "createBugReport" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      action: "CREATE_BUG_REPORT",
      data: info.selectionText
    });
  }
});

