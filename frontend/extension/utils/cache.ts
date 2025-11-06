// Local caching utility (browser localStorage or chrome.storage.local)
const CACHE_KEY = "bugsense_duplicate_ignore_list";

export async function getIgnoredPairs(): Promise<string[]> {
  const data = localStorage.getItem(CACHE_KEY);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function addIgnoredPair(idA: number, idB: number) {
  const key = [idA, idB].sort().join("-");
  const list = await getIgnoredPairs();
  if (!list.includes(key)) {
    list.push(key);
    localStorage.setItem(CACHE_KEY, JSON.stringify(list));
  }
}

export async function isIgnoredPair(idA: number, idB: number) {
  const key = [idA, idB].sort().join("-");
  const list = await getIgnoredPairs();
  return list.includes(key);
}

