import { StaffSettings } from './StaffSettings';
import { DailyOperations } from './DailyOperations';
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowDownUp, ArrowRight, BarChart3, ChevronRight, FileText,
  LayoutDashboard, LockKeyhole, MessageCircle, Moon, Package, RefreshCw, ShieldCheck,
  ShoppingBag, Sun, Truck, Users, Search, type LucideIcon } from 'lucide-react';
import type { Owner } from '../shared/contracts';
import { CommerceView } from './Commerce';
import { BrandLogo } from './BrandLogo';
import { Dashboard } from './Dashboard';
import { CreditView } from './CreditView';
import { WhatsAppView } from './WhatsAppView';
import { ReportsWorkspace } from './reports/ReportsWorkspace';
import { CommandPalette } from './CommandPalette';

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  if (response.status === 401 && !url.includes('/auth/')) window.location.assign('/login');
  if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('The admin API is not connected on this deployment. Check the Vercel function and environment settings.');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please retry.');
  return data;
}
async function post<T>(url: string, body: unknown): Promise<T> {
  const { token } = await api<{ token: string }>('/api/auth/csrf');
  return api<T>(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': token }, body: JSON.stringify(body) });
}
function Brand({ compact = false }: { compact?: boolean }) {
  return <div className="brand"><BrandLogo /><span className="sr-only">{compact ? 'Store' : 'Admin studio'}</span></div>;
}
export function App() {
  const [dark, setDark] = useState(() => localStorage.getItem('bo-theme-v2') !== 'light');
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111111' : '#f4f5f7');
    localStorage.setItem('bo-theme-v2', dark ? 'dark' : 'light');
  }, [dark]);
  return <><div className="ambient ambient-one" /><div className="ambient ambient-two" />{window.location.pathname === '/login' ? <Login /> : window.location.pathname === '/enroll' ? <EnrollDevice /> : <Workspace dark={dark} toggleTheme={() => setDark(!dark)} />}</>;
}
function Login() {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deviceStatus, setDeviceStatus] = useState<{ loginAvailable: boolean; disabled?: boolean } | null>(null);
  useEffect(() => { api<{ loginAvailable: boolean; disabled?: boolean }>('/api/auth/device/status').then(setDeviceStatus).catch(cause => setError((cause as Error).message)); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try { await post('/api/auth/login', { pin }); window.location.assign('/'); }
    catch (cause) { setError((cause as Error).message); setBusy(false); }
  }
  return <main className="login-page"><section className="login-side"><div className="login-card glass"><Brand /><span className="pill"><LockKeyhole size={14} /> Shop access</span><h1>Billing starts here</h1><p>Enter your four-digit shop PIN.</p><form onSubmit={event => void submit(event)}><label htmlFor="pin">Shop PIN</label><input id="pin" type="password" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete="off" required autoFocus value={pin} onChange={event => setPin(event.target.value)} />{deviceStatus?.disabled && <p role="status">Hosted access is disabled.</p>}{deviceStatus && !deviceStatus.loginAvailable && !deviceStatus.disabled && <p role="status">This device needs a one-time trust link from the shop owner.</p>}{new URLSearchParams(window.location.search).has('paired') && <p role="status">Device trusted. Enter your PIN.</p>}{error && <p className="error" role="alert">{error}</p>}<button className="button primary login-submit" disabled={busy || !deviceStatus?.loginAvailable}>{busy ? 'Signing in…' : 'Open billing'}<ArrowRight size={17} /></button></form></div></section></main>;
}
function EnrollDevice() {
  const [token] = useState(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
    history.replaceState(null, '', '/enroll');
    return value;
  });
  const [label, setLabel] = useState('My device');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(token ? '' : 'This invitation link is missing its one-time token.');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try { await post('/api/auth/device/enroll', { token, label }); window.location.assign('/login?paired=1'); }
    catch (cause) { setError((cause as Error).message); setBusy(false); }
  }
  return <main className="device-enroll-page"><div className="login-card glass"><Brand /><span className="eyebrow">ONE-TIME SETUP</span><h1>Trust this device</h1><p>Pair this browser with the shop POS. After pairing, daily sign-in uses only your PIN.</p><form onSubmit={event => void submit(event)}><label htmlFor="device-label">Device name</label><input id="device-label" value={label} onChange={event => setLabel(event.target.value)} maxLength={60} minLength={1} required placeholder="Shop laptop or my phone" />{error && <p className="error" role="alert">{error}</p>}<button className="button primary login-submit" disabled={busy || !token}>{busy ? 'Pairing…' : 'Trust this device'}<ArrowRight size={17} /></button></form><p className="muted">This invitation works once and expires after 10 minutes.</p></div></main>;
}
const primaryTabs: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'pos', label: 'Billing', icon: ShoppingBag },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'suppliers', label: 'Suppliers', icon: Truck },
  { id: 'credit', label: 'Credit / Udhar', icon: ArrowDownUp },
  { id: 'inventory', label: 'Inventory', icon: ArrowDownUp },
  { id: 'orders', label: 'Orders', icon: FileText }
];
const moreTabs: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { id: 'sync', label: 'Sync health', icon: RefreshCw },
  { id: 'security', label: 'Trusted devices', icon: ShieldCheck }
];
const tabs = [...primaryTabs, ...moreTabs];
function Workspace({ dark, toggleTheme }: { dark: boolean; toggleTheme: () => void }) {
  const initial = window.location.pathname.slice(1);
  const [tab, setTab] = useState(tabs.some(t => t.id === initial && t.id !== 'login') ? initial : 'pos');
  const [owner, setOwner] = useState<Owner | null>(null);
  const [error, setError] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const allowed=(id:string)=>owner?.role!=='cashier'||['pos','customers','credit','sync'].includes(id);
  useEffect(()=>{if(owner?.role==='cashier'&&!allowed(tab))navigate('pos');},[owner,tab]);
  function navigate(id: string) { setTab(id); history.pushState(null, '', id === 'pos' ? '/' : `/${id}`); }
  useEffect(() => {
    api<Owner>('/api/auth/me').then(identity => {
      if (identity) {
        setOwner(identity);
        localStorage.setItem('pos-offline-session', JSON.stringify({ identity, at: Date.now() }));
      }
    }).catch(() => window.location.assign('/login'));
    const pop = () => {
      const current = window.location.pathname.slice(1);
      setTab(tabs.some(t => t.id === current && t.id !== 'login') ? current : 'pos');
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);

  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, []);

  async function logout() {
    try { await post('/api/auth/logout', {}); } catch (cause) { setError((cause as Error).message); return; }
    localStorage.removeItem('pos-offline-session');
    localStorage.removeItem('pos-activation-cache');
    window.location.assign('/login');
  }
  return <div className="workspace">
    <aside className="sidebar glass"><Brand compact /><div className="workspace-label">YOUR WORKSPACE</div><nav aria-label="Main navigation">{primaryTabs.filter(item=>allowed(item.id)).map(item => <button key={item.id} onClick={() => navigate(item.id)} className={`nav-item ${tab === item.id ? 'selected' : ''}`} aria-current={tab === item.id ? 'page' : undefined}><item.icon size={19} />{item.label}{tab === item.id && <span className="nav-dot" />}</button>)}<details className="sidebar-more"><summary>More tools</summary><div className="more-menu">{moreTabs.filter(item=>allowed(item.id)&&(item.id!=='security'||owner?.role==='owner')).map(item => <button key={item.id} onClick={() => navigate(item.id)} className={`nav-item ${tab === item.id ? 'selected' : ''}`}><item.icon size={19} />{item.label}</button>)}</div></details></nav>
      <div className="sidebar-bottom"><div className="sidebar-connection">Shared website catalog · Live store</div>
      <div className="owner"><span className="avatar">BO</span><div><strong>{owner?.name || (owner?.role === 'cashier' ? 'Cashier' : owner?.role === 'manager' ? 'Manager' : 'Store owner')}</strong><small>{owner ? 'Active session' : 'Ready'}</small></div><button className="icon-button" onClick={logout} aria-label="Go to dashboard" title="Reset to Dashboard"><LayoutDashboard size={17} /></button></div></div>
    </aside>
    <div className="main-area"><header className="topbar">
      <div className="breadcrumbs">Workspace <ChevronRight size={14} /><strong>{tabs.find(t => t.id === tab)?.label || 'Dashboard'}</strong></div>
      <div
        className="topbar-search-trigger"
        onClick={() => setPaletteOpen(true)}
        title="Global Search (Ctrl+K)"
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setPaletteOpen(true); }}
      >
        <Search size={15} style={{ color: 'var(--gold)' }} />
        <span>Search actions, products, bills...</span>
        <kbd>Ctrl+K</kbd>
      </div>
      <div className="top-actions">
        <button
          onClick={() => setPaletteOpen(true)}
          className="icon-button topbar-search-icon-btn"
          aria-label="Search actions, products, bills"
        >
          <Search size={18} />
        </button>
        <button onClick={toggleTheme} className="icon-button theme-button" aria-label={dark ? 'Use light theme' : 'Use dark theme'}>{dark ? <Sun size={19} /> : <Moon size={19} />}</button>
      </div>
    </header>
    <main className="content" id="main-content">{error && <div className="error-banner" role="alert">{error}<button onClick={() => setError('')}>Dismiss</button></div>}
      {tab === 'dashboard' && <Dashboard navigate={navigate} role={owner?.role} />}
      {tab === 'security' && owner?.role === 'owner' && <><StaffSettings /><TrustedDevices /></>}
      {tab === 'reports' && <ReportsWorkspace role={owner?.role} />}
      {tab === 'credit' && <CreditView />}
      {tab === 'whatsapp' && <WhatsAppView onCustomers={() => navigate('customers')} />}
      {['products', 'pos', 'inventory', 'orders', 'customers', 'suppliers', 'sync'].includes(tab) && <CommerceView tab={tab} role={owner?.role} />}
      <footer className="page-footer"><span>BROTHERS OUTFIT GALLERY <span className="footer-separator">/</span> STUDIO</span><span>A little more clarity. Every day.</span></footer>
    </main></div>
    <CommandPalette
      isOpen={paletteOpen}
      onClose={() => setPaletteOpen(false)}
      navigate={navigate}
      role={owner?.role}
    />
  </div>;
}
type DeviceInfo = { id: string; label: string; createdAt: number; expiresAt: number; lastUsedAt: number | null };
function TrustedDevices() {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [invite, setInvite] = useState<{ url: string; expiresAt: number } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [local] = useState(() => ['localhost', '127.0.0.1'].includes(window.location.hostname));
  async function load() {
    try { setDevices((await api<{ devices: DeviceInfo[] }>('/api/auth/device/list')).devices); }
    catch (cause) { setError((cause as Error).message); }
  }
  useEffect(() => { void load(); }, []);
  async function createInvite() {
    setBusy(true); setError('');
    try { setInvite(await post<{ url: string; expiresAt: number }>('/api/auth/device/invite', {})); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    setBusy(true); setError('');
    try { await post('/api/auth/device/revoke', { id }); await load(); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  return <><PageTitle eyebrow="DEVICE ACCESS" title="Trusted devices" description="Pair your own browsers once. Daily sign-in uses the shop PIN; lost devices can be revoked here." />
    {error && <div className="error-banner" role="alert">{error}</div>}
    <section className="glass device-panel"><h2>Pair a new device</h2><p>Open the invitation link on the phone or computer you want to use. It works once and expires after 10 minutes.</p>{local ? <button className="button primary" disabled={busy} onClick={() => void createInvite()}>Create one-time link</button> : <div className="notice"><LockKeyhole size={18} />Create invitations from the local shop preview at localhost:4310.</div>}
    {invite && <div className="device-invite"><strong>Open this link on the new device before {new Date(invite.expiresAt).toLocaleTimeString('en-IN')}:</strong><a href={invite.url} target="_blank" rel="noreferrer">{invite.url}</a><button className="button secondary" onClick={() => void navigator.clipboard.writeText(invite.url)}>Copy link</button><small>Keep this link private. It grants one device access to the PIN screen.</small></div>}</section>
    <section className="glass device-panel"><h2>Active trusted devices</h2>{devices.length ? devices.map(device => <div className="device-row" key={device.id}><div><strong>{device.label}</strong><small>Trusted {new Date(device.createdAt).toLocaleDateString('en-IN')} · Expires {new Date(device.expiresAt).toLocaleDateString('en-IN')}</small></div><button className="button secondary" disabled={busy} onClick={() => void revoke(device.id)}>Revoke</button></div>) : <p>No active trusted devices yet.</p>}</section></>;
}
function PageTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="page-title"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div></div>;
}
