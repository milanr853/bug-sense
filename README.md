# Chrome Bug Helper

An AI-powered Chrome extension built for testers to capture, record, annotate, and analyze bugs.

## Tech Stack

- React + TypeScript + Tailwind
- Node.js (Backend, to be added later)
- Transformers.js for AI inference
- Manifest v3 (CRXJS + Vite)

## Development


---

### **4. Backend files are empty**
✅ That’s fine for now — we’ll implement them during the AI phase.  
But for clarity, add placeholders so Node doesn’t error out:

#### `backend/app.js`
```js
import express from "express";
import aiRoutes from "./routes/aiAnalysis.js";

const app = express();
app.use(express.json());
app.use("/ai", aiRoutes);

app.listen(3000, () => console.log("Backend running on port 3000"));

