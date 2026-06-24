export const SYNC_MAX_ATTEMPTS = 5; // attempts beyond which a transient failure → dead-letter
export const SYNC_POLL_MS = 15_000; // periodic auto-sync tick while online
// base64 chars per frame. Kept low so each frame is a SPARSE QR code a phone
// camera can lock focus on and decode before the frame cycles. 700 chars (level
// 'M') rendered a ~v23 / 109×109 code at ~3px per module — too dense to scan
// reliably off a screen, so receivers captured nothing. ~280 chars lands around
// v13 / ~69 modules (~4.5px/module at the rendered size).
export const QR_CHUNK_CHARS = 280;
export const QR_FRAME_MS = 900; // sender frame cadence — slow enough for the camera to catch each frame
export const QR_ENVELOPE_VERSION = 1 as const;
