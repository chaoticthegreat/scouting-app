// src/dash/scoutAdminClient.ts
// Lead-facing destructive operations on event scouters. Calls the
// `delete_scout` SECURITY DEFINER RPC (migration 0011), which removes the
// scouter AND all of their match reports / assignments in one transaction.
import { supabase } from '@/lib/supabase';

/** Permanently delete a scouter and every report/assignment they own. */
export async function deleteScout(scoutId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_scout', { p_scout_id: scoutId });
  if (error) {
    throw new Error(error.message);
  }
}
