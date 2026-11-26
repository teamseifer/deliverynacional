import type { Env } from '../lib/env';
import { mangofyReady, utmifyPlatform } from '../lib/env';
import {
  buildMangofyBody,
  isDuplicateExternal,
  mangofyError,
  mangofyExternal,
  mangofyPaidAt,
  mangofyPaymentCode,
  mangofyPixCode,
  mangofyPixImage,
  mangofyRequest,
  mangofyStatus,
  MANGOFY_PAYMENT_GET_PATH,
  MANGOFY_PIX_CREATE_PATH,
} from '../lib/mangofy';
import { asRecord, clientIp, isPaidStatus, json, preflight, readJson, str } from '../lib/http';
import { buildUtmifyOrder, sendUtmifyPending, syncUtmifyStatus } from '../lib/utmify';

const TRACK_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'src', 'sck', 'fbp', 'fbc', 'utm_id'];

function putTrack(out: Record<string, string>, key: string, val: unknown) {
  const clean = typeof val === 'string' ? val.trim() : val === undefined || val === null ? '' : String(val).trim();
  if (clean === '' || clean === 'null' || clean === 'undefined') return;
  out[key] = clean.slice(0, 300);
}

function collectTrack(request: Request, raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const src of [raw.tracking, raw.trackProps, raw.trackingParameters]) {
    const rec = asRecord(src);
    if (!rec) continue;
    for (const key of TRACK_KEYS) putTrack(out, key, rec[key]);
  }
  const cookie = request.headers.get('cookie') || '';
  const fbp = cookie.match(/(?:^|;\s*)_fbp=([^;]+)/);
  const fbc = cookie.match(/(?:^|;\s*)_fbc=([^;]+)/);
  if (fbp) putTrack(out, 'fbp', decodeURIComponent(fbp[1]));
  if (fbc) putTrack(out, 'fbc', decodeURIComponent(fbc[1]));
  try {
    const ref = new URL(request.headers.get('referer') || 'http://local/');
    for (const key of TRACK_KEYS) putTrack(out, key, ref.searchParams.get(key) || '');
  } catch {
    /* ok */
  }
  return out;
}

function customerEmail(name: string, document: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 18);
  const tail = document.replace(/\D/g, '').slice(-4) || '00';
  return `${slug || 'cliente'}${tail}@gmail.com`;
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const pf = preflight(ctx.request);
  if (pf) return pf;
  const action = new URL(ctx.request.url).searchParams.get('action') || '';
  try {
    switch (action) {
      case 'ping':
        return json({
          ok: true,
          gateway: 'mangofy',
          mangofy_key_configurada: mangofyReady(ctx.env),
        });
      case 'create_pix':
        return createPix(ctx);
      case 'check_status':
        return checkStatus(ctx);
      default:
        return json({ ok: false, error: 'Use action=create_pix | check_status | ping' }, 400);
    }
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'Erro interno' }, 500);
  }
};

async function createPix(ctx: EventContext<Env, string, unknown>): Promise<Response> {
  if (ctx.request.method !== 'POST') return json({ ok: false, error: 'Metodo nao permitido' }, 405);
  if (!mangofyReady(ctx.env)) {
    return json(
      {
        ok: false,
        error: 'Gateway PIX nao configurado. Defina MANGOFY_API_KEY e MANGOFY_STORE_CODE.',
        gateway: 'mangofy',
      },
      503
    );
  }
  const raw = await readJson(ctx.request);
  const client = asRecord(raw.client);
  if (!str(raw.identifier)) return json({ ok: false, error: 'Campo identifier eh obrigatorio.' }, 400);
  if (!(Number(raw.amount) > 0)) return json({ ok: false, error: 'Campo amount eh obrigatorio.' }, 400);
  if (!client || !str(client.name) || !str(client.phone) || !str(client.document)) {
    return json({ ok: false, error: 'Nome, telefone e CPF sao obrigatorios.' }, 400);
  }

  let result = await mangofyRequest(ctx.env, 'POST', MANGOFY_PIX_CREATE_PATH, buildMangofyBody(ctx.request, ctx.env, raw));
  if (result.transportError || result.httpStatus >= 500) {
    await new Promise((r) => setTimeout(r, 1500));
    const retry = await mangofyRequest(ctx.env, 'POST', MANGOFY_PIX_CREATE_PATH, buildMangofyBody(ctx.request, ctx.env, raw));
    if (!retry.transportError && retry.httpStatus < 500) result = retry;
  }
  if (isDuplicateExternal(result)) {
    raw.identifier = `${str(raw.identifier).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60)}_${Date.now()}`;
    result = await mangofyRequest(ctx.env, 'POST', MANGOFY_PIX_CREATE_PATH, buildMangofyBody(ctx.request, ctx.env, raw));
  }
  if (result.transportError) return json({ ok: false, error: 'Falha de conexao com gateway', gateway: 'mangofy' }, 502);
  if (result.httpStatus >= 400) {
    const code = result.httpStatus >= 400 ? result.httpStatus : 400;
    return json(
      { ok: false, error: mangofyError(result.data, 'Erro ao gerar PIX'), gateway: 'mangofy', status: code },
      code >= 500 ? 502 : 400
    );
  }

  let status = mangofyStatus(result.data);
  let txId = mangofyPaymentCode(result.data);
  let code = mangofyPixCode(result.data);
  let qr = mangofyPixImage(result.data);
  if (status === 'FAILED' || status === 'REFUSED' || status === 'GATEWAY_ERROR' || status === 'SYSTEM_ERROR') {
    return json({ ok: false, error: mangofyError(result.data, 'O gateway recusou a criacao do PIX.'), status: 400 }, 400);
  }
  for (let i = 0; i < 3 && !code && txId; i++) {
    await new Promise((r) => setTimeout(r, 1200));
    const poll = await mangofyRequest(ctx.env, 'GET', `${MANGOFY_PAYMENT_GET_PATH}${encodeURIComponent(txId)}`);
    if (poll.transportError || poll.httpStatus >= 400) continue;
    code = mangofyPixCode(poll.data);
    qr = mangofyPixImage(poll.data);
    status = mangofyStatus(poll.data);
    txId = mangofyPaymentCode(poll.data) || txId;
  }
  if (!code) {
    return json(
      {
        ok: false,
        error: 'PIX em processamento. Tente novamente em alguns segundos.',
        transactionId: txId,
        status,
      },
      504
    );
  }

  const pix: Record<string, string> = { code };
  if (qr) {
    if (qr.toLowerCase().startsWith('http')) pix.image = qr;
    else pix.base64 = qr;
  }

  const orderId = txId || str(raw.identifier);
  const name = str(client.name).trim();
  const document = str(client.document).replace(/\D/g, '');
  const track = collectTrack(ctx.request, raw);
  const order = buildUtmifyOrder({
    orderId,
    amount: Math.round(Number(raw.amount) * 100) / 100,
    productType: str(raw.productType) || 'acai-carrinho',
    productName: str(raw.productName),
    name: name || 'Cliente',
    email: str(client.email).trim() || customerEmail(name, document),
    phone: str(client.phone).replace(/\D/g, '') || '11999999999',
    document,
    ip: clientIp(ctx.request),
    track,
    platform: utmifyPlatform(ctx.env),
  });
  const aliases = [orderId, txId, str(raw.identifier), mangofyExternal(result.data)].filter(Boolean);
  await sendUtmifyPending(ctx.env, order, aliases);

  return json({
    ok: true,
    transactionId: txId,
    identifier: str(raw.identifier),
    status: status || 'PENDING',
    pix,
    amount: Math.round(Number(raw.amount) * 100) / 100,
  });
}

async function checkStatus(ctx: EventContext<Env, string, unknown>): Promise<Response> {
  if (ctx.request.method !== 'GET') return json({ ok: false, error: 'Metodo nao permitido' }, 405);
  const url = new URL(ctx.request.url);
  const transactionId = (url.searchParams.get('id') || '').trim();
  if (!transactionId) return json({ ok: false, error: 'Parametro id eh obrigatorio.' }, 400);
  if (!mangofyReady(ctx.env)) {
    return json({ ok: true, id: transactionId, status: 'PENDING', payedAt: null });
  }

  const result = await mangofyRequest(ctx.env, 'GET', `${MANGOFY_PAYMENT_GET_PATH}${encodeURIComponent(transactionId)}`);
  if (result.transportError || result.httpStatus >= 400 || !result.data) {
    return json({ ok: true, id: transactionId, status: 'PENDING', payedAt: null });
  }
  const status = mangofyStatus(result.data);
  const payedAt = mangofyPaidAt(result.data);
  const respId = mangofyPaymentCode(result.data) || transactionId;
  if (isPaidStatus(status) || payedAt) {
    const paidTs = payedAt || new Date().toISOString();
    const ext = mangofyExternal(result.data);
    await syncUtmifyStatus(ctx.env, [respId, transactionId, ext], 'PAID', paidTs);
    return json({ ok: true, id: respId, status: 'PAID', payedAt: paidTs });
  }
  return json({ ok: true, id: respId, status, payedAt: null });
}