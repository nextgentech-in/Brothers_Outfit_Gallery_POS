import { useMemo, useState } from 'react';
import { Check, Plus, Search, X } from 'lucide-react';
import { COLOR_MASTER, colorName, searchColors, standardColor, type MasterColor } from '../shared/colors';

// Same storage idea as the website admin: recent picks feed "Frequently used", custom colours are remembered.
const RECENT_KEY = 'brothers_pos_recent_colors', CUSTOM_KEY = 'brothers_pos_custom_colors';
const readList = <T,>(key: string): T[] => { try { const raw = localStorage.getItem(key); const list = raw ? JSON.parse(raw) : []; return Array.isArray(list) ? list : []; } catch { return []; } };
const writeList = (key: string, list: unknown[]) => { try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* storage unavailable */ } };
function customColors(): MasterColor[] {
  return readList<MasterColor>(CUSTOM_KEY).filter(c => c && typeof c.name === 'string' && /^#[0-9a-f]{6}$/i.test(c.hex)).map(c => ({ name: colorName(c.name), hex: c.hex.toUpperCase(), aliases: [] }));
}
function recordRecent(name: string) { writeList(RECENT_KEY, [name, ...readList<string>(RECENT_KEY).filter(item => item !== name)].slice(0, 8)); }
function frequentColors(all: MasterColor[]): MasterColor[] {
  const recent = readList<string>(RECENT_KEY).flatMap(name => all.filter(color => color.name === name));
  return [...recent, ...COLOR_MASTER.filter(color => color.frequent && !recent.some(r => r.name === color.name))].slice(0, 8);
}

export type PickedColor = { name: string; hex: string };

/** Swatch colour picker matching the website's Visual Color Selector. Names are always CAPITALS. */
export function ColorPicker({ selected, onChange }: { selected: PickedColor[]; onChange: (colors: PickedColor[]) => void }) {
  const [query, setQuery] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customHex, setCustomHex] = useState('#2563EB');
  const [customError, setCustomError] = useState('');
  const selectedNames = useMemo(() => new Set(selected.map(color => color.name)), [selected]);
  const [custom, setCustom] = useState<MasterColor[]>(customColors);
  const results = useMemo(() => searchColors(query, custom), [query, custom]);
  const frequent = useMemo(() => frequentColors([...COLOR_MASTER, ...custom]), [selected, custom]);

  function toggle(color: PickedColor) {
    const name = colorName(color.name);
    if (selectedNames.has(name)) onChange(selected.filter(item => item.name !== name));
    else { recordRecent(name); onChange([...selected, { name, hex: color.hex.toUpperCase() }]); }
  }
  function addCustom() {
    const name = colorName(customName);
    if (!name || name === 'Standard') { setCustomError('Enter a colour name.'); return; }
    if (!/^#[0-9a-f]{6}$/i.test(customHex)) { setCustomError('Enter a HEX code such as #C41242.'); return; }
    // Like the website: a standard name or alias selects that approved colour instead of a duplicate.
    const existing = standardColor(name) || custom.find(color => color.name === name);
    const picked = existing ? { name: existing.name, hex: existing.hex } : { name, hex: customHex.toUpperCase() };
    if (!existing) { const next = [...custom, { ...picked, aliases: [] }]; setCustom(next); writeList(CUSTOM_KEY, next); }
    if (!selectedNames.has(picked.name)) { recordRecent(picked.name); onChange([...selected, picked]); }
    setCustomName(''); setCustomError(''); setCustomOpen(false); setQuery('');
  }
  const swatch = (color: PickedColor, compact = false) => {
    const isOn = selectedNames.has(color.name);
    return <button key={color.name} type="button" className={`color-swatch${isOn ? ' selected' : ''}${compact ? ' compact' : ''}`} aria-pressed={isOn} title={`${color.name} (${color.hex})`} onClick={() => toggle(color)}>
      <span className="color-swatch-dot" style={{ background: color.hex }}>{isOn && <Check size={14} />}</span>
      <span className="color-swatch-name">{color.name}</span>
    </button>;
  };

  return <div className="color-picker">
    <div className="color-picker-selected" aria-label="Selected colours">
      <strong>Selected colours ({selected.length})</strong>
      {selected.length === 0 ? <span className="color-picker-hint">Click swatches below. The same colour names are used on the website.</span>
        : <div className="color-chip-row">{selected.map(color => <span className="color-chip" key={color.name}><span className="color-swatch-dot small" style={{ background: color.hex }} />{color.name}<button type="button" aria-label={`Remove ${color.name}`} onClick={() => toggle(color)}><X size={13} /></button></span>)}</div>}
    </div>
    <div className="color-picker-label">Frequently used</div>
    <div className="color-swatch-row">{frequent.map(color => swatch(color, true))}</div>
    <div className="color-picker-search">
      <label className="color-search-box"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search colour or alias (navy, rani pink, haldi…)" aria-label="Search colours" /></label>
      <button type="button" className="button secondary" onClick={() => { setCustomOpen(open => !open); setCustomName(query); }}><Plus size={15} />Custom colour</button>
    </div>
    {customOpen && <div className="color-custom-box">
      <label>Colour name<input value={customName} onChange={event => setCustomName(event.target.value.toUpperCase())} placeholder="PEACOCK GREEN" maxLength={80} autoFocus onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addCustom(); } }} /></label>
      <label>Swatch<span className="color-custom-hex"><input type="color" value={customHex} onChange={event => setCustomHex(event.target.value.toUpperCase())} /><input value={customHex} onChange={event => setCustomHex(event.target.value.toUpperCase())} maxLength={7} /></span></label>
      <button type="button" className="button primary" onClick={addCustom}>Add colour</button>
      {customError && <small className="color-custom-error">{customError}</small>}
    </div>}
    <div className="color-picker-label">{query ? `Search results (${results.length})` : 'All approved colours'}</div>
    {results.length === 0 ? <div className="color-picker-empty">No colour matches “{query}”. <button type="button" className="button secondary" onClick={() => { setCustomName(query.toUpperCase()); setCustomOpen(true); }}>Create “{query.toUpperCase()}”</button></div>
      : <div className="color-swatch-grid">{results.map(color => swatch(color))}</div>}
  </div>;
}
