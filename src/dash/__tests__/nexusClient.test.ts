// src/dash/__tests__/nexusClient.test.ts
import { describe, it, expect } from 'vitest';
import { parseNexusEventStatus } from '@/dash/nexusClient';

const payload = {
  eventKey: '2024onwa',
  dataAsOfTime: 1_700_000_000_000,
  nowQueuing: 'Qualification 12',
  matches: [
    {
      label: 'Qualification 10',
      status: 'Completed',
      redTeams: ['254', '1114', '111'],
      blueTeams: ['148', '2056', '67'],
      times: { estimatedStartTime: 1_700_000_000_000 },
    },
    {
      label: 'Qualification 11',
      status: 'On field',
      redTeams: ['100', '200', '300'],
      blueTeams: ['400', '500', '600'],
      times: { estimatedStartTime: 1_700_000_600_000 },
    },
    {
      label: 'Qualification 12',
      status: 'Now queuing',
      redTeams: ['1', '2', '3'],
      blueTeams: ['4', '5', '6'],
      times: { estimatedStartTime: 1_700_001_200_000 },
    },
    {
      label: 'Qualification 13',
      status: 'On deck',
      redTeams: ['7', '8', '9'],
      blueTeams: ['10', '11', '12'],
      times: { estimatedStartTime: 1_700_001_800_000 },
    },
  ],
};

describe('parseNexusEventStatus', () => {
  it('extracts top-level fields and parses team numbers', () => {
    const s = parseNexusEventStatus(payload);
    expect(s.eventKey).toBe('2024onwa');
    expect(s.dataAsOfTime).toBe(1_700_000_000_000);
    expect(s.nowQueuing).toBe('Qualification 12');
    expect(s.matches).toHaveLength(4);
    expect(s.matches[0].redTeams).toEqual([254, 1114, 111]);
  });

  it('identifies on-field and queuing matches', () => {
    const s = parseNexusEventStatus(payload);
    expect(s.onField?.label).toBe('Qualification 11');
    // queuing prefers the label matching nowQueuing.
    expect(s.queuing?.label).toBe('Qualification 12');
  });

  it('orders upcoming by estimated start and excludes completed', () => {
    const s = parseNexusEventStatus(payload);
    const labels = s.upcoming.map((m) => m.label);
    expect(labels).not.toContain('Qualification 10'); // completed excluded
    expect(labels).toEqual([
      'Qualification 11',
      'Qualification 12',
      'Qualification 13',
    ]);
  });

  it('is defensive: handles missing/garbage payloads without throwing', () => {
    expect(() => parseNexusEventStatus(null)).not.toThrow();
    expect(() => parseNexusEventStatus(undefined)).not.toThrow();
    expect(() => parseNexusEventStatus(42)).not.toThrow();
    const empty = parseNexusEventStatus({});
    expect(empty.matches).toEqual([]);
    expect(empty.onField).toBeNull();
    expect(empty.queuing).toBeNull();
    expect(empty.nowQueuing).toBeNull();
    expect(empty.upcoming).toEqual([]);
  });

  it('drops malformed matches and junk team entries', () => {
    const s = parseNexusEventStatus({
      matches: [
        { status: 'On field' }, // no label -> dropped
        {
          label: 'Qualification 1',
          status: 'On deck',
          redTeams: ['frc254', null, 'abc', '99'],
          blueTeams: 'not-an-array',
          times: null,
        },
      ],
    });
    expect(s.matches).toHaveLength(1);
    expect(s.matches[0].redTeams).toEqual([254, 99]);
    expect(s.matches[0].blueTeams).toEqual([]);
    expect(s.matches[0].times.estimatedStartTime).toBeNull();
  });
});
