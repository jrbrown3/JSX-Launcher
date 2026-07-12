// Clicking the toolbar icon opens the launcher in a new tab.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("launcher.html") });
});
