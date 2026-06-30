// src/dash/MatchupNotesModal.tsx
// Controlled editor sheet for a per-opponent matchup note (matchup-intelligence).
// Pre-fills with the existing note; Save writes to Dexie 'dirty' (offline-first)
// via saveMatchupNote and invalidates the notes query so the panel re-reads.
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/button';
import { saveMatchupNote } from '@/dash/matchupNotesClient';

export interface MatchupNotesModalProps {
  open: boolean;
  onClose: () => void;
  eventKey: string;
  /** The "our" alliance teams for the keyed pairing (min = our lead). */
  ourTeams: number[];
  /** The opponent alliance teams (min = the opponent lead the note keys on). */
  oppTeams: number[];
  /** The opponent alliance lead shown in the header (the min of oppTeams). */
  oppLead: number;
  /** Existing note text to pre-fill. */
  initialNote: string;
}

export default function MatchupNotesModal({
  open,
  onClose,
  eventKey,
  ourTeams,
  oppTeams,
  oppLead,
  initialNote,
}: MatchupNotesModalProps): JSX.Element {
  const queryClient = useQueryClient();
  const [text, setText] = useState(initialNote);
  const [saving, setSaving] = useState(false);
  // Freeze the pairing (and seed note) the editor opened against. The parent
  // recomputes ourTeams/oppTeams/oppLead from live match data, so without this a
  // background refresh mid-edit could redirect Save to a different pairing — or
  // silently reset the in-progress note. Pinned to the open transition only.
  const [frozen, setFrozen] = useState({ ourTeams, oppTeams, oppLead, note: initialNote });

  // Re-sync the textarea + pinned pairing when the sheet opens. Intentionally
  // keyed on `open` alone: once editing, everything stays pinned to what the user
  // opened, immune to background team/note updates.
  useEffect(() => {
    if (open) {
      setText(initialNote);
      setFrozen({ ourTeams, oppTeams, oppLead, note: initialNote });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await saveMatchupNote(eventKey, frozen.ourTeams, frozen.oppTeams, text);
      await queryClient.invalidateQueries({ queryKey: ['matchup-notes', eventKey] });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const headerLead = frozen.oppLead;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Notes vs alliance lead ${headerLead}`}
      data-testid="matchup-notes-sheet"
    >
      <div className="flex h-full flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          Event-scoped note keyed on the alliance lead team — it resurfaces for any
          future match against alliance lead {headerLead} at this event.
        </p>
        <textarea
          data-testid="matchup-notes-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. deny their feed lane; 254 climbs every match"
          className="min-h-[200px] flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="brand"
            size="sm"
            data-testid="matchup-notes-save"
            disabled={saving}
            onClick={() => void onSave()}
          >
            Save
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
