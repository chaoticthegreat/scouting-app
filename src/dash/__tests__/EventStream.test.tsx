// src/dash/__tests__/EventStream.test.tsx
// EventStream is a pure, presentational embed for an event webcast: props in,
// JSX out, no QueryClient needed. These tests cover the youtube/twitch iframe
// srcs, the no-stream and unknown-type placeholders, and exercise the exported
// `webcastEmbedSrc` helper directly.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import EventStream, { webcastEmbedSrc } from '@/dash/EventStream';

beforeEach(() => {
  cleanup();
});

describe('EventStream', () => {
  it('embeds a youtube webcast using `channel` as the video id', () => {
    const { getByTestId } = render(
      <EventStream webcast={{ type: 'youtube', channel: 'dQw4w9WgXcQ' }} />,
    );
    const frame = getByTestId('dash-stream-frame') as HTMLIFrameElement;
    expect(frame.tagName).toBe('IFRAME');
    expect(frame.src).toContain('/embed/dQw4w9WgXcQ');
  });

  it('prefers `file` as the youtube video id when present', () => {
    const { getByTestId } = render(
      <EventStream webcast={{ type: 'youtube', channel: 'someChannelId', file: 'theVideoId' }} />,
    );
    const frame = getByTestId('dash-stream-frame') as HTMLIFrameElement;
    expect(frame.src).toContain('/embed/theVideoId');
    expect(frame.src).not.toContain('someChannelId');
  });

  it('embeds a twitch webcast with channel and parent params', () => {
    const { getByTestId } = render(
      <EventStream
        webcast={{ type: 'twitch', channel: 'firstinspires' }}
        parentHost="scout.example.com"
      />,
    );
    const frame = getByTestId('dash-stream-frame') as HTMLIFrameElement;
    expect(frame.src).toContain('player.twitch.tv');
    expect(frame.src).toContain('channel=firstinspires');
    expect(frame.src).toContain('parent=scout.example.com');
  });

  it('renders the placeholder and no iframe when webcast is null', () => {
    const { getByTestId, queryByTestId } = render(<EventStream webcast={null} />);
    expect(getByTestId('dash-stream-none')).toBeTruthy();
    expect(queryByTestId('dash-stream-frame')).toBeNull();
  });

  it('renders the placeholder for an unknown webcast type', () => {
    const { getByTestId, queryByTestId } = render(
      <EventStream webcast={{ type: 'livestream', channel: 'abc' }} />,
    );
    expect(getByTestId('dash-stream-none')).toBeTruthy();
    expect(queryByTestId('dash-stream-frame')).toBeNull();
  });

  it('always renders the outer container', () => {
    const { getByTestId } = render(<EventStream webcast={null} />);
    expect(getByTestId('dash-stream')).toBeTruthy();
  });
});

describe('webcastEmbedSrc', () => {
  const host = 'scout.example.com';

  it('builds a youtube src from `channel`', () => {
    expect(webcastEmbedSrc({ type: 'youtube', channel: 'vid123' }, host)).toBe(
      'https://www.youtube.com/embed/vid123',
    );
  });

  it('builds a youtube src from `file` when present', () => {
    expect(
      webcastEmbedSrc({ type: 'youtube', channel: 'chan', file: 'vid123' }, host),
    ).toBe('https://www.youtube.com/embed/vid123');
  });

  it('returns null for a youtube webcast with no ids', () => {
    expect(webcastEmbedSrc({ type: 'youtube' }, host)).toBeNull();
    expect(webcastEmbedSrc({ type: 'youtube', channel: '', file: '' }, host)).toBeNull();
  });

  it('builds a twitch src with an encoded channel and parent', () => {
    expect(webcastEmbedSrc({ type: 'twitch', channel: 'firstinspires' }, host)).toBe(
      'https://player.twitch.tv/?channel=firstinspires&parent=scout.example.com',
    );
  });

  it('returns null for a twitch webcast with no channel', () => {
    expect(webcastEmbedSrc({ type: 'twitch' }, host)).toBeNull();
  });

  it('returns null for unknown types and null webcasts', () => {
    expect(webcastEmbedSrc({ type: 'livestream', channel: 'abc' }, host)).toBeNull();
    expect(webcastEmbedSrc(null, host)).toBeNull();
    expect(webcastEmbedSrc(undefined, host)).toBeNull();
  });
});
