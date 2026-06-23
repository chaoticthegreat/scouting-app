export interface AppEnv {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
}

export function readEnv(source: ImportMetaEnv): AppEnv {
  const url = source.VITE_SUPABASE_URL;
  const key = source.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || typeof url !== 'string') {
    throw new Error('Missing required env var: VITE_SUPABASE_URL');
  }
  if (!key || typeof key !== 'string') {
    throw new Error('Missing required env var: VITE_SUPABASE_PUBLISHABLE_KEY');
  }

  return { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key };
}

export const env: AppEnv = readEnv(import.meta.env);
