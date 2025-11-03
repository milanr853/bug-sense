export async function getSheetData(spreadsheetId: string, range: string) {
  return new Promise(async (resolve, reject) => {
    try {
      // 1️⃣ Ask background for the OAuth token
      const tokenResponse = await new Promise<{ success: boolean; token?: string; error?: any }>((res) => {
        chrome.runtime.sendMessage({ action: "GET_GOOGLE_TOKEN" }, (response) => {
          res(response);
        });
      });

      if (!tokenResponse?.success || !tokenResponse.token) {
        return reject(tokenResponse?.error || new Error("Failed to get token"));
      }

      const token = tokenResponse.token;

      // 2️⃣ Fetch data from Google Sheets API
      const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?majorDimension=ROWS`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        reject(`Error: ${response.status} ${response.statusText}`);
        return;
      }

      const data = await response.json();
      resolve(data);
    } catch (err) {
      reject(err);
    }
  });
}

