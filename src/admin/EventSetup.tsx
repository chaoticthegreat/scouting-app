import { useState, type FormEvent } from 'react';
import { importEvent, type ImportEventResult } from './importEventClient';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export interface EventSetupProps {
  onImported?: (eventKey: string) => void;
}

export function EventSetup({ onImported }: EventSetupProps): JSX.Element {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportEventResult | null>(null);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const result = await importEvent(key.trim());
      setSummary(result);
      onImported?.(result.event_key);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Event Setup</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={(e) => void onSubmit(e)}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-key-input-field">TBA event key</Label>
            <Input
              id="event-key-input-field"
              data-testid="event-key-input"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="2026casnv"
              autoComplete="off"
              autoCapitalize="none"
              className="h-11"
            />
          </div>
          <Button
            type="submit"
            data-testid="event-import-submit"
            disabled={busy || key.trim().length === 0}
            className="h-11"
          >
            {busy ? 'Importing…' : 'Import event'}
          </Button>
        </form>

        {error ? (
          <p data-testid="event-import-error" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {summary ? (
          <div data-testid="event-summary" className="mt-4 rounded-lg border p-4 text-sm">
            <p className="font-semibold">{summary.name}</p>
            <p className="text-muted-foreground">{summary.event_key}</p>
            <ul className="mt-2 space-y-1">
              <li>Teams: <span className="font-medium">{summary.team_count}</span></li>
              <li>Qual matches: <span className="font-medium">{summary.match_count}</span></li>
              <li>Join code: <span className="font-mono font-medium">{summary.join_code}</span></li>
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default EventSetup;
