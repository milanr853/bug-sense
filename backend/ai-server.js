// backend/ai-server.js
import express from "express";
import cors from "cors";
import aiAnalysisRoute from "./routes/aiAnalysis.js";

const app = express();
app.use(cors());
// ✅ --- THIS IS THE FIX ---
// Increase the JSON payload limit to 50mb to allow for screenshots
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Register route
app.use("/ai", aiAnalysisRoute);

const PORT = 3000;
app.listen(PORT, () => console.log(`🤖 BugSense AI backend running on port ${PORT}`));
