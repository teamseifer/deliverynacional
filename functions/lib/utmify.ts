import type { Env } from './env';
import { utmifyPlatform } from './env';

const TTL = 60 * 60 * 24 * 30;
const DEFAULT_URL = 'https://api.utmify.com.br/api-credentials/orders';

export interface UtmifyOrder {
  orderId: string;
  platform: string;
  paymentMethod: 'pix';
  status: 'waiting_payment' | 'paid' | 'refused' | 'refunded' | 'chargedback';
  createdAt: string;
  approvedDate: string | null;
  refundedAt: string | null;
  isTest: false;
  customer: {
    name: string;
    email: string;
    phone: string;
    document: string;
    country: 'BR';
    ip: string;
  };
  products: Array<{
    id: string;
    name: string;
    planId: null;
    planName: null;
    quantity: number;
    priceInCents: number;
  }>;
  trackingParameters: {
    src: string | null;
    sck: string | null;
    utm_source: string | null;
    utm_campaign: string | null;
    utm_medium: string | null;
    utm_content: string | null;
    utm_term: string | null;
    utm_id: string | null;
    fbc: string | null;
    fbp: string | null;
  };
  commission: {
    totalPriceInCents: number;
    gatewayFeeInCents: number;
    userCommissionInCents: number;
    currency: 'BRL';
  };
}

interface StoredOrder {
  order: UtmifyOrder;
  synced: string;
}

function utcStamp(input?: string | null): string {
  const raw = (input || '').trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) return raw;
  const d = raw ? new Date(raw) : new Date();
  const when = Number.isNaN(d.getTime()) ? new Date() : d;
  return when.toISOString().slice(0, 19).replace('T', ' ');
}

function tp(track: Record<string, string>, key: string): string | null {
  const v = (track[key] || '').trim();
  return v === '' ? null : v.slice(0, 300);
}

function productId(name: string): string {
  return (name || 'ACAI')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function mapUtmifyStatus(gatewayStatus: string): UtmifyOrder['status'] {
  const up = gatewayStatus.toUpperCase();
  if (['COMPLETED', 'PAID', 'PAGO', 'PAYED', 'APPROVED', 'SUCCESS', 'CONFIRMED', 'AUTHORIZED'].includes(up)) {
    return 'paid';
  }
  if (['FAILED', 'REJECTED', 'CANCELLED', 'CANCELED', 'CANCELADO', 'EXPIRED', 'EXPIRADO'].includes(up)) {
    return 'refused';
  }
  if (['REFUNDED', 'REEMBOLSADO', 'ESTORNADO'].includes(up)) return 'refunded';
  if (['CHARGED_BACK', 'CHARGEDBACK', 'CHARGEBACK'].includes(up)) return 'chargedback';
  return 'waiting_payment';
}

export function buildUtmifyOrder(input: {
  orderId: string;
  amount: number;
  productType: string;
  productName?: string;
  name: string;
  email: string;
  phone: string;
  document: string;
  ip: string;
  track: Record<string, string>;
  createdAt?: string;
  platform?: string;
}): UtmifyOrder {
  const amountCents = Math.round(input.amount * 100);
  const title = (input.productName || input.productType || 'Point do Acai').slice(0, 120);
  return {
    orderId: input.orderId,
    platform: (input.platform || 'Mangofy').trim() || 'Mangofy',
    paymentMethod: 'pix',
    status: 'waiting_payment',
    createdAt: utcStamp(input.createdAt),
    approvedDate: null,
    refundedAt: null,
    isTest: false,
    customer: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      document: input.document,
      country: 'BR',
      ip: input.ip,
    },
    products: [
      {
        id: productId(title),
        name: title,
        planId: null,
        planName: null,
        quantity: 1,
        priceInCents: amountCents,
      },
    ],
    trackingParameters: {
      src: tp(input.track, 'src'),
      sck: tp(input.track, 'sck'),
      utm_source: tp(input.track, 'utm_source'),
      utm_campaign: tp(input.track, 'utm_campaign'),
      utm_medium: tp(input.track, 'utm_medium'),
      utm_content: tp(input.track, 'utm_content'),
      utm_term: tp(input.track, 'utm_term'),
      utm_id: tp(input.track, 'utm_id'),
      fbc: tp(input.track, 'fbc'),
      fbp: tp(input.track, 'fbp'),
    },
    commission: {
      totalPriceInCents: amountCents,
      gatewayFeeInCents: 0,
      userCommissionInCents: amountCents,
      currency: 'BRL',
    },
  };
}

async function putOrder(env: Env, stored: StoredOrder, aliases: string[]): Promise<void> {
  const id = stored.order.orderId;
  if (!id || !env.ACAI_TX) return;
  await env.ACAI_TX.put(`utmify:${id}`, JSON.stringify(stored), { expirationTtl: TTL });
  for (const alias of aliases) {
    const a = alias.trim();
    if (a === '' || a === id) continue;
    await env.ACAI_TX.put(`utmify-alias:${a}`, id, { expirationTtl: TTL });
  }
}

async function loadOrder(env: Env, ids: string[]): Promise<StoredOrder | null> {
  if (!env.ACAI_TX) return null;
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = (raw || '').trim();
    if (id === '' || seen.has(id)) continue;
    seen.add(id);
    const direct = await env.ACAI_TX.get(`utmify:${id}`);
    if (direct) {
      try {
        return JSON.parse(direct) as StoredOrder;
      } catch {
        return null;
      }
    }
    const alias = await env.ACAI_TX.get(`utmify-alias:${id}`);
    if (!alias) continue;
    const via = await env.ACAI_TX.get(`utmify:${alias}`);
    if (!via) continue;
    try {
      return JSON.parse(via) as StoredOrder;
    } catch {
      return null;
    }
  }
  return null;
}

async function postOrderOnce(env: Env, order: UtmifyOrder): Promise<{ ok: boolean; http: number; body: string }> {
  const token = (env.UTMIFY_API_TOKEN || '').trim();
  const url = (env.UTMIFY_API_URL || '').trim() || DEFAULT_URL;
  if (token === '' || token.startsWith('COLOQUE_')) {
    return { ok: false, http: 0, body: 'no_token' };
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'x-api-token': token,
      },
      body: JSON.stringify(order),
      signal: AbortSignal.timeout(12000),
    });
    const body = await res.text();
    return { ok: res.ok, http: res.status, body };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, http: 0, body: msg };
  }
}

async function postOrder(env: Env, order: UtmifyOrder): Promise<boolean> {
  let r = await postOrderOnce(env, order);
  if (!r.ok && (r.http === 0 || r.http >= 500 || r.http === 429)) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    r = await postOrderOnce(env, order);
  }
  return r.ok;
}

export async function sendUtmifyPending(env: Env, order: UtmifyOrder, aliases: string[]): Promise<void> {
  try {
    const stored: StoredOrder = { order, synced: '' };
    const ok = await postOrder(env, order);
    if (ok) stored.synced = order.status;
    await putOrder(env, stored, aliases);
  } catch {
    /* utmify opcional */
  }
}

export async function syncUtmifyStatus(
  env: Env,
  ids: Array<string | undefined | null>,
  gatewayStatus: string,
  payedAt: string | null
): Promise<void> {
  try {
    const clean = ids.map((id) => (id || '').trim()).filter((id) => id !== '');
    const stored = await loadOrder(env, clean);
    if (!stored) return;
    const next = mapUtmifyStatus(gatewayStatus);
    if (stored.synced === 'paid' && (next === 'waiting_payment' || next === 'refused')) return;
    if (stored.synced === next) return;
    stored.order.status = next;
    if (next === 'paid') stored.order.approvedDate = utcStamp(payedAt);
    if (next === 'refunded') stored.order.refundedAt = utcStamp(null);
    const ok = await postOrder(env, stored.order);
    if (ok) stored.synced = next;
    await putOrder(env, stored, clean);
  } catch {
    /* utmify opcional */
  }
}