import { describe, it, expect } from 'vitest';
import {
  FountainEncoder,
  FountainDecoder,
  frameToString,
  parseFrame,
  reportsToBytes,
  bytesToReports,
} from '@/qr/envelope';
import { compressForQr, decompressForQr, compressionSupported } from '@/qr/compress';
import { sampleUpsertPayloads } from './fixtures';

// Full QR hand-off, camera-free. Simulates the EXACT sender→QR→receiver pipeline
// used by QrSendScreen / QrReceiveScreen so we can prove the client neither loses
// nor corrupts reports between encode and ingest. If "Received and uploaded 0
// reports" is a client-side data loss, this test fails at the assert that the
// decoded batch equals the original batch. If the round-trip is clean, the bug
// is downstream (postIngest / the edge function), not in this pipeline.
describe('QR round-trip integration (encode → frames → decode)', () => {
  it('preserves the full snake_case report batch end to end', async () => {
    // 1. Realistic backlog shaped exactly like toUpsertPayload output.
    const reports = sampleUpsertPayloads();
    expect(reports.length).toBeGreaterThanOrEqual(2);

    // 2. Sender path: bytes → (maybe) gzip → fountain encoder.
    const sourceBytes = reportsToBytes(reports);
    const { bytes: payload, compressed } = await compressForQr(sourceBytes);
    const enc = new FountainEncoder(payload, 'testsid', compressed);
    const k = enc.k;
    expect(k).toBeGreaterThanOrEqual(1);

    // 3. Emit frames seq=0..N through the wire shape (frameToString → parseFrame
    //    → decoder.add), exactly as the camera path would, until decode completes.
    const decoder = new FountainDecoder();
    const maxFrames = Math.max(8, k * 4);
    let emitted = 0;
    for (let seq = 0; seq < maxFrames && !decoder.complete; seq += 1) {
      const wire = frameToString(enc.frame(seq));
      const frame = parseFrame(wire);
      // parseFrame must accept our own well-formed frames (CRC etc.).
      expect(frame).not.toBeNull();
      decoder.add(frame!);
      emitted += 1;
    }

    // 4. Decoder reached completion with all K source blocks solved.
    expect(decoder.complete).toBe(true);
    expect(decoder.solvedCount).toBe(k);
    expect(decoder.total).toBe(k);
    expect(decoder.sessionId).toBe('testsid');
    expect(decoder.compressed).toBe(compressed);

    // 5. Receiver path: reassemble (CRC-verified) → inflate → JSON → reports[].
    const raw = await decompressForQr(decoder.payloadBytes(), decoder.compressed ?? false);
    const out = bytesToReports(raw);

    // 6. The batch survives with the same length AND byte-for-byte content.
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBe(reports.length);
    expect(out).toEqual(reports);

    // Diagnostic surface (visible on `--reporter verbose` / failure output).
    expect({
      reportCount: reports.length,
      sourceBytes: sourceBytes.length,
      payloadBytes: payload.length,
      blocks: k,
      framesEmitted: emitted,
      compressionExercised: compressed,
      compressionSupportedHere: compressionSupported(),
    }).toMatchObject({ reportCount: out.length });
  });
});
