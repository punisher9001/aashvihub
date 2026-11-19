/**
 * Aashvi Hub - Supabase Cloud Database Client
 * Uses native fetch (Node 18+) against Supabase PostgREST API.
 */

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/,'');
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const isConfigured = () => Boolean(SUPABASE_URL && SUPABASE_KEY);

async function sbFetch(path, options = {}) {
  if (!isConfigured()) {
    throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_KEY in .env');
  }
  const url = `${SUPABASE_URL}/rest/v1${path.startsWith('/') ? path : '/' + path}`;
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: options.prefer || 'return=representation',
    ...(options.headers || {})
  };
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!response.ok) {
    const errorText = await response.text();
    let parsed;
    try { parsed = JSON.parse(errorText); } catch { }
    const msg = parsed?.message || parsed?.hint || parsed?.details || errorText || `Supabase HTTP ${response.status}`;
    const err = new Error(msg);
    err.status = response.status;
    throw err;
  }
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

const supabaseDb = {
  isConfigured,

  async ping() {
    if (!isConfigured()) return false;
    try { await sbFetch('/settings?select=k&limit=1'); return true; }
    catch { return false; }
  },

  async getSettings() {
    try {
      const rows = await sbFetch('/settings?select=*');
      const s = {};
      for (const r of (rows || [])) s[r.k] = r.v;
      return s;
    } catch (e) {
      console.error('[Supabase] getSettings error:', e.message);
      return null;
    }
  },

  async setSetting(k, v) {
    return sbFetch('/settings', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: { k, v: String(v) }
    });
  },

  async getCatalog() {
    try {
      const [cats, subs] = await Promise.all([
        sbFetch('/categories?select=*&is_available=eq.true&order=sort_order.asc,id.asc'),
        sbFetch('/subcategories?select=*&is_available=eq.true&order=id.asc')
      ]);
      return (cats || []).map(c => ({ ...c, subs: (subs || []).filter(s => String(s.category_id) === String(c.id)) }));
    } catch (e) {
      console.error('[Supabase] getCatalog error:', e.message);
      return null;
    }
  },

  async getProducts({ cat, sub, q } = {}) {
    try {
      let query = '/products?select=*&is_available=eq.true';
      if (sub) {
        query += `&subcategory_id=eq.${encodeURIComponent(sub)}`;
      } else if (cat) {
        const subs = await sbFetch(`/subcategories?select=id&category_id=eq.${encodeURIComponent(cat)}`);
        const subIds = (subs || []).map(s => s.id);
        if (subIds.length > 0) query += `&subcategory_id=in.(${subIds.join(',')})`;
        else return [];
      }
      if (q) {
        const clean = encodeURIComponent(`*${q}*`);
        query += `&or=(name.ilike.${clean},description.ilike.${clean})`;
      }
      query += '&order=id.asc&limit=200';
      const rows = await sbFetch(query);
      return (rows || []).map(p => ({
        ...p,
        available: Boolean(p.is_available && p.stock > 0),
        mrp: Number(p.mrp),
        price: Number(p.price)
      }));
    } catch (e) {
      console.error('[Supabase] getProducts error:', e.message);
      return null;
    }
  },

  async getProductById(id) {
    const rows = await sbFetch(`/products?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
    return rows && rows[0] ? rows[0] : null;
  },

  async getCoupon(code) {
    const clean = encodeURIComponent(String(code).toUpperCase().trim());
    const rows = await sbFetch(`/offers?select=*&code=eq.${clean}&active=eq.true&limit=1`);
    return rows && rows[0] ? rows[0] : null;
  },

  async getDeliveryZone(key) {
    const rows = await sbFetch(`/delivery_zones?select=*&zone_key=eq.${encodeURIComponent(key)}&limit=1`);
    return rows && rows[0] ? rows[0] : null;
  },

  async getDeliveryZones() {
    return sbFetch('/delivery_zones?select=*&order=min_days.asc');
  },

  async updateDeliveryZone(key, data) {
    return sbFetch(`/delivery_zones?zone_key=eq.${encodeURIComponent(key)}`, {
      method: 'PATCH',
      body: data
    });
  },

  async getActiveTheme() {
    try {
      const s = await this.getSettings();
      if (s?.theme_mode && s.theme_mode !== 'auto') {
        const rows = await sbFetch(`/themes?select=*&theme_key=eq.${encodeURIComponent(s.theme_mode)}&limit=1`);
        if (rows && rows[0]) return rows[0];
      }
      const today = new Date().toISOString().slice(0, 10);
      const activeRows = await sbFetch(`/themes?select=*&start_date=lte.${today}&end_date=gte.${today}&limit=1`);
      if (activeRows && activeRows[0]) return activeRows[0];
      const defRows = await sbFetch(`/themes?select=*&theme_key=eq.default&limit=1`);
      return defRows && defRows[0] ? defRows[0] : { theme_key: 'default', name: 'Aashvi Hub' };
    } catch (e) {
      return { theme_key: 'default', name: 'Aashvi Hub' };
    }
  },

  // ---------- New helper: create admin ----------
  async createAdmin(username, passwordHash) {
    return sbFetch('/admins', {
      method: 'POST',
      body: { username, password_hash: passwordHash }
    });
  }
};

module.exports = supabaseDb;
