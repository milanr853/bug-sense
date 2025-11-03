// extension/utils/sheetsAPI.ts
// extension/utils/sheetsAPI.ts
export async function getSheetData(spreadsheetId: string, range: string) {
  return new Promise<any>(async (resolve, reject) => {
    try {
      console.group("[BugSense][getSheetData] start");
      console.log("spreadsheetId:", spreadsheetId);
      console.log("range:", range);

      // 1️⃣ Ask background for token
      const tokenResponse = await new Promise<{ success: boolean; token?: string; error?: any }>((res) => {
        try {
          chrome.runtime.sendMessage({ action: "GET_GOOGLE_TOKEN" }, (response) => {
            res(response);
          });
        } catch (sendErr) {
          console.error("[BugSense][getSheetData] sendMessage threw:", sendErr);
          res({ success: false, error: sendErr });
        }
      });

      console.log("[BugSense][getSheetData] tokenResponse:", tokenResponse);

      if (!tokenResponse?.success || !tokenResponse.token) {
        console.error("[BugSense][getSheetData] Failed to get token:", tokenResponse?.error);
        console.groupEnd();
        return reject(tokenResponse?.error || new Error("Failed to get token"));
      }

      const token = tokenResponse.token;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?majorDimension=ROWS`;

      console.log("[BugSense][getSheetData] fetch url:", url);

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      console.log(`[BugSense][getSheetData] fetch status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const text = await response.text().catch(() => "<could not read response body>");
        console.error("[BugSense][getSheetData] fetch returned non-ok:", response.status, text);
        console.groupEnd();
        return reject(new Error(`Sheets API error ${response.status}: ${text}`));
      }

      const data = await response.json().catch((e) => {
        console.error("[BugSense][getSheetData] json parse error:", e);
        return null;
      });

      console.log("[BugSense][getSheetData] response data:", data);
      console.groupEnd();
      resolve(data);
    } catch (err) {
      console.error("[BugSense][getSheetData] outer catch:", err);
      reject(err);
    }
  });
}


// 3️⃣ Highlight duplicate rows (by Bug ID column)
// highlight duplicates using existing rows (no refetch)
// export async function highlightDuplicates(sheetId: string, rows: string[][]) {
//   if (!rows || rows.length <= 1) {
//     console.warn("[BugSense] No rows available for highlighting.");
//     return;
//   }

//   // get token for Google Sheets API
//   const tokenResponse = await new Promise<{ success: boolean; token?: string; error?: any }>((res) => {
//     chrome.runtime.sendMessage({ action: "GET_GOOGLE_TOKEN" }, (response) => res(response));
//   });

//   if (!tokenResponse?.success || !tokenResponse.token) {
//     console.error("[BugSense] Failed to get token for highlightDuplicates");
//     return;
//   }

//   const token = tokenResponse.token;
//   const duplicates: number[] = [];

//   // Compare Bug ID column (first column)
//   for (let i = 1; i < rows.length; i++) {
//     for (let j = i + 1; j < rows.length; j++) {
//       if (rows[i][0] && rows[i][0] === rows[j][0]) {
//         duplicates.push(i, j);
//       }
//     }
//   }

//   if (duplicates.length === 0) {
//     console.log("[BugSense] No duplicates found ✅");
//     return;
//   }

//   console.log(`[BugSense] ${duplicates.length / 2} duplicate pairs detected!`);
//   console.log("Duplicate rows:", duplicates.map((i) => i + 1));

//   // batch update to color duplicate rows
//   const requests = duplicates.map((rowIndex) => ({
//     repeatCell: {
//       range: {
//         sheetId: 0,
//         startRowIndex: rowIndex,
//         endRowIndex: rowIndex + 1,
//       },
//       cell: {
//         userEnteredFormat: {
//           backgroundColor: { red: 1, green: 0.6, blue: 0.6 },
//         },
//       },
//       fields: "userEnteredFormat.backgroundColor",
//     },
//   }));

//   const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
//     method: "POST",
//     headers: {
//       Authorization: `Bearer ${token}`,
//       "Content-Type": "application/json",
//     },
//     body: JSON.stringify({ requests }),
//   });

//   if (res.ok) {
//     console.log(`[BugSense] Highlighted duplicate rows in red 🚨`);
//   } else {
//     console.warn("[BugSense] Highlight request failed:", res.status, res.statusText);
//   }
// }
export async function highlightDuplicates(
  spreadsheetId: string,
  rows: string[][],
  pairs: any[]
) {
  if (!pairs || pairs.length === 0) {
    console.log("[BugSense] No duplicates found for highlighting.");
    return;
  }

  // get token
  const tokenResponse = await new Promise<{ success: boolean; token?: string; error?: any }>((res) => {
    chrome.runtime.sendMessage({ action: "GET_GOOGLE_TOKEN" }, (response) => res(response));
  });
  if (!tokenResponse?.success || !tokenResponse.token) return;
  const token = tokenResponse.token;

  // Fetch actual sheetId
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const meta = await metaRes.json();
  const targetSheet = meta.sheets.find((s: any) => s.properties.title === "bug_report");
  const actualSheetId = targetSheet?.properties?.sheetId ?? 0;

  // Build request
  const uniqueRows = new Set<number>();
  pairs.forEach((p: any) => {
    if (Array.isArray(p)) {
      p.forEach((id: number) => uniqueRows.add(id + 1)); // +1 skip header
    } else if (p.i !== undefined && p.j !== undefined) {
      uniqueRows.add(p.i + 1);
      uniqueRows.add(p.j + 1);
    }
  });

  const requests = [...uniqueRows].map((rowIndex) => ({
    repeatCell: {
      range: {
        sheetId: actualSheetId,
        startRowIndex: rowIndex,
        endRowIndex: rowIndex + 1,
      },
      cell: {
        userEnteredFormat: {
          backgroundColor: { red: 1, green: 0.6, blue: 0.6 },
        },
      },
      fields: "userEnteredFormat.backgroundColor",
    },
  }));

  const resp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requests }),
  });

  if (resp.ok) {
    console.log("[BugSense] Highlighted duplicate rows in red 🚨");
  } else {
    console.warn("[BugSense] Highlight request failed:", await resp.text());
  }
}

// extension/utils/sheetsAPI.ts  (append to existing file)
export async function appendRow(sheetId: string, range: string, rowValues: any[]) {
  // ask background for token
  const tokenResponse = await new Promise<{ success: boolean; token?: string; error?: any }>((res) => {
    chrome.runtime.sendMessage({ action: "GET_GOOGLE_TOKEN" }, (response) => res(response));
  });

  if (!tokenResponse?.success || !tokenResponse.token) {
    throw new Error("Failed to get token for append");
  }
  const token = tokenResponse.token;

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const body = { values: [rowValues] };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ status: resp.status, statusText: resp.statusText }));
    throw new Error(`Sheets append error: ${JSON.stringify(err)}`);
  }

  return await resp.json();
}

export async function getSheetsProperties(sheetId: string) {
  const tokenResponse = await new Promise<{ success: boolean; token?: string; error?: any }>((res) => {
    chrome.runtime.sendMessage({ action: "GET_GOOGLE_TOKEN" }, (response) => res(response));
  });
  if (!tokenResponse?.success || !tokenResponse.token) throw new Error("Failed to get token");
  const token = tokenResponse.token;
  const resp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    const j = await resp.json().catch(() => null);
    throw new Error(`getSheetsProperties error: ${JSON.stringify(j)}`);
  }
  return await resp.json();
}

