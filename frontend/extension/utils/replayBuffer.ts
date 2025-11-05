// replayBuffer.ts
type ActionEvent = {
  type: "click" | "keypress";
  timestamp: number;
  details: any;
};

const MAX_BUFFER_TIME = 30 * 1000; // 30 seconds
let events: ActionEvent[] = [];

export function logAction(event: ActionEvent) {
  const now = Date.now();
  events.push(event);
  events = events.filter((e) => now - e.timestamp < MAX_BUFFER_TIME);
}

export function getRecentActions(): ActionEvent[] {
  const now = Date.now();
  return events.filter((e) => now - e.timestamp < MAX_BUFFER_TIME);
}

export function clearActions() {
  events = [];
}

