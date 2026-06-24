// src/dash/nexusEventStore.ts — tiny localStorage wrapper for an optional DEMO
// Nexus event id. When set, the live field-status feed queries this event id
// instead of the active event — used only for testing the live Nexus data
// feature against a demo event (e.g. a Nexus demo event).
export const NEXUS_DEMO_EVENT_KEY = 'nexus_demo_event_key';

export function getStoredNexusEventKey(): string | null {
  try {
    const v = localStorage.getItem(NEXUS_DEMO_EVENT_KEY);
    const trimmed = v?.trim();
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

export function setStoredNexusEventKey(eventKey: string | null): void {
  try {
    const trimmed = eventKey?.trim();
    if (trimmed) localStorage.setItem(NEXUS_DEMO_EVENT_KEY, trimmed);
    else localStorage.removeItem(NEXUS_DEMO_EVENT_KEY);
  } catch {
    /* storage unavailable — non-fatal */
  }
}
