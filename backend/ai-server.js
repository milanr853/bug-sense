import express from "express";
const app = express();
app.use(express.json());

app.post("/ai/analyze", (req, res) => {
    const { errorText } = req.body;
    res.json({
        title: `Bug: ${errorText?.slice(0, 40) || "Unknown Error"}...`,
        description: `AI analysis of error: ${errorText}`,
        steps: [
            "Open the app",
            "Navigate to the affected page",
            "Perform the action that triggers this error",
        ],
    });
});

app.listen(3000, () => console.log("✅ AI mock server running at http://localhost:3000"));
