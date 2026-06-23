// src/auth/useSession.ts
import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Role } from './roles';
import type { ScoutRow } from './joinEvent';

export interface UseSessionResult {
  session: Session | null;
  scout: ScoutRow | null;
  role: Role | null;
  loading: boolean;
}

async function loadIdentity(authUid: string): Promise<{ scout: ScoutRow | null; role: Role | null }> {
  const [{ data: scout }, { data: profile }] = await Promise.all([
    supabase.from('scout').select('*').eq('auth_uid', authUid).maybeSingle(),
    supabase.from('profile').select('*').eq('auth_uid', authUid).maybeSingle(),
  ]);
  return {
    scout: (scout as ScoutRow | null) ?? null,
    role: ((profile as { role?: Role } | null)?.role as Role | undefined) ?? null,
  };
}

export function useSession(): UseSessionResult {
  const [session, setSession] = useState<Session | null>(null);
  const [scout, setScout] = useState<ScoutRow | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    async function apply(next: Session | null): Promise<void> {
      if (!mounted.current) return;
      setSession(next);
      if (!next?.user) {
        setScout(null);
        setRole(null);
        setLoading(false);
        return;
      }
      const { scout: s, role: r } = await loadIdentity(next.user.id);
      if (!mounted.current) return;
      setScout(s);
      setRole(r);
      setLoading(false);
    }

    supabase.auth.getSession().then(({ data }) => {
      void apply(data.session ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      setLoading(true);
      void apply(next ?? null);
    });

    return () => {
      mounted.current = false;
      subscription.unsubscribe();
    };
  }, []);

  return { session, scout, role, loading };
}
