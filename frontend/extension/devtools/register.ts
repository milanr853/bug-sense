// extension/devtools/register.ts

chrome.devtools.panels.create(
  "Bug Sense", // tab title in DevTools
  "extension/icons/icon48.png", // <--- FIX 1: Make this path root-relative
  "extension/devtools/index.html" // <--- FIX 2: This is the critical change
);