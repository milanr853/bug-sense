// backend/ai-server.js
import express from "express";
import cors from "cors";
import aiAnalysisRoute from "./routes/aiAnalysis.js";

const app = express();
app.use(cors());
app.use(express.json());

// Register route
app.use("/ai", aiAnalysisRoute);

const PORT = 3000;
app.listen(PORT, () => console.log(`🤖 BugSense AI backend running on port ${PORT}`));
