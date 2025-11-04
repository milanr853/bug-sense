# 🐞 BugSense — AI-Powered Bug Reporting Chrome Extension

> **BugSense** is an intelligent Chrome DevTools extension designed to help developers and QA testers capture, analyze, and report bugs efficiently using built-in AI models, instant replay, and automated Google Sheet integration.

---

## 🚀 Overview

BugSense is a next-gen debugging assistant that bridges the gap between bug discovery and structured reporting.  
It empowers testers and developers to capture detailed bug reports instantly — including screenshots, screen recordings, and AI-generated reproduction steps.

BugSense integrates directly into the Chrome DevTools panel and context menus, providing seamless workflows for identifying, analyzing, and documenting software issues.

---

## 🧩 Core Architecture

BugSense consists of two main components:

1. **Chrome Extension (Frontend)**
   - Integrated into Chrome DevTools
   - Captures console errors, screenshots, user interactions, and video replay
   - Communicates with the backend AI service for bug analysis
   - Provides an interactive clipboard and Google Sheet integration

2. **AI Backend (Node.js)**
   - Runs transformer-based models (`Xenova/t5-small`, `Xenova/distilgpt2`)
   - Generates intelligent bug summaries, descriptions, and reproduction steps
   - Hosted locally (`http://localhost:3000`)
   - Exposed via a simple REST API `/ai/analyze`

---

## ⚙️ Tech Stack

| Layer | Technology |
|-------|-------------|
| **Frontend** | React + Vite + TypeScript |
| **Extension** | Chrome Manifest v3 |
| **Styling** | TailwindCSS + Inline Styles |
| **Storage** | `chrome.storage.local` |
| **Recording** | Chrome APIs + MediaRecorder |
| **AI Backend** | Node.js + Express + `@xenova/transformers` |
| **Models Used** | `t5-small`, `distilgpt2` |
| **Format Support** | PNG (screenshots), MP4 (recordings), GIF (looped clips) |
| **Integration** | Google Sheets API (planned) |

---

## 🧠 AI Capabilities (Phase 3)

### ✅ Sentiment & Duplicate Detection  
- When the user is on a **Google Sheet tab**, the TransformerJS model performs **sentiment and similarity analysis** on existing bug reports.  
- It identifies **duplicate bugs** (e.g., same issue reported multiple times by different testers).  
- The model compares **Title**, **Description**, **Reproduction Steps**, and **Screenshots**.
- Alerts the tester directly within the sheet (row highlighting or alert message).

### ✅ AI Bug Report Generation (In Progress)
When a QA tester right-clicks a **console error** in DevTools:
- A **context menu option** appears — “🪳 Create bug report from this error.”
- BugSense automatically captures:
  - **Error description**
  - **Title (AI-generated)**
  - **Steps to reproduce (AI-generated)**
  - **Screenshot** at the moment of error
  - **Recorded actions** (from replay buffer)
- The bug is then **auto-filled into a clipboard**, ready for insertion into Google Sheets.

### ✅ AI Model Integration (Working)
The backend uses:
- `Xenova/t5-small` — for summarization and title generation.
- `Xenova/distilgpt2` — for step generation and bug description elaboration.

---

## 🎬 Core Features

### 🧱 PHASE 2 — Core Functionalities
| Feature | Status | Description |
|----------|---------|-------------|
| 🖼️ Screenshot Capture | ✅ | Captures an instant screenshot of the tab when the bug is created |
| 🎥 Screen Recording | ✅ | Records lightweight clips for visual context |
| 🖊️ Marker Tool | ✅ | Annotate directly on screenshots without leaving the extension |
| 🔁 Make GIF | ✅ | Converts short recordings into looping GIFs for bug replay |
| ⏪ Instant Replay | ✅ | Silently records last 30 seconds of user activity before a bug occurs |

---

### 🤖 PHASE 3 — AI-Driven Enhancements

| Feature | Status | Description |
|----------|---------|-------------|
| 🧠 Sentiment + Duplicate Detection on Sheets | ✅ | Detects duplicate bug reports and alerts the user |
| 🪄 AI-Generated Title & Description | ✅ | Uses transformer models to auto-generate bug metadata |
| 🔁 AI-Generated Reproduction Steps | 🟡 In Progress | Creates contextual step-by-step reproduction guides |
| 💾 Local Replay + Actions | ✅ | Stores recent user actions (`clicks`, `keypresses`) in `chrome.storage.local` |
| 📋 BugSense Clipboard | ✅ | Saves the last generated bug report locally — read-only and reusable |
| 🧾 Google Sheets Integration | 🔜 | Automatically appends bug reports into structured sheet rows |
| 🧩 Context Menu Action | 🔜 | “Create bug report from this error” on right-clicking console errors |

---

## 🧰 BugSense Clipboard

- Stores the **most recent bug report**.
- Format:
  ```json
  {
    "title": "Auto-generated bug title",
    "description": "Detailed summary of the issue",
    "steps": ["1. Step one", "2. Step two"],
    "screenshotDataUrl": "...",
    "createdAt": "ISO timestamp",
    "source": { "type": "console", "raw": {} },
    "replayActions": []
  }
