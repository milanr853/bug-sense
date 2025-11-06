
---

### ⚠️ Important Note — Auth Failure in Spreadsheet Analysis

If you encounter an **authentication failure error** in the console while running the **Spreadsheet Analysis** feature, it usually indicates a **mismatch in the Extension ID**.

#### 🛠️ How to Fix
1. Go to your **Google Cloud Console**.
2. Locate your project associated with this extension.
3. Update the **OAuth Client ID / Item ID** with the **latest Extension ID**.
4. Save and redeploy the changes.

> 💡 **Tip:** This issue typically occurs after reinstalling or regenerating the browser extension.  
> Ensure the Extension ID matches the one shown in your extension’s `manifest.json`.

---
