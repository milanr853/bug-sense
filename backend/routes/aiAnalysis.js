import express from "express";
import { analyzeBugs } from "../services/transformerService.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { bugs } = req.body;
  const result = await analyzeBugs(bugs);
  res.json(result);
});

export default router;

