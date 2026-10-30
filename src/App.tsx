import { useEffect, useState, type FormEvent } from 'react';
import { ArrowDownUp, ArrowRight, ArrowUpRight, Check, ChevronRight, CircleDot, Database, FileText,
  Layers3, LayoutDashboard, LockKeyhole, LogOut, Moon, Package, RefreshCw, Search, ShieldCheck,
  ShoppingBag, Sparkles, Sun, Users, Workflow, type LucideIcon } from 'lucide-react';
import { mapping, phases, type Owner } from '../shared/contracts';
import { CommerceView } from './Commerce';
import { BrandLogo } from './BrandLogo';
import { Dashboard } from './Dashboard';

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
  return <><div className="ambient ambient-one" /><div className="ambient ambient-two" />{window.location.pathname === '/login' ? <Login /> : <Workspace dark={dark} toggleTheme={() => setDark(!dark)} />}</>;
}
function Login() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    try { await post('/api/auth/login', { pin: form.get('pin') }); window.location.assign('/'); }
    catch (error) { setError((error as Error).message); setBusy(false); }
  }
  return <main className="login-page">
    <section className="login-story"><Brand /><div className="story-copy"><span className="eyebrow"><span className="tiny-line" /> THE BUSINESS BEHIND THE STYLE</span><h1>Your store.<br />Perfectly<br /><em>in view.</em></h1><p>A dedicated workspace for Brothers Outfit Gallery.<br />One place to bring your shop and website together.</p></div>
      <div className="connection-card glass"><div className="connection-icon"><ShoppingBag size={23} /></div><div><strong>One store. One source of truth.</strong><p>Your existing catalog, orders and customers.</p></div><ArrowDownUp size={20} /></div>
      <div className="story-footer"><span>MADE FOR BROTHERS OUTFIT GALLERY</span><span>ADMIN PREVIEW</span></div>
    </section>
    <section className="login-side"><div className="login-card glass"><span className="pill"><LockKeyhole size={13} /> PRIVATE WORKSPACE</span><h2>Welcome back.</h2><p className="muted">Enter your shop PIN to continue.</p><form onSubmit={submit}>
      <label htmlFor="pin">4-digit PIN</label><input id="pin" name="pin" type="password" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete="off" required placeholder="••••" />
      {error && <p className="error" role="alert">{error}</p>}<button className="button primary login-submit" disabled={busy}>{busy ? 'Signing in…' : 'Open your workspace'}<ArrowRight size={17} /></button>
    </form><div className="login-note"><ShieldCheck size={19} /><p>Your session is protected and expires automatically. Keep your PIN private.</p></div></div><p className="login-caption">Separate admin preview · Live business writes require reviewed cutover</p></section>
  </main>;
}
const primaryTabs: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }, { id: 'products', label: 'Products', icon: Package },
  { id: 'pos', label: 'Billing / POS', icon: ShoppingBag }, { id: 'inventory', label: 'Inventory', icon: ArrowDownUp },
  { id: 'orders', label: 'Orders', icon: FileText }, { id: 'customers', label: 'Customers', icon: Users }
];
const moreTabs: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'suppliers', label: 'Suppliers', icon: ShoppingBag }, { id: 'reports', label: 'Reports', icon: LayoutDashboard },
  { id: 'sync', label: 'Sync health', icon: RefreshCw }
];
const tabs = [...primaryTabs, ...moreTabs,
  { id: 'mapping', label: 'Data mapping', icon: Layers3 }, { id: 'delivery', label: 'Delivery plan', icon: Workflow },
  { id: 'security', label: 'Access & security', icon: ShieldCheck }
];
function Workspace({ dark, toggleTheme }: { dark: boolean; toggleTheme: () => void }) {
  const initial = window.location.pathname.slice(1);
  const [tab, setTab] = useState(tabs.some(t => t.id === initial) ? initial : 'dashboard');
  const [owner, setOwner] = useState<Owner | null>(null);
  const [error, setError] = useState('');
  const search = '';
  function navigate(id: string) { setTab(id); history.pushState(null, '', id === 'dashboard' ? '/' : `/${id}`); }
  useEffect(() => {
    api<Owner>('/api/auth/me').then(setOwner).catch(() => window.location.assign('/login'));
    const pop = () => setTab(window.location.pathname.slice(1) || 'dashboard');
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  async function logout() {
    try { await post('/api/auth/logout', {}); window.location.assign('/login'); } catch (error) { setError((error as Error).message); }
  }
  return <div className="workspace">
    <aside className="sidebar glass"><Brand compact /><div className="workspace-label">YOUR WORKSPACE</div><nav aria-label="Main navigation">{primaryTabs.map(item => <button key={item.id} onClick={() => navigate(item.id)} className={`nav-item ${tab === item.id ? 'selected' : ''}`} aria-current={tab === item.id ? 'page' : undefined}><item.icon size={19} />{item.label}{tab === item.id && <span className="nav-dot" />}</button>)}<details className="sidebar-more"><summary>More tools</summary><div className="more-menu">{moreTabs.map(item => <button key={item.id} onClick={() => navigate(item.id)} className={`nav-item ${tab === item.id ? 'selected' : ''}`}><item.icon size={19} />{item.label}</button>)}</div></details></nav>
      <div className="sidebar-bottom"><div className="sidebar-connection">Shared website catalog · Review preview</div>
      <div className="owner"><span className="avatar">BO</span><div><strong>Store owner</strong><small>{owner ? 'PIN session' : 'Verifying session…'}</small></div><button className="icon-button" onClick={logout} aria-label="Sign out"><LogOut size={17} /></button></div></div>
    </aside>
    <div className="main-area"><header className="topbar"><div className="breadcrumbs">Workspace <ChevronRight size={14} /><strong>{tabs.find(t => t.id === tab)?.label || 'Dashboard'}</strong></div><div className="top-actions"><button onClick={toggleTheme} className="icon-button theme-button" aria-label={dark ? 'Use light theme' : 'Use dark theme'}>{dark ? <Sun size={19} /> : <Moon size={19} />}</button><button onClick={() => void logout()} className="icon-button theme-button top-logout" aria-label="Sign out"><LogOut size={18} /></button></div></header>
    <main className="content" id="main-content">{error && <div className="error-banner" role="alert">{error}<button onClick={() => setError('')}>Dismiss</button></div>}
      {tab === 'dashboard' && <Dashboard navigate={navigate} />}
      {tab === 'mapping' && <><PageTitle eyebrow="ONE DATABASE" title="Your data, mapped." description="The existing website stays the source of truth. These are the inspected connections and proposed extensions." /><div className="notice"><Database size={18} />Read-only live schema sample verified on 30 October 2026. Some legacy documents may contain additional fields.</div><div className="mapping-grid">{mapping.filter(row => `${row.label} ${row.source} ${row.fields} ${row.plan}`.toLowerCase().includes(search.toLowerCase())).map((row, i) => <article className="mapping-card glass" key={row.label}><div className="mapping-card-top"><span className="row-number">0{i + 1}</span><span className="source-tag">Existing source</span></div><h2>{row.label}</h2><code>{row.source}</code><p className="field-list">{row.fields}</p><p>{row.plan}</p></article>)}</div>{mapping.filter(row => JSON.stringify(row).toLowerCase().includes(search.toLowerCase())).length === 0 && <div className="empty-state">No matching fields. Try “stock”, “phone” or “price”.</div>}<div className="notice"><FileText size={18} />Full mapping, schema proposal and rollback instructions are in the project’s docs folder.</div></>}
      {tab === 'delivery' && <><PageTitle eyebrow="SEVEN-PHASE DELIVERY" title="What is built and what remains." description="These labels describe the current local implementation. They do not imply a production rollout." /><div className="glass phase-list">{phases.map(phase => <article key={phase.number} className="phase-row"><span className={`phase-number ${phase.state === 'local' ? 'active' : ''}`}>{phase.state === 'local' ? <Check size={22} /> : `0${phase.number}`}</span><div><h2>{phase.name}</h2><p><strong>Built:</strong> {phase.built}</p><p><strong>Remaining:</strong> {phase.remaining}</p></div><span className={`pill phase-pill ${phase.state}`}>{phase.label}</span></article>)}</div><div className="notice"><CircleDot size={18} />Website checkout integration is coded locally. Stock reservations and live business writes stay off until the shared stock-writer cutover passes staging tests.</div></>}
      {tab === 'security' && <><PageTitle eyebrow="PRIVATE BY DESIGN" title="Your workspace. Your access." description="The foundation checks your PIN on the server and keeps privileged access out of the browser." /><div className="mapping-grid">{[
        ['PIN access', 'Enter the four-digit shop PIN. It is checked on the server and never included in the browser bundle.'],
        ['Protected sessions', 'Opaque HttpOnly, SameSite cookies with automatic expiry. Signing out revokes the session. Production requires HTTPS.'],
        ['Server-side credentials', 'The server reads the existing environment. Firebase service credentials, ImageKit secrets and Razorpay secrets are never sent to the browser.'],
        ['Safe rollout', 'Live business writes are locked by default. Schema migration defaults to a dry run. No production stock, products, orders or customers have been changed.']
      ].map(([title, detail]) => <article key={title} className="mapping-card glass"><ShieldCheck size={23} /><h2>{title}</h2><p>{detail}</p></article>)}</div><div className="notice"><LockKeyhole size={18} />Hosted PIN access requires production-domain protection before sign-in can be enabled.</div></>}
      {['products', 'pos', 'inventory', 'orders', 'customers', 'suppliers', 'reports', 'sync'].includes(tab) && <CommerceView tab={tab} />}
      <footer className="page-footer"><span>BROTHERS OUTFIT GALLERY <span className="footer-separator">/</span> STUDIO</span><span>A little more clarity. Every day.</span></footer>
    </main></div>
  </div>;
}
function PageTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="page-title"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div></div>;
}
