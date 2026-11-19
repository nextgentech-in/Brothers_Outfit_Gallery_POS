import { Router } from 'express';
import { config } from './config.js';
import { firebase } from './firebase.js';

const problem = (message: string, status = 502) => Object.assign(new Error(message), { status });
const MAX_PDF_BYTES = 10_000_000;
function trustedLabelUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw problem('Delhivery returned an invalid label link.'); }
  const host = url.hostname.toLowerCase();
  const allowed = host === 'delhivery.com' || host.endsWith('.delhivery.com') ||
    /^[a-z0-9.-]+\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.test(host) || host.endsWith('.cloudfront.net');
  if (!allowed || url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443'))
    throw problem('Delhivery returned an unsupported label download host.');
  return url;
}
async function bodyBytes(response: Response) {
  if (Number(response.headers.get('content-length')) > MAX_PDF_BYTES) throw problem('The courier label file is too large.');
  if (!response.body) throw problem('Delhivery returned an empty label.');
  const reader = response.body.getReader(), chunks: Buffer[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_PDF_BYTES) throw problem('The courier label file is too large.');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks);
}
const isPdf = (bytes: Buffer) => bytes.subarray(0, 5).toString('ascii') === '%PDF-';
export async function delhiveryLabel(waybill: string): Promise<Buffer> {
  if (!/^[a-zA-Z0-9-]{6,64}$/.test(waybill)) throw problem('This order has no valid Delhivery AWB. Create the shipment on the website first.', 409);
  if (!config.delhivery.apiKey) throw problem('The POS server needs the existing DELHIVERY_API_KEY to retrieve courier labels.', 503);
  const origin = config.delhivery.environment === 'staging' ? 'https://staging-express.delhivery.com' : 'https://track.delhivery.com';
  const api = new URL('/api/p/packing_slip', origin);
  api.searchParams.set('wbns', waybill); api.searchParams.set('pdf', 'True');
  const signal = AbortSignal.timeout(20000);
  const response = await fetch(api, { headers: { Authorization: `Token ${config.delhivery.apiKey}`, Accept: 'application/json, application/pdf' }, redirect: 'error', signal });
  if (!response.ok) throw problem(response.status === 401 || response.status === 403
    ? 'Delhivery did not accept the configured API key. Check the account and API environment.'
    : 'Delhivery could not retrieve this label. Try again after the shipment is manifested.');
  const bytes = await bodyBytes(response);
  if (isPdf(bytes)) return bytes;
  let data: Record<string, any>;
  try { data = JSON.parse(bytes.toString('utf8')); } catch { throw problem('Delhivery did not return a label PDF.'); }
  if (data.packages_found === 0 || (Array.isArray(data.packages) && !data.packages.length))
    throw problem('The courier label is not available yet. Check that this AWB has been manifested on the website.', 409);
  const packages = Array.isArray(data.packages) ? data.packages : [];
  const item = packages.find((item: any) => String(item?.wbn ?? item?.waybill ?? '') === waybill) || packages[0];
  if (item && (item.wbn || item.waybill) && String(item.wbn || item.waybill) !== waybill)
    throw problem('Delhivery returned a label for a different AWB. Request the label again.');
  const link = data.pdf_download_link || data.pdf_url || item?.pdf_download_link || item?.pdf_url;
  if (typeof link !== 'string') throw problem('Delhivery did not provide a PDF download link for this AWB.');
  let url = trustedLabelUrl(link);
  // Signed document URLs do not receive the API token. Validate each CDN redirect.
  for (let redirects = 0; redirects < 3; redirects++) {
    const file = await fetch(url, { headers: { Accept: 'application/pdf' }, redirect: 'manual', signal });
    if ([301, 302, 303, 307, 308].includes(file.status)) {
      const location = file.headers.get('location');
      if (!location) break;
      url = trustedLabelUrl(new URL(location, url).href); continue;
    }
    if (!file.ok) throw problem('The courier label download failed. Request the label again.');
    const pdf = await bodyBytes(file);
    if (!isPdf(pdf)) throw problem('Delhivery returned a file that is not a label PDF.');
    return pdf;
  }
  throw problem('The courier label download redirected too many times.');
}

export const shippingRouter = Router();
shippingRouter.get('/orders/:orderId/shipping-label', async (req, res) => {
  if (!/^[\w.:-]{1,128}$/.test(req.params.orderId)) { res.status(400).json({ error: 'Invalid order.' }); return; }
  try {
    const snapshot = await firebase().db.collection('orders').doc(req.params.orderId).get();
    if (!snapshot.exists) throw problem('Order not found.', 404);
    const order = snapshot.data()!;
    if (order.createdBy === 'admin-pos' || String(order.channel).toLowerCase() === 'pos' || /^(POS|EX)-/.test(snapshot.id))
      throw problem('Courier labels are available for website shipments.', 409);
    if (['cancelled', 'canceled'].includes(String(order.status).toLowerCase())) throw problem('This order is cancelled.', 409);
    const pdf = await delhiveryLabel(String(order.waybill || order.trackingNumber || ''));
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="delhivery-${snapshot.id}.pdf"`,
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).send(pdf);
  } catch (error) {
    const failure = error as Error & { status?: number };
    res.status(failure.status || 502).json({ error: failure.status ? failure.message : 'The courier label could not load. Check the connection and try again.' });
  }
});
