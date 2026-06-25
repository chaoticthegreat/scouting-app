import * as React from 'react';
import {
  Cog,
  Camera,
  CheckCircle2,
  ClipboardList,
  Gauge,
  ListChecks,
  Loader2,
  StickyNote,
  Trash2,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  savePitDraft,
  getPitDraft,
  enqueuePitReport,
  type PitReport,
} from './pitStore';
import { signedPitPhotoUrl } from './photoUpload';

export interface PitScoutScreenProps {
  eventKey: string;
  teamNumber: number;
  scoutId: string;
  // Called after a successful submit so the flow can return to the team picker.
  onDone?: () => void;
}

// Object URLs (local photo previews) must exist for the <img> to render; jsdom
// in tests may not implement createObjectURL, so degrade to an empty string
// rather than throwing.
function previewFor(file: Blob): string {
  try {
    return URL.createObjectURL(file);
  } catch {
    return '';
  }
}

const DRIVETRAINS = ['', 'swerve', 'tank', 'mecanum', 'west_coast', 'other'];
const CAPABILITY_OPTIONS = ['auto', 'climb_l1', 'climb_l2', 'climb_l3', 'defense'];
const INTAKE_OPTIONS = ['neutral', 'depot', 'human_feed'];

// Human-friendly labels for the option keys (values written to the DB are
// unchanged — only the displayed text is prettified).
const OPTION_LABELS: Record<string, string> = {
  swerve: 'Swerve',
  tank: 'Tank',
  mecanum: 'Mecanum',
  west_coast: 'West Coast',
  other: 'Other',
  auto: 'Autonomous',
  climb_l1: 'Climb L1',
  climb_l2: 'Climb L2',
  climb_l3: 'Climb L3',
  defense: 'Defense',
  neutral: 'Neutral',
  depot: 'Depot',
  human_feed: 'Human feed',
};

function labelFor(key: string): string {
  return OPTION_LABELS[key] ?? key;
}

function emptyReport(p: PitScoutScreenProps): PitReport {
  return {
    eventKey: p.eventKey,
    teamNumber: p.teamNumber,
    drivetrain: '',
    mechanisms: [],
    capabilities: [],
    intakeSources: [],
    photoPath: null,
    notes: '',
    scoutId: p.scoutId,
  };
}

export default function PitScoutScreen(props: PitScoutScreenProps): JSX.Element {
  const [report, setReport] = React.useState<PitReport>(() => emptyReport(props));
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle'
  );

  // The chosen photo is held locally as bytes and uploaded at sync time, so pit
  // scouting works with zero network. A ref keeps the latest blob available to
  // the draft-saving `update` closure without re-creating it on every keystroke.
  const photoRef = React.useRef<Blob | null>(null);
  const objectUrlRef = React.useRef<string | null>(null);

  function setLocalPreview(file: Blob | null): void {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    photoRef.current = file;
    if (file) {
      const url = previewFor(file);
      objectUrlRef.current = url || null;
      setPreviewUrl(url || null);
    } else {
      setPreviewUrl(null);
    }
  }

  React.useEffect(() => {
    let active = true;
    void getPitDraft(props.eventKey, props.teamNumber).then((draft) => {
      if (active && draft) {
        setReport(draft.data);
        if (draft.photoBlob) {
          // A photo captured offline, still pending upload.
          setLocalPreview(draft.photoBlob);
        } else if (draft.data.photoPath) {
          // A previously-uploaded photo: preview via a signed URL.
          void signedPitPhotoUrl(draft.data.photoPath).then((url) => {
            if (active) setPreviewUrl(url);
          });
        }
      }
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.eventKey, props.teamNumber]);

  // Revoke any live object URL on unmount.
  React.useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  function update(patch: Partial<PitReport>): void {
    setReport((prev) => {
      const next = { ...prev, ...patch };
      void savePitDraft(props.eventKey, props.teamNumber, next, photoRef.current);
      return next;
    });
    setStatus('idle');
  }

  function toggle(list: string[], value: string): string[] {
    return list.includes(value)
      ? list.filter((v) => v !== value)
      : [...list, value];
  }

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    setLocalPreview(file);
    // Drop any stale uploaded path; the new blob is the source of truth until
    // it's uploaded at sync time. update() persists the blob into the draft.
    update({ photoPath: null });
  }

  function removePhoto(): void {
    setLocalPreview(null);
    update({ photoPath: null });
  }

  async function onSubmit(): Promise<void> {
    setStatus('saving');
    try {
      // Queue locally (with the pending photo) and let the sync engine upload
      // when there's network — works fully offline.
      await enqueuePitReport(report, photoRef.current);
      setStatus('saved');
      // Nudge the sync indicator to pick up the new pending upload immediately.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('scout-sync-changed'));
      }
      // Back to the team picker to scout the next robot.
      props.onDone?.();
    } catch {
      setStatus('error');
    }
  }

  // Semantic tone per option group: capabilities split between climb (success
  // green = scored end-game), defense (brand cyan = defense convention) and
  // autonomous (energy orange); intake sourcing (fuel) is energy orange.
  type ChipTone = 'success' | 'brand' | 'energy';
  const CHIP_TONE: Record<string, ChipTone> = {
    auto: 'energy',
    climb_l1: 'success',
    climb_l2: 'success',
    climb_l3: 'success',
    defense: 'brand',
    neutral: 'energy',
    depot: 'energy',
    human_feed: 'energy',
  };

  const TONE_CHIP: Record<ChipTone, string> = {
    success: 'border-success/40 bg-success/15 text-success',
    brand: 'border-brand/40 bg-brand/15 text-brand',
    energy: 'border-energy/40 bg-energy/15 text-energy',
  };
  const TONE_ACCENT: Record<ChipTone, string> = {
    success: 'accent-[hsl(var(--success))]',
    brand: 'accent-[hsl(var(--brand))]',
    energy: 'accent-[hsl(var(--energy))]',
  };

  const optionChip = (active: boolean, tone: ChipTone) =>
    cn(
      'flex min-h-[56px] items-center gap-3 rounded-2xl border px-4 text-base font-medium transition-colors',
      active
        ? TONE_CHIP[tone]
        : 'border-border bg-card text-muted-foreground hover:bg-muted',
    );

  return (
    <div
      data-testid="pit-screen"
      className="mx-auto flex max-w-md flex-col gap-5 px-safe py-safe"
    >
      <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold sm:text-2xl">
        <Wrench className="size-6 shrink-0 text-brand" />
        <span className="min-w-0 break-words">
          Pit Scout — Team{' '}
          <span className="text-brand">{props.teamNumber}</span>
        </span>
      </h1>

      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
        <Label htmlFor="pit-drivetrain" className="flex items-center gap-1.5 text-base">
          <Gauge className="size-5 text-brand" />
          Drivetrain
        </Label>
        <select
          id="pit-drivetrain"
          data-testid="pit-drivetrain"
          value={report.drivetrain}
          onChange={(e) => update({ drivetrain: e.target.value })}
          className="h-14 w-full rounded-xl border border-input bg-transparent px-3 text-base text-foreground"
        >
          {DRIVETRAINS.map((d) => (
            <option key={d} value={d}>
              {d === '' ? 'Select…' : labelFor(d)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
        <Label htmlFor="pit-mechanisms" className="flex items-center gap-1.5 text-base">
          <Cog className="size-5 text-brand" />
          Mechanisms (comma separated)
        </Label>
        <Input
          id="pit-mechanisms"
          className="h-14 text-base"
          placeholder="e.g. elevator, shooter, intake"
          value={report.mechanisms.join(', ')}
          onChange={(e) =>
            update({
              mechanisms: e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
      </div>

      <fieldset className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
        <legend className="flex items-center gap-1.5 px-1 text-base font-semibold">
          <ListChecks className="size-5 text-success" />
          Capabilities
        </legend>
        <div className="flex flex-col gap-2">
          {CAPABILITY_OPTIONS.map((c) => {
            const active = report.capabilities.includes(c);
            const tone = CHIP_TONE[c] ?? 'brand';
            return (
              <label key={c} className={optionChip(active, tone)}>
                <input
                  type="checkbox"
                  className={cn('size-6', TONE_ACCENT[tone])}
                  checked={active}
                  onChange={() =>
                    update({ capabilities: toggle(report.capabilities, c) })
                  }
                />
                {labelFor(c)}
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
        <legend className="flex items-center gap-1.5 px-1 text-base font-semibold">
          <ClipboardList className="size-5 text-energy" />
          Intake sources
        </legend>
        <div className="flex flex-col gap-2">
          {INTAKE_OPTIONS.map((s) => {
            const active = report.intakeSources.includes(s);
            const tone = CHIP_TONE[s] ?? 'energy';
            return (
              <label key={s} className={optionChip(active, tone)}>
                <input
                  type="checkbox"
                  className={cn('size-6', TONE_ACCENT[tone])}
                  checked={active}
                  onChange={() =>
                    update({ intakeSources: toggle(report.intakeSources, s) })
                  }
                />
                {labelFor(s)}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
        <Label htmlFor="pit-notes" className="flex items-center gap-1.5 text-base">
          <StickyNote className="size-5 text-muted-foreground" />
          Notes
        </Label>
        <textarea
          id="pit-notes"
          className="min-h-28 w-full rounded-xl border border-input bg-transparent p-3 text-base"
          placeholder="Anything notable about this robot…"
          value={report.notes}
          onChange={(e) => update({ notes: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
        <Label htmlFor="pit-photo" className="flex items-center gap-1.5 text-base">
          <Camera className="size-5 text-muted-foreground" />
          Robot photo
        </Label>
        {/* The native file input is notoriously unstyleable / clips on mobile, so
            it's visually hidden and driven by a full-width label button. */}
        <label
          htmlFor="pit-photo"
          className="flex min-h-[56px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-input bg-muted px-4 text-base font-medium text-foreground transition-colors active:bg-muted/70"
        >
          <Camera className="size-5 shrink-0" />
          {previewUrl ? 'Replace photo' : 'Add photo'}
        </label>
        <input
          id="pit-photo"
          data-testid="pit-photo"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onPhoto}
          className="sr-only"
        />
        {previewUrl && (
          <div className="flex flex-col gap-2">
            <img
              src={previewUrl}
              alt="pit photo preview"
              className="max-h-64 w-full rounded-xl object-contain"
            />
            <Button
              type="button"
              data-testid="pit-photo-remove"
              variant="outline"
              size="sm"
              className="gap-2 self-start"
              onClick={removePhoto}
            >
              <Trash2 className="size-4" /> Remove photo
            </Button>
          </div>
        )}
      </div>

      <Button
        data-testid="pit-submit"
        variant="brand"
        size="xl"
        className="w-full gap-2"
        disabled={status === 'saving'}
        onClick={() => void onSubmit()}
      >
        {status === 'saving' ? (
          <>
            <Loader2 className="size-5 animate-spin" /> Submitting…
          </>
        ) : (
          <>
            <CheckCircle2 className="size-5" /> Submit
          </>
        )}
      </Button>

      {status === 'saved' && (
        <p
          data-testid="pit-saved"
          className="flex items-center gap-2 text-base font-medium text-success"
        >
          <CheckCircle2 className="size-5" /> Saved — queued for upload.
        </p>
      )}
      {status === 'error' && (
        <p data-testid="pit-error" className="text-base font-medium text-destructive">
          Couldn’t save — please try again.
        </p>
      )}
    </div>
  );
}
