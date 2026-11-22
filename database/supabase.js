/**
 * Aashvi Hub - Supabase Cloud Database Client
 * Uses native fetch (Node 18+) against Supabase PostgREST API.
 */

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const isConfigured = () => Boolean(SUPABASE_URL && SUPABASE_KEY);

const SUBCAT_CAT_MAP = {
  1: { category_id: 1, category: 'Foods', subcategory: 'Jams' },
  2: { category_id: 1, category: 'Foods', subcategory: 'Biscuits' },
  3: { category_id: 1, category: 'Foods', subcategory: 'Namkeens' },
  4: { category_id: 1, category: 'Foods', subcategory: 'Handmade Chocolates' },
  5: { category_id: 2, category: 'Masale & Spices', subcategory: 'Chai Masala' },
  6: { category_id: 2, category: 'Masale & Spices', subcategory: 'Chaat Masala' },
  7: { category_id: 2, category: 'Masale & Spices', subcategory: 'Garam Masala' },
  8: { category_id: 2, category: 'Masale & Spices', subcategory: 'Sabzi & Curry Masale' },
  9: { category_id: 3, category: 'Clothes', subcategory: 'Men' },
  10: { category_id: 3, category: 'Clothes', subcategory: 'Women' },
  11: { category_id: 3, category: 'Clothes', subcategory: 'Boys' },
  12: { category_id: 3, category: 'Clothes', subcategory: 'Girls' },
  13: { category_id: 4, category: 'Electric Parts', subcategory: 'Cables & Chargers' },
  14: { category_id: 4, category: 'Electric Parts', subcategory: 'Switches & Sockets' },
  15: { category_id: 4, category: 'Electric Parts', subcategory: 'LED Lights & Bulbs' },
  16: { category_id: 4, category: 'Electric Parts', subcategory: 'Tools & Components' },
  17: { category_id: 5, category: 'Fresh Vegetables', subcategory: 'Daily Fresh Vegetables' },
  18: { category_id: 5, category: 'Fresh Vegetables', subcategory: 'Leafy Greens' },
  19: { category_id: 5, category: 'Fresh Vegetables', subcategory: 'Seasonal & Salad Veggies' }
};

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

  // Helper: Parse Size/Variant & Stock Matrix safely from existing product details
  parseProductVariants(p) {
    if (!p) return null;
    let variants = [];
    let colors = Array.isArray(p.colors) ? p.colors : [];
    let sizes = Array.isArray(p.sizes) ? p.sizes : [];
    let detailsText = p.details || '';
    let categoryId = p.category_id ? Number(p.category_id) : null;
    let subcategoryId = p.subcategory_id ? Number(p.subcategory_id) : (p.sub_category_id ? Number(p.sub_category_id) : null);
    let categoryName = p.category || '';
    let subcategoryName = p.subcategory || p.sub_category || '';

    if (typeof p.details === 'string' && p.details.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(p.details);
        if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.variants)) variants = parsed.variants;
          if (Array.isArray(parsed.colors) && !colors.length) colors = parsed.colors;
          if (Array.isArray(parsed.sizes) && !sizes.length) sizes = parsed.sizes;
          if (parsed.detailsText !== undefined) detailsText = parsed.detailsText;
          if (parsed.category_id !== undefined && !categoryId) categoryId = Number(parsed.category_id);
          if (parsed.subcategory_id !== undefined && !subcategoryId) subcategoryId = Number(parsed.subcategory_id);
          if (parsed.category !== undefined && !categoryName) categoryName = parsed.category;
          if (parsed.subcategory !== undefined && !subcategoryName) subcategoryName = parsed.subcategory;
        }
      } catch (e) {
        // Fallback to raw string
      }
    } else if (p.variants && Array.isArray(p.variants)) {
      variants = p.variants;
    }

    // Auto-map category from subcategory if missing
    if (subcategoryId && SUBCAT_CAT_MAP[subcategoryId]) {
      const mapInfo = SUBCAT_CAT_MAP[subcategoryId];
      if (!categoryId) categoryId = mapInfo.category_id;
      if (!categoryName) categoryName = mapInfo.category;
      if (!subcategoryName) subcategoryName = mapInfo.subcategory;
    }

    // Default variant if none explicitly defined
    if (!variants || variants.length === 0) {
      variants = [{
        size: p.unit || 'Standard',
        color: (colors && colors[0]) || 'Default',
        name: p.unit || 'Standard',
        stock: Math.max(0, Number(p.stock || 0)),
        price: Number(p.price || 0)
      }];
    }

    // Ensure valid variants with size, color, stock, and price
    variants = variants.map(v => {
      let vName = String(v.name || v.size || 'Standard').trim();
      let vSize = String(v.size || (vName.includes(' - ') ? vName.split(' - ')[0] : vName) || 'Standard').trim();
      let vColor = String(v.color || (vName.includes(' - ') ? vName.split(' - ')[1] : 'Default')).trim() || 'Default';
      let vStock = Math.max(0, parseInt(v.stock, 10) || 0);
      let vPrice = v.price !== undefined && !isNaN(Number(v.price)) && Number(v.price) > 0 ? Number(v.price) : Number(p.price || 0);
      return {
        size: vSize,
        color: vColor,
        name: vSize + (vColor.toLowerCase() !== 'default' ? ` - ${vColor}` : ''),
        stock: vStock,
        price: vPrice
      };
    });

    // Populate distinct sizes and colors
    if (!sizes.length) {
      sizes = [...new Set(variants.map(v => v.size).filter(Boolean))];
    }
    if (!colors.length) {
      colors = [...new Set(variants.map(v => v.color).filter(c => c && c.toLowerCase() !== 'default'))];
    }

    const totalStock = variants.reduce((sum, v) => sum + v.stock, 0);

    return {
      ...p,
      details: detailsText,
      category_id: categoryId,
      subcategory_id: subcategoryId,
      category: categoryName,
      subcategory: subcategoryName,
      colors,
      sizes,
      variants,
      stock: totalStock,
      available: Boolean(p.is_available && totalStock > 0),
      mrp: Number(p.mrp || p.price || 0),
      price: Number(p.price || 0)
    };
  },

  // Helper: Encode Variant Matrix & Category safely into existing details text field (zero SQL migration needed)
  encodeProductDetails(detailsText, variants, categoryId, colors, subcategoryId, categoryName, subcategoryName, sizes) {
    const cleanVariants = Array.isArray(variants) ? variants.map(v => {
      let vName = String(v.name || v.size || 'Standard').trim();
      let vSize = String(v.size || (vName.includes(' - ') ? vName.split(' - ')[0] : vName) || 'Standard').trim();
      let vColor = String(v.color || (vName.includes(' - ') ? vName.split(' - ')[1] : 'Default')).trim() || 'Default';
      return {
        size: vSize,
        color: vColor,
        name: vSize + (vColor.toLowerCase() !== 'default' ? ` - ${vColor}` : ''),
        price: v.price !== undefined && !isNaN(Number(v.price)) && Number(v.price) > 0 ? Number(v.price) : undefined,
        stock: Math.max(0, parseInt(v.stock, 10) || 0)
      };
    }).filter(v => v.size || v.name) : [];

    const cleanColors = Array.isArray(colors) ? colors.map(c => String(c).trim()).filter(Boolean) : [];
    const cleanSizes = Array.isArray(sizes) ? sizes.map(s => String(s).trim()).filter(Boolean) : [...new Set(cleanVariants.map(v => v.size))];

    return JSON.stringify({
      detailsText: String(detailsText || '').trim(),
      variants: cleanVariants,
      colors: cleanColors,
      sizes: cleanSizes,
      category_id: categoryId ? Number(categoryId) : null,
      subcategory_id: subcategoryId ? Number(subcategoryId) : null,
      category: categoryName || '',
      subcategory: subcategoryName || ''
    });
  },

  async getProducts({ cat, sub, q } = {}) {
    try {
      let query = '/products?select=*&is_available=eq.true&order=id.asc&limit=300';
      const rows = await sbFetch(query);
      if (!rows) return [];
      let list = rows.map(p => this.parseProductVariants(p));

      // Robust Subcategory & Category filtering
      if (sub) {
        const targetSub = String(sub).trim().toLowerCase();
        list = list.filter(p => {
          return String(p.subcategory_id) === String(sub) ||
                 String(p.sub_category_id) === String(sub) ||
                 (p.subcategory && String(p.subcategory).toLowerCase() === targetSub) ||
                 (p.sub_category && String(p.sub_category).toLowerCase() === targetSub);
        });
      } else if (cat) {
        const targetCat = String(cat).trim().toLowerCase();
        // Get all subcategory IDs for this category
        let allowedSubIds = [];
        try {
          const subs = await sbFetch(`/subcategories?select=id&category_id=eq.${encodeURIComponent(cat)}`);
          allowedSubIds = (subs || []).map(s => String(s.id));
        } catch (_) {}

        list = list.filter(p => {
          if (p.category_id && String(p.category_id) === String(cat)) return true;
          if (p.category && String(p.category).toLowerCase() === targetCat) return true;
          if (allowedSubIds.length && allowedSubIds.includes(String(p.subcategory_id))) return true;
          return false;
        });
      }

      if (q) {
        const term = String(q).trim().toLowerCase();
        list = list.filter(p =>
          (p.name && p.name.toLowerCase().includes(term)) ||
          (p.description && p.description.toLowerCase().includes(term)) ||
          (p.unit && p.unit.toLowerCase().includes(term)) ||
          (p.subcategory && p.subcategory.toLowerCase().includes(term))
        );
      }

      return list;
    } catch (e) {
      console.error('[Supabase] getProducts error:', e.message);
      return null;
    }
  },

  async getProductById(id) {
    const rows = await sbFetch(`/products?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
    return rows && rows[0] ? this.parseProductVariants(rows[0]) : null;
  },

  // Product CRUD in Supabase with Variant Support (Only sending valid table columns)
  async addProduct(prod) {
    const cleanVariants = Array.isArray(prod.variants) && prod.variants.length > 0
      ? prod.variants.map(v => {
          let vName = String(v.name || v.size || 'Standard').trim();
          let vSize = String(v.size || (vName.includes(' - ') ? vName.split(' - ')[0] : vName) || 'Standard').trim();
          let vColor = String(v.color || (vName.includes(' - ') ? vName.split(' - ')[1] : 'Default')).trim() || 'Default';
          return {
            size: vSize,
            color: vColor,
            name: vSize + (vColor.toLowerCase() !== 'default' ? ` - ${vColor}` : ''),
            price: v.price !== undefined ? Number(v.price) : undefined,
            stock: Math.max(0, parseInt(v.stock, 10) || 0)
          };
        })
      : [{
          size: prod.unit || 'Standard',
          color: (prod.colors && prod.colors[0]) || 'Default',
          name: prod.unit || 'Standard',
          stock: Math.max(0, parseInt(prod.stock, 10) || 50)
        }];

    const totalStock = cleanVariants.reduce((s, v) => s + v.stock, 0);
    const subId = Number(prod.subcategory_id) || (prod.category_id === 3 ? 10 : 1);
    const catId = Number(prod.category_id) || (SUBCAT_CAT_MAP[subId] ? SUBCAT_CAT_MAP[subId].category_id : null);
    const catName = prod.category || (SUBCAT_CAT_MAP[subId] ? SUBCAT_CAT_MAP[subId].category : '');
    const subName = prod.subcategory || (SUBCAT_CAT_MAP[subId] ? SUBCAT_CAT_MAP[subId].subcategory : '');

    const encodedDetails = this.encodeProductDetails(
      prod.details || prod.description,
      cleanVariants,
      catId,
      prod.colors,
      subId,
      catName,
      subName,
      prod.sizes
    );

    // Only send valid table columns that exist in public.products
    const body = {
      subcategory_id: subId,
      name: String(prod.name).trim(),
      description: String(prod.description || '').trim(),
      details: encodedDetails,
      image: String(prod.image || 'https://images.unsplash.com/photo-1549007994-cb92caebd54b?auto=format&fit=crop&w=500&q=80').trim(),
      mrp: Number(prod.mrp || prod.price),
      price: Number(prod.price),
      unit: String(prod.unit || '1 unit').trim(),
      stock: totalStock,
      is_available: totalStock > 0
    };

    const inserted = await sbFetch('/products', {
      method: 'POST',
      body
    });
    const res = Array.isArray(inserted) ? inserted[0] : inserted;
    return this.parseProductVariants(res || body);
  },

  async createProduct(prod) {
    return this.addProduct(prod);
  },

  async updateProduct(id, prod) {
    let encodedDetails = undefined;
    let totalStock = prod.stock !== undefined ? Number(prod.stock) : undefined;

    if (Array.isArray(prod.variants) || prod.colors !== undefined || prod.category_id !== undefined) {
      const cleanVariants = Array.isArray(prod.variants) ? prod.variants.map(v => {
        let vName = String(v.name || v.size || 'Standard').trim();
        let vSize = String(v.size || (vName.includes(' - ') ? vName.split(' - ')[0] : vName) || 'Standard').trim();
        let vColor = String(v.color || (vName.includes(' - ') ? vName.split(' - ')[1] : 'Default')).trim() || 'Default';
        return {
          size: vSize,
          color: vColor,
          name: vSize + (vColor.toLowerCase() !== 'default' ? ` - ${vColor}` : ''),
          price: v.price !== undefined ? Number(v.price) : undefined,
          stock: Math.max(0, parseInt(v.stock, 10) || 0)
        };
      }) : [];
      totalStock = cleanVariants.length ? cleanVariants.reduce((s, v) => s + v.stock, 0) : (prod.stock !== undefined ? Number(prod.stock) : 50);
      encodedDetails = this.encodeProductDetails(
        prod.details || prod.description,
        cleanVariants,
        prod.category_id,
        prod.colors,
        prod.subcategory_id,
        prod.category,
        prod.subcategory,
        prod.sizes
      );
    }

    // Only send valid table columns
    const body = {};
    if (prod.name) body.name = String(prod.name).trim();
    if (prod.subcategory_id) body.subcategory_id = Number(prod.subcategory_id);
    if (prod.price !== undefined) body.price = Number(prod.price);
    if (prod.mrp !== undefined) body.mrp = Number(prod.mrp);
    if (prod.unit) body.unit = String(prod.unit).trim();
    if (prod.image) body.image = String(prod.image).trim();
    if (prod.description !== undefined) body.description = String(prod.description).trim();
    if (encodedDetails !== undefined) body.details = encodedDetails;
    if (totalStock !== undefined) {
      body.stock = totalStock;
      body.is_available = totalStock > 0;
    }
    if (prod.is_available !== undefined) body.is_available = Boolean(prod.is_available);

    const updated = await sbFetch(`/products?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body
    });
    const res = Array.isArray(updated) ? updated[0] : updated;
    return this.parseProductVariants(res || { id, ...body });
  },

  async deleteProduct(id) {
    return sbFetch(`/products?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  },

  // Auto-Deduct Specific Variant Stock When Order is Placed
  async deductProductStock(productId, qty, variantName, colorName, sizeName) {
    try {
      const rawRows = await sbFetch(`/products?id=eq.${encodeURIComponent(productId)}&select=*&limit=1`);
      if (!rawRows || !rawRows[0]) return false;

      const prod = this.parseProductVariants(rawRows[0]);
      const quantityToDeduct = Math.max(1, parseInt(qty, 10) || 1);
      const targetVar = String(variantName || '').trim().toLowerCase();
      const targetColor = String(colorName || '').trim().toLowerCase();
      const targetSize = String(sizeName || '').trim().toLowerCase();

      // Find matching variant by exact size + color, or variant name, or first in stock
      let matched = prod.variants.find(v => {
        const vSize = String(v.size || (v.name ? v.name.split(' - ')[0] : '')).trim().toLowerCase();
        const vColor = String(v.color || (v.name && v.name.includes(' - ') ? v.name.split(' - ')[1] : 'default')).trim().toLowerCase();
        
        if (targetSize && targetColor && targetColor !== 'default') {
          return (vSize === targetSize || v.name.toLowerCase() === targetSize) && (vColor === targetColor || v.color.toLowerCase() === targetColor);
        }
        if (targetSize) {
          return vSize === targetSize || v.name.toLowerCase() === targetSize;
        }
        if (targetColor && targetColor !== 'default') {
          return vColor === targetColor || (v.name.toLowerCase().includes(targetColor));
        }
        return v.name.toLowerCase() === targetVar || vSize === targetVar;
      });

      if (!matched && prod.variants.length > 0) {
        matched = prod.variants.find(v => v.stock > 0) || prod.variants[0];
      }

      if (matched) {
        matched.stock = Math.max(0, matched.stock - quantityToDeduct);
      }

      const newTotalStock = prod.variants.reduce((s, v) => s + v.stock, 0);
      const newDetails = this.encodeProductDetails(
        prod.details,
        prod.variants,
        prod.category_id,
        prod.colors,
        prod.subcategory_id,
        prod.category,
        prod.subcategory,
        prod.sizes
      );

      await sbFetch(`/products?id=eq.${encodeURIComponent(productId)}`, {
        method: 'PATCH',
        body: {
          stock: newTotalStock,
          is_available: newTotalStock > 0,
          details: newDetails
        }
      });
      return true;
    } catch (e) {
      console.warn(`[Supabase] deductProductStock error for product #${productId}:`, e.message);
      return false;
    }
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

  async getAdminByUsername(username) {
    const rows = await sbFetch(`/admins?username=eq.${encodeURIComponent(username)}&select=*`);
    return rows && rows[0] ? rows[0] : null;
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
  },

  // ---------- Orders & Delivery PIN System ----------
  async createOrder({ customer, items, subtotal, discount, delivery_fee, total, coupon, method, etaText, deliveryPin }) {
    const pin = deliveryPin || String(Math.floor(1000 + Math.random() * 9000));
    const payMethod = String(method || 'COD').toUpperCase();
    const payStatus = payMethod === 'ONLINE' ? 'Paid' : 'Pending';

    const orderPayload = {
      customer_name: customer.name,
      phone: customer.phone,
      address: customer.address,
      pincode: customer.pincode,
      subtotal: Number(subtotal || 0),
      discount: Number(discount || 0),
      delivery_fee: Number(delivery_fee || 0),
      total: Number(total || 0),
      coupon: coupon || null,
      payment_method: payMethod,
      payment_status: payStatus,
      status: 'Placed',
      order_status: 'Placed',
      delivery_pin: pin,
      eta_text: etaText || '2-4 business days'
    };

    const insertedOrders = await sbFetch('/orders', {
      method: 'POST',
      body: orderPayload
    });

    const newOrder = Array.isArray(insertedOrders) ? insertedOrders[0] : insertedOrders;
    const orderId = newOrder?.id;

    if (orderId && Array.isArray(items) && items.length > 0) {
      const orderItemsPayload = items.map(it => {
        const varLabel = it.variant ? ` (${it.variant})` : '';
        return {
          order_id: orderId,
          product_id: it.id,
          name: (it.name || `Product #${it.id}`) + varLabel,
          price: Number(it.price || 0),
          qty: Number(it.qty || 1)
        };
      });

      await sbFetch('/order_items', {
        method: 'POST',
        body: orderItemsPayload
      }).catch(e => console.warn('[Supabase] order_items insert warning:', e.message));
    }

    return newOrder || { ...orderPayload, id: Date.now() };
  },

  async getOrders() {
    try {
      const [orders, items] = await Promise.all([
        sbFetch('/orders?select=*&order=id.desc&limit=100'),
        sbFetch('/order_items?select=*&order=id.asc')
      ]);
      return (orders || []).map(o => {
        const orderItems = (items || []).filter(i => String(i.order_id) === String(o.id));
        const itemsStr = orderItems.map(i => `${i.name} x${i.qty}`).join(', ');
        return {
          ...o,
          order_status: o.order_status || o.status || 'Placed',
          payment_status: o.payment_status || 'Pending',
          payment_method: o.payment_method || 'COD',
          items: itemsStr || 'Items ordered',
          itemsList: orderItems
        };
      });
    } catch (e) {
      console.error('[Supabase] getOrders error:', e.message);
      return [];
    }
  },

  async findOrdersByQuery(query) {
    try {
      const clean = String(query).trim();
      let filter = `or=(phone.ilike.*${encodeURIComponent(clean)}*,customer_name.ilike.*${encodeURIComponent(clean)}*)`;
      if (/^\d+$/.test(clean)) {
        filter = `or=(id.eq.${clean},phone.ilike.*${encodeURIComponent(clean)}*,customer_name.ilike.*${encodeURIComponent(clean)}*)`;
      }
      const [orders, items] = await Promise.all([
        sbFetch(`/orders?select=*&${filter}&order=id.desc&limit=20`),
        sbFetch('/order_items?select=*')
      ]);
      return (orders || []).map(o => {
        const orderItems = (items || []).filter(i => String(i.order_id) === String(o.id));
        return {
          ...o,
          order_status: o.order_status || o.status || 'Placed',
          payment_status: o.payment_status || 'Pending',
          payment_method: o.payment_method || 'COD',
          itemsList: orderItems
        };
      });
    } catch (e) {
      console.error('[Supabase] findOrdersByQuery error:', e.message);
      return [];
    }
  },

  async verifyDeliveryPin(id, pin) {
    try {
      const rows = await sbFetch(`/orders?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
      if (!rows || !rows[0]) return { success: false, error: 'Order not found' };
      const order = rows[0];
      const entered = String(pin || '').trim();
      if (!entered || String(order.delivery_pin).trim() !== entered) {
        return { success: false, error: 'Incorrect 4-digit Delivery PIN' };
      }
      const updated = await sbFetch(`/orders?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: {
          status: 'Delivered',
          order_status: 'Delivered',
          payment_status: 'Paid'
        }
      });
      return { success: true, order: Array.isArray(updated) ? updated[0] : order };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  async updateOrderStatus(id, status, paymentStatus) {
    try {
      const body = { status, order_status: status };
      if (paymentStatus) body.payment_status = paymentStatus;
      await sbFetch(`/orders?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body
      });
      return true;
    } catch (e) {
      console.error('[Supabase] updateOrderStatus error:', e.message);
      return false;
    }
  },

  // ---------- Offers Management ----------
  async getOffers() {
    try {
      const rows = await sbFetch('/offers?select=*&order=id.desc');
      return rows || [];
    } catch (e) {
      return [];
    }
  },

  async createOffer(offer) {
    return sbFetch('/offers', {
      method: 'POST',
      body: {
        code: String(offer.code || '').toUpperCase().trim(),
        description: String(offer.description || '').trim(),
        discount_percent: Number(offer.discount_percent || 0),
        min_order: Number(offer.min_order || 0),
        active: offer.active !== undefined ? Boolean(offer.active) : true
      }
    });
  },

  async deleteOffer(id) {
    return sbFetch(`/offers?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  },

  // ---------- Themes Management ----------
  async getThemes() {
    try {
      const rows = await sbFetch('/themes?select=*&order=id.asc');
      return rows || [];
    } catch (e) {
      return [];
    }
  },

  async setTheme(themeKey) {
    return this.setSetting('theme_mode', themeKey);
  }
};

module.exports = supabaseDb;
