// backend/routes/aiAnalysis.js
import express from "express";
import { analyzeBug } from "../services/transformerService.js";

const router = express.Router();

router.post("/analyze", async (req, res) => {
  try {
    const result = await analyzeBug(req.body);
    res.json(result);
  } catch (err) {
    console.error("AI analysis error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
