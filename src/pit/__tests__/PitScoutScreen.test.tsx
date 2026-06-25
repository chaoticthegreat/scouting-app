import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

const savePitDraft = vi.fn().mockResolvedValue(undefined);
const getPitDraft = vi.fn().mockResolvedValue(undefined);
const enqueuePitReport = vi.fn().mockResolvedValue(undefined);
const signedPitPhotoUrl = vi.fn().mockResolvedValue('https://signed/a.jpg');

vi.mock('../pitStore', () => ({
  savePitDraft: (...a: unknown[]) => savePitDraft(...a),
  getPitDraft: (...a: unknown[]) => getPitDraft(...a),
  enqueuePitReport: (...a: unknown[]) => enqueuePitReport(...a),
}));
vi.mock('../photoUpload', () => ({
  signedPitPhotoUrl: (...a: unknown[]) => signedPitPhotoUrl(...a),
}));

// jsdom has no Object URL plumbing; stub it so the local photo preview renders.
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:preview';
}
if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = () => undefined;
}

import PitScoutScreen from '../PitScoutScreen';

const props = { eventKey: '2026casj', teamNumber: 254, scoutId: 'scout-1' };

describe('PitScoutScreen', () => {
  beforeEach(() => {
    savePitDraft.mockClear();
    getPitDraft.mockClear().mockResolvedValue(undefined);
    enqueuePitReport.mockClear().mockResolvedValue(undefined);
    signedPitPhotoUrl.mockClear().mockResolvedValue('https://signed/a.jpg');
  });

  it('renders the pit form', () => {
    render(<PitScoutScreen {...props} />);
    expect(screen.getByTestId('pit-screen')).toBeInTheDocument();
    expect(screen.getByTestId('pit-drivetrain')).toBeInTheDocument();
    expect(screen.getByTestId('pit-submit')).toBeInTheDocument();
  });

  it('resumes a draft on mount', async () => {
    getPitDraft.mockResolvedValue({
      draftKey: '2026casj:254',
      eventKey: '2026casj',
      teamNumber: 254,
      updatedAt: 'now',
      data: {
        eventKey: '2026casj',
        teamNumber: 254,
        drivetrain: 'tank',
        mechanisms: [],
        capabilities: [],
        intakeSources: [],
        photoPath: null,
        notes: 'resumed',
        scoutId: 'scout-1',
      },
    });
    render(<PitScoutScreen {...props} />);
    await waitFor(() =>
      expect((screen.getByTestId('pit-drivetrain') as HTMLSelectElement).value).toBe('tank')
    );
    expect(screen.getByLabelText(/notes/i)).toHaveValue('resumed');
  });

  it('queues the report, shows a saved indicator, and calls onDone', async () => {
    const onDone = vi.fn();
    render(<PitScoutScreen {...props} onDone={onDone} />);
    fireEvent.change(screen.getByTestId('pit-drivetrain'), {
      target: { value: 'swerve' },
    });
    fireEvent.click(screen.getByTestId('pit-submit'));
    await waitFor(() => expect(enqueuePitReport).toHaveBeenCalledTimes(1));
    expect(enqueuePitReport.mock.calls[0][0]).toMatchObject({
      eventKey: '2026casj',
      teamNumber: 254,
      drivetrain: 'swerve',
      scoutId: 'scout-1',
    });
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it('shows a saved indicator when no onDone is provided', async () => {
    render(<PitScoutScreen {...props} />);
    fireEvent.click(screen.getByTestId('pit-submit'));
    expect(await screen.findByTestId('pit-saved')).toBeInTheDocument();
  });

  it('shows an error indicator when queueing fails', async () => {
    enqueuePitReport.mockRejectedValue(new Error('db'));
    render(<PitScoutScreen {...props} />);
    fireEvent.click(screen.getByTestId('pit-submit'));
    expect(await screen.findByTestId('pit-error')).toBeInTheDocument();
  });

  it('attaches a photo locally and shows a preview without uploading', async () => {
    render(<PitScoutScreen {...props} />);
    const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('pit-photo'), {
      target: { files: [file] },
    });
    // Preview comes from a local object URL — no network upload at capture time.
    expect(await screen.findByAltText(/pit photo/i)).toBeInTheDocument();
    expect(signedPitPhotoUrl).not.toHaveBeenCalled();
    // The blob is persisted into the draft for offline survival.
    await waitFor(() => expect(savePitDraft).toHaveBeenCalled());
    const lastCall = savePitDraft.mock.calls[savePitDraft.mock.calls.length - 1];
    expect(lastCall[3]).toBeInstanceOf(Blob);
  });
});
