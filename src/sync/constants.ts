export const SYNC_BACKOFF_MS = [0, 2_000, 8_000, 30_000, 120_000] as const; // by syncAttempts
export const SYNC_MAX_ATTEMPTS = 5; // attempts beyond last backoff step → dead-letter
export const SYNC_POLL_MS = 15_000; // periodic auto-sync tick while online
export const QR_CHUNK_CHARS = 700; // base64 chars per frame (well under QR capacity)
export const QR_FRAME_MS = 600; // sender frame cadence
export const QR_ENVELOPE_VERSION = 1 as const;
