import { useEffect, useState } from 'react';
import { CheckCircle2, MessageCircle, RefreshCw, Unplug } from 'lucide-react';
import { readAdmin, writeAdmin } from './adminApi';

type Message = { id: string; name: string; phone: string; action: string; amount: number; balance: number; dueDate: string;
  status: string; attempts: number; error: string; createdAt: string | null };
type Status = { connection: 'not_configured' | 'connected' | 'error'; configured: boolean; requirements: Record<string, boolean>;
  templateName: string; receiptTemplateName: string; language: string; templateStatus: string; displayPhone?: string;
  businessName?: string; quality?: string; error?: string; checkedAt: string; historyAvailable: boolean; messages: Message[] };
const labels: Record<string, string> = { pending: 'Queued', processing: 'Sending', accepted: 'Accepted by WhatsApp',
  failed: 'Rejected · can retry', unknown: 'Outcome unknown · review', consent_missing: 'Customer consent missing' };
const setupLabels: Record<string, string> = { WA_GRAPH_VERSION: 'Meta API version', WA_PHONE_NUMBER_ID: 'WhatsApp phone number ID',
  WA_ACCESS_TOKEN: 'Access token (hidden)', WA_CREDIT_TEMPLATE_NAME: 'Account / credit message template',
  WA_TEMPLATE_NAME: 'Receipt PDF template', WA_BUSINESS_ACCOUNT_ID: 'Business account ID (for template verification)' };
export function WhatsAppView({ onCustomers }: { onCustomers: () => void }) {
  const [status, setStatus] = useState<Status | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false), [writes, setWrites] = useState(false);
  async function load() {
    setBusy(true); setError('');
    try {
      const data = await readAdmin<Status>('whatsapp/status');
      setStatus(data); setWrites(true);
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  async function action(path: string, body: unknown) {
    if (busy) return; setBusy(true); setError('');
    try { await writeAdmin(path, body); setNotice('Processing completed. Check each message status below.'); await load(); }
    catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }
  const connected = status?.connection === 'connected';
  return <div className="whatsapp-page"><div className="page-title"><div><span className="eyebrow">CUSTOMER COMMUNICATION</span><h1>WhatsApp</h1><p>Prepare customer messages and send them from your own WhatsApp.</p></div><button className="button secondary" disabled={busy} onClick={() => void load()}><RefreshCw size={16} />{busy ? 'Checking…' : 'Refresh connection'}</button></div>
    <section className="glass whatsapp-manual-panel"><span className="eyebrow">FREE MANUAL SHARING</span><h2>We write the message. You tap Send.</h2>
      <p>Open Customers → WhatsApp, choose a message type and fill in the details. Review the prepared message, then open it in WhatsApp to send.</p>
      <div className="whatsapp-manual-actions"><button type="button" className="button whatsapp-send" onClick={onCustomers}><MessageCircle size={17} />Choose a customer</button><a className="button secondary" href="https://web.whatsapp.com/" target="_blank" rel="noopener noreferrer">Open WhatsApp Web</a></div>
      <p className="microcopy">On a computer, link your shop's WhatsApp account using WhatsApp Web and your phone's Linked devices option. On a phone, the message opens in WhatsApp. No API setup is needed. Your WhatsApp Web login status is shown in WhatsApp itself.</p>
    </section>
    <h2 className="whatsapp-api-heading">Optional automatic sending · WhatsApp Business API</h2><p className="microcopy whatsapp-api-description">The connection and history below apply to automatic API messages. Manual sharing above works independently.</p>
    {error && <div className="error-banner" role="alert">{error}</div>}{notice && <div className="success-banner" role="status">{notice}</div>}
    {status && <><section className="glass whatsapp-connection"><div className={`whatsapp-state ${connected ? 'credit-green' : 'credit-red'}`}>{connected ? <CheckCircle2 size={34} /> : <Unplug size={34} />}<div><h2>{connected ? 'Connected to WhatsApp Business' : status.connection === 'not_configured' ? 'Not connected · setup required' : 'Connection check failed'}</h2><p>{connected ? `${status.businessName || 'Business account'} · ${status.displayPhone || 'Phone verified by Meta'}` : 'Automatic sending is unavailable until the WhatsApp Business API is configured and reachable.'}</p></div></div>
      <div className="whatsapp-facts"><div><span>Quality rating</span><strong>{status.quality || 'Not available'}</strong></div><div><span>Credit template</span><strong>{status.templateName || 'Not configured'}</strong><small>{status.templateStatus === 'not_checked' ? 'Approval not checked' : status.templateStatus}</small></div><div><span>Language</span><strong>{status.language}</strong></div><div><span>Last connection check</span><strong>{new Date(status.checkedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</strong></div></div>
      {status.error && <p className="credit-red">Connection result: {status.error}</p>}
    </section><div className="whatsapp-panels"><section className="glass table-panel"><h2>Connection setup</h2>{Object.entries(status.requirements).map(([name, ready]) => <div className="whatsapp-setting" key={name}><span>{setupLabels[name] || name}</span><strong className={ready ? 'credit-green' : 'credit-red'}>{ready ? 'Configured' : 'Missing'}</strong></div>)}<p className="microcopy">Configure the WhatsApp Business credentials and approved templates in the server environment. Access tokens stay hidden.</p></section>
      <section className="glass table-panel"><h2>Automatic messages</h2><ul className="whatsapp-events"><li>Customer account created</li><li>New udhar or credit sale, with amount and due date</li><li>Payment received, with remaining balance</li></ul><p>Messages are created only for customers who agreed to account updates. They send after the transaction is saved.</p><p className="microcopy">Queued messages retry while the Node server is running. On a serverless host, use Process queued messages or configure a scheduled worker. Due-date reminders are not scheduled automatically.</p><button className="button primary" disabled={busy || !status.configured || !connected} onClick={() => void action('whatsapp/process', {})}><MessageCircle size={16} />Process queued messages</button></section></div>
      <section className="glass table-panel"><h2>Customer message history</h2><p className="microcopy">“Accepted” means Meta accepted the message. Delivery and read receipts are not verified here. An unknown outcome needs provider review before another send.</p>
        {!status.historyAvailable ? <p className="error-banner">Message history is unavailable. Check the Firebase connection.</p> : <div className="table-wrap"><table><thead><tr><th>Customer</th><th>Message</th><th>Amount / balance</th><th>Status</th><th>Action</th></tr></thead><tbody>{status.messages.map(message => <tr key={message.id}><td><strong>{message.name}</strong><small>{message.phone}</small></td><td>{message.action}<small>{message.dueDate ? `Due ${message.dueDate}` : ''}</small><small>{message.createdAt ? new Date(message.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : ''}</small></td><td>₹{message.amount.toLocaleString('en-IN')}<small>Balance ₹{message.balance.toLocaleString('en-IN')}</small></td><td><span className={message.status === 'accepted' ? 'credit-green' : ['failed', 'unknown'].includes(message.status) ? 'credit-red' : ''}>{labels[message.status] || message.status}</span><small>{message.error}</small><small>{message.attempts} attempts</small></td><td>{message.status === 'failed' && <button className="button secondary" disabled={busy || !connected || !status.configured} onClick={() => void action('whatsapp/retry', { eventId: message.id })}>Retry</button>}</td></tr>)}{!status.messages.length && <tr><td colSpan={5}>No customer messages yet.</td></tr>}</tbody></table></div>}
      </section></>}
  </div>;
}
