// src/dash/__tests__/MatchVideo.test.tsx
// MatchVideo lazily fetches the TBA match object for a matchKey and embeds the
// first youtube video as a responsive 16:9 iframe. Tests mock tbaGet and cover
// the video, loading, no-video, and error states. Each test uses a fresh
// QueryClient so queries don't share cache.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const tbaGetMock = vi.fn();
vi.mock('@/dash/proxies', () => ({
  tbaGet: (path: string) => tbaGetMock(path),
}));

import MatchVideo from '@/dash/MatchVideo';

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  cleanup();
  tbaGetMock.mockReset();
});

describe('MatchVideo', () => {
  it('embeds the first youtube video as a 16:9 iframe', async () => {
    tbaGetMock.mockResolvedValue({
      videos: [
        { type: 'tba', key: 'whatever' },
        { type: 'youtube', key: 'dQw4w9WgXcQ' },
      ],
    });
    const { getByTestId } = renderWithClient(<MatchVideo matchKey="2026casnv_qm1" />);
    await waitFor(() => expect(getByTestId('match-video-frame')).toBeTruthy());
    const frame = getByTestId('match-video-frame') as HTMLIFrameElement;
    expect(frame.tagName).toBe('IFRAME');
    expect(frame.src).toContain('https://www.youtube.com/embed/dQw4w9WgXcQ');
    expect(tbaGetMock).toHaveBeenCalledWith('/match/2026casnv_qm1');
  });

  it('enables the JS API on the embed when an onTimeMs callback is supplied', async () => {
    tbaGetMock.mockResolvedValue({ videos: [{ type: 'youtube', key: 'dQw4w9WgXcQ' }] });
    const onTimeMs = vi.fn();
    const { getByTestId } = renderWithClient(
      <MatchVideo matchKey="2026casnv_qm1" onTimeMs={onTimeMs} />,
    );
    await waitFor(() => expect(getByTestId('match-video-frame')).toBeTruthy());
    const frame = getByTestId('match-video-frame') as HTMLIFrameElement;
    // enablejsapi=1 is required for the IFrame Player API to read currentTime.
    expect(frame.src).toContain('enablejsapi=1');
    expect(frame.src).toContain('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('still renders the embed gracefully when the YT API never loads', async () => {
    // jsdom has no window.YT — the player never attaches, but the iframe and the
    // surrounding UI must render fine (no playhead, no throw).
    tbaGetMock.mockResolvedValue({ videos: [{ type: 'youtube', key: 'dQw4w9WgXcQ' }] });
    const onTimeMs = vi.fn();
    const { getByTestId } = renderWithClient(
      <MatchVideo matchKey="2026casnv_qm1" onTimeMs={onTimeMs} />,
    );
    await waitFor(() => expect(getByTestId('match-video-frame')).toBeTruthy());
    expect(onTimeMs).not.toHaveBeenCalled();
  });

  it('shows a loading state before data resolves', () => {
    tbaGetMock.mockReturnValue(new Promise(() => {}));
    const { getByTestId } = renderWithClient(<MatchVideo matchKey="2026casnv_qm1" />);
    expect(getByTestId('match-video-loading')).toBeTruthy();
  });

  it('shows "No video available" when there are no youtube videos', async () => {
    tbaGetMock.mockResolvedValue({ videos: [{ type: 'tba', key: 'x' }] });
    const { getByTestId } = renderWithClient(<MatchVideo matchKey="2026casnv_qm1" />);
    await waitFor(() => expect(getByTestId('match-video-none')).toBeTruthy());
  });

  it('shows "No video available" when videos is missing', async () => {
    tbaGetMock.mockResolvedValue({});
    const { getByTestId } = renderWithClient(<MatchVideo matchKey="2026casnv_qm1" />);
    await waitFor(() => expect(getByTestId('match-video-none')).toBeTruthy());
  });

  it('shows an error state when the fetch fails', async () => {
    tbaGetMock.mockRejectedValue(new Error('boom'));
    const { getByTestId } = renderWithClient(<MatchVideo matchKey="2026casnv_qm1" />);
    await waitFor(() => expect(getByTestId('match-video-error')).toBeTruthy());
  });
});
