export interface Env {
  MANGOFY_API_KEY?: string;
  MANGOFY_STORE_CODE?: string;
  MANGOFY_BASE_URL?: string;
  WEBHOOK_SECRET?: string;
  UTMIFY_API_TOKEN?: string;
  UTMIFY_API_URL?: string;
  UTMIFY_PLATFORM?: string;
  ACAI_TX: KVNamespace;
}

export function utmifyPlatform(env: Env): string {
  const p = (env.UTMIFY_PLATFORM || 'Mangofy').trim();
  return p || 'Mangofy';
}

export const MANGOFY_BASE_DEFAULT = 'https://checkout.mangofy.com.br';

export function mangofyBase(env: Env): string {
  return (env.MANGOFY_BASE_URL || MANGOFY_BASE_DEFAULT).trim().replace(/\/+$/, '');
}

export function mangofyKey(env: Env): string {
  const key = (env.MANGOFY_API_KEY || '').trim();
  if (key === '' || key.startsWith('COLOQUE_')) return '';
  return key;
}

export function mangofyStore(env: Env): string {
  const code = (env.MANGOFY_STORE_CODE || '').trim();
  if (code === '' || code.startsWith('COLOQUE_')) return '';
  return code;
}

export function mangofyReady(env: Env): boolean {
  return mangofyKey(env) !== '' && mangofyStore(env) !== '';
}