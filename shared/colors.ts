// Colour master shared by the POS and the website (D:\Brothers_Outfit\brothers\src\data\colorMaster.js).
// Names are stored in CAPITALS everywhere so "Black", "black" and "BLACK" never become different colours.
export type MasterColor = { name: string; hex: string; aliases: string[]; frequent?: boolean };

export const COLOR_MASTER: MasterColor[] = [
  { name: 'BLACK', hex: '#000000', aliases: ['jet black', 'pure black', 'matte black', 'noir', 'nero', 'dark black'], frequent: true },
  { name: 'WHITE', hex: '#FFFFFF', aliases: ['pure white', 'snow white', 'crisp white', 'bright white', 'milky white'], frequent: true },
  { name: 'NAVY BLUE', hex: '#1F2A44', aliases: ['navy', 'dark blue', 'midnight blue', 'deep navy', 'marine blue', 'ink blue'], frequent: true },
  { name: 'RANI', hex: '#C41242', aliases: ['rani pink', 'deep pink', 'fuchsia', 'fuchsia pink', 'magenta', 'hot pink', 'dark pink'], frequent: true },
  { name: 'MAROON', hex: '#800020', aliases: ['maron', 'dark red', 'deep red', 'blood red', 'crimson maroon', 'garnet'], frequent: true },
  { name: 'BEIGE', hex: '#D6C3A1', aliases: ['sand', 'nude', 'cream beige', 'wheat', 'biscuit', 'oatmeal'], frequent: true },
  { name: 'GREY', hex: '#6B7280', aliases: ['gray', 'slate', 'ash grey', 'silver grey', 'medium grey', 'steel grey'], frequent: true },
  { name: 'OLIVE', hex: '#556B2F', aliases: ['olive green', 'military green', 'army green', 'mehendi', 'mehndi', 'moss green'], frequent: true },
  { name: 'OFF WHITE', hex: '#FAF9F6', aliases: ['cream', 'ivory', 'milk white', 'eggshell', 'vanilla', 'pearl white'], frequent: true },
  { name: 'ROYAL BLUE', hex: '#1E40AF', aliases: ['blue', 'bright blue', 'cobalt blue', 'electric blue', 'classic blue'] },
  { name: 'SKY BLUE', hex: '#7DD3FC', aliases: ['light blue', 'powder blue', 'baby blue', 'ice blue', 'pastel blue'] },
  { name: 'WINE', hex: '#58111A', aliases: ['burgundy', 'dark wine', 'merlot', 'berry', 'deep burgundy'] },
  { name: 'BOTTLE GREEN', hex: '#09472A', aliases: ['dark green', 'emerald green', 'forest green', 'pine green', 'deep green'] },
  { name: 'SAGE GREEN', hex: '#9CAEA9', aliases: ['sage', 'mint green', 'pista', 'light green', 'seafoam', 'pastel green'] },
  { name: 'KHAKI', hex: '#C3B091', aliases: ['kaki', 'chino', 'tan khaki', 'safari'] },
  { name: 'TAN', hex: '#C19A6B', aliases: ['camel', 'caramel', 'light brown', 'cognac', 'leather tan'] },
  { name: 'BROWN', hex: '#5C4033', aliases: ['chocolate', 'dark brown', 'coffee', 'espresso', 'mocha'] },
  { name: 'CHARCOAL GREY', hex: '#374151', aliases: ['charcoal', 'dark grey', 'anthracite', 'graphite', 'gunmetal'] },
  { name: 'MUSTARD YELLOW', hex: '#D97706', aliases: ['mustard', 'haldi', 'ochre', 'dark yellow', 'golden yellow', 'yellow'] },
  { name: 'RUST', hex: '#B45309', aliases: ['terracotta', 'brick red', 'copper', 'burnt orange', 'earthen red'] },
  { name: 'PEACH', hex: '#F87171', aliases: ['coral', 'salmon', 'apricot', 'light coral'] },
  { name: 'LAVENDER', hex: '#A78BFA', aliases: ['lilac', 'light purple', 'mauve', 'pastel purple', 'violet light'] },
  { name: 'PURPLE', hex: '#6B21A8', aliases: ['violet', 'deep purple', 'jamuni', 'eggplant', 'plum'] },
  { name: 'TEAL', hex: '#0F766E', aliases: ['teal green', 'teal blue', 'turquoise', 'cyan', 'peacock blue'] },
  { name: 'RED', hex: '#DC2626', aliases: ['bright red', 'scarlet', 'ruby', 'cherry red'] },
  { name: 'PINK', hex: '#F472B6', aliases: ['light pink', 'baby pink', 'blush pink', 'rose pink'] },
  { name: 'ORANGE', hex: '#EA580C', aliases: ['tangerine', 'kesar', 'saffron', 'bright orange'] },
  { name: 'GOLD', hex: '#D4AF37', aliases: ['golden', 'metallic gold', 'zari gold', 'antique gold'] }
];

export const DEFAULT_COLOR_HEX = '#6B7280';

/** Stored form of a colour name: trimmed, single-spaced CAPITALS. "Standard"/"Default" stay as the no-colour marker. */
export function colorName(raw: unknown): string {
  const clean = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!clean) return '';
  if (/^(standard|default)$/i.test(clean)) return 'Standard';
  return clean.toUpperCase();
}

export const sameColor = (a: unknown, b: unknown) => colorName(a) === colorName(b);

/** Exact master colour by name (any case), or undefined for a custom colour. */
export const masterColor = (raw: unknown) => COLOR_MASTER.find(color => color.name === colorName(raw));

/** Swatch hex for a colour name: the master hex, else the fallback. */
export const colorHex = (raw: unknown, fallback = DEFAULT_COLOR_HEX) => masterColor(raw)?.hex || fallback;

/** Search by name or alias (e.g. "navy", "haldi", "rani pink"). */
export function searchColors(query: string, extra: MasterColor[] = []): MasterColor[] {
  const all = [...COLOR_MASTER, ...extra.filter(item => !masterColor(item.name))];
  const q = query.trim().toLowerCase();
  if (!q) return all;
  return all.filter(color => color.name.toLowerCase().includes(q) || color.aliases.some(alias => alias.includes(q) || q === alias));
}

/** Colour text in CAPITALS, leaving the "Standard"/"Default" markers exactly as they are. */
const capsOnly = (value: string) => /^\s*(standard|default)\s*$/i.test(value) ? value : value.trim().replace(/\s+/g, ' ').toUpperCase();

type Doc = Record<string, unknown>;
/**
 * Fields to update so a product's colours are in CAPITALS: variant `color`, the `colors` list,
 * `primaryColor` and image `color` tags. Nothing else (stock, names, SKUs, prices) is touched.
 * Returns null when the product already uses CAPITALS.
 */
export function capitalColorPatch(product: Doc): Doc | null {
  const patch: Doc = {};
  const fix = (value: unknown) => typeof value === 'string' && value && capsOnly(value) !== value ? capsOnly(value) : null;
  const objects = (list: unknown[], key: string) => {
    let changed = false;
    const next = list.map(item => {
      if (typeof item === 'string') { const caps = fix(item); if (caps) changed = true; return caps ?? item; }
      if (!item || typeof item !== 'object') return item;
      const caps = fix((item as Doc)[key]);
      if (!caps) return item;
      changed = true;
      return { ...(item as Doc), [key]: caps };
    });
    return changed ? next : null;
  };
  if (Array.isArray(product.variants)) {
    // Only object variants carry a colour; strings in a variant list are left alone.
    const next = objects(product.variants.map(v => typeof v === 'string' ? { __keep: v } : v), 'color');
    if (next) patch.variants = next.map(v => (v as Doc)?.__keep ?? v);
  }
  if (Array.isArray(product.colors)) { const next = objects(product.colors, 'name'); if (next) patch.colors = next; }
  if (Array.isArray(product.images)) {
    // Image entries that are plain URL strings have no colour tag.
    const next = objects(product.images.map(i => typeof i === 'string' ? { __keep: i } : i), 'color');
    if (next) patch.images = next.map(i => (i as Doc)?.__keep ?? i);
  }
  const primary = fix(product.primaryColor);
  if (primary) patch.primaryColor = primary;
  return Object.keys(patch).length ? patch : null;
}

/**
 * Website rule (normalizeToStandardColor): a name or alias picks the approved colour,
 * e.g. "navy" -> NAVY BLUE, "rani pink" -> RANI. Unknown names stay as typed, in CAPITALS.
 * Only whole-name aliases count, so a custom "DARK INDIGO BLUE" is never renamed.
 */
export function standardColor(raw: unknown): MasterColor | undefined {
  const lower = colorName(raw).toLowerCase();
  return COLOR_MASTER.find(color => color.name.toLowerCase() === lower) || COLOR_MASTER.find(color => color.aliases.includes(lower));
}
