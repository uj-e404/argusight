// Singleton broadcast function holder
// Used to share the WebSocket broadcast function from server.ts to other modules

let broadcastFn: ((channel: string, data: unknown) => void) | null = null;

export function setBroadcast(fn: (channel: string, data: unknown) => void) {
  broadcastFn = fn;
}

export function broadcast(channel: string, data: unknown) {
  broadcastFn?.(channel, data);
}
