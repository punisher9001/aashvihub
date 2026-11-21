require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { localDb, checkMysqlConnection, getUseMysql, getMysqlPool } = require('./database/db');
const supabaseDb = require('./database/supabase');

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const RZP_KEY = process.env.RAZORPAY_KEY_ID || '';
const RZP_SECRET = process.env.RAZORPAY_KEY_SECRET || '';

const app = express();

// Built-in CORS handler (zero external dependency, 100% reliable)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper: safe async route wrapper
const wrap = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(err => {
    console.error('[API Error]', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });
};

// Unified Settings helper
async function getSettings() {
  if (supabaseDb.isConfigured()) {
    try {
      const s = await supabaseDb.getSettings();
      if (s && Object.keys(s).length) return s;
    } catch (e) {
      console.warn('Supabase getSettings failed, using local:', e.message);
    }
  }
  return localDb.getSettings();
}

// Unified Catalog helper
async function getCatalog() {
  if (supabaseDb.isConfigured()) {
    try {
      const cat = await supabaseDb.getCatalog();
      if (cat && cat.length) return cat;
    } catch (e) {
      console.warn('Supabase getCatalog failed, using local:', e.message);
    }
  }
  return localDb.getCatalog();
}

// Unified Products helper
async function getProducts(query = {}) {
  if (supabaseDb.isConfigured()) {
    try {
      const prods = await supabaseDb.getProducts(query);
      if (prods && prods.length) return prods;
    } catch (e) {
      console.warn('Supabase getProducts failed, using local:', e.message);
    }
  }
  return localDb.getProducts(query);
}

// ETA calculation
async function calculateEta(pin) {
  if (!/^[1-9]\d{5}$/.test(pin)) return null;
  const s = await getSettings();
  const origin = s.origin_pincode || '110001';
  let key = 'national';
  const remote = (s.remote_prefixes || '18,19,744,78,79').split(',').map(x => x.trim()).filter(Boolean);

  if (remote.some(p => pin.startsWith(p))) key = 'remote';
  else if (origin && pin.slice(0, 3) === origin.slice(0, 3)) key = 'local';
  else if (origin && pin[0] === origin[0]) key = 'regional';

  const z = await localDb.getDeliveryZone(key);
  return z ? { zone: key, label: z.label, min: z.min_days, max: z.max_days } : { zone: key, label: 'Standard Delivery', min: 2, max: 5 };
}

// ==========================================
// 1. PAGE ROUTES (Clean URLs)
// ==========================================

app.get(['/admin', '/admin.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get(['/explore', '/explore.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'explore.html'));
});

app.get(['/category', '/category.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'category.html'));
});

app.get(['/wishlist', '/wishlist.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'wishlist.html'));
});

// ==========================================
// 2. PUBLIC STORE APIS
// ==========================================

app.get('/api/config', wrap(async (req, res) => {
  const s = await getSettings();
  res.json({
    shop: s.shop_name || 'Aashvi Hub',
    owner_name: s.owner_name || 'Dr Mukul Kumar',
    owner_phone: s.owner_phone || '8988227729',
    owner_whatsapp: s.owner_whatsapp || '918988227729',
    owner_title: s.owner_title || 'Director',
    support_email: s.support_email || 'support@aashvihub.com',
    origin_pincode: s.origin_pincode || '110001',
    delivery_fee: Number(s.delivery_fee || 40),
    free_delivery_above: Number(s.free_delivery_above || 499),
    online_payment: !!(RZP_KEY && RZP_SECRET),
    razorpay_key: RZP_KEY,
    database_mode: supabaseDb.isConfigured() ? 'supabase' : 'local'
  });
}));

app.get('/api/theme', wrap(async (req, res) => {
  const theme = await localDb.getActiveTheme();
  res.json({ key: theme.theme_key || 'default', name: theme.name || 'Aashvi Hub' });
}));

app.get('/api/catalog', wrap(async (req, res) => {
  const catalog = await getCatalog();
  res.json(catalog || []);
}));

app.get('/api/categories', wrap(async (req, res) => {
  const catalog = await getCatalog();
  res.json(catalog || []);
}));

app.get('/api/categories/:id', wrap(async (req, res) => {
  const catalog = await getCatalog();
  const cat = (catalog || []).find(c => String(c.id) === String(req.params.id));
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  res.json(cat);
}));

app.get('/api/products', wrap(async (req, res) => {
  const products = await getProducts(req.query);
  res.json(products || []);
}));

app.get('/api/products/:id', wrap(async (req, res) => {
  const p = await localDb.getProductById(req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  res.json(p);
}));

app.get('/api/delivery/:pin', wrap(async (req, res) => {
  const eta = await calculateEta(req.params.pin);
  if (!eta) return res.status(400).json({ error: 'Invalid 6-digit pincode' });
  res.json(eta);
}));

app.post('/api/coupon', wrap(async (req, res) => {
  const code = String(req.body.code || '').toUpperCase().trim();
  const coupon = await localDb.getCoupon(code);
  if (!coupon) return res.status(404).json({ error: 'Invalid or expired coupon code' });
  res.json({
    code: coupon.code,
    description: coupon.description,
    discount_percent: Number(coupon.discount_percent || 0),
    min_order: Number(coupon.min_order || 0)
  });
}));

app.post('/api/orders', wrap(async (req, res) => {
  const { customer, items, subtotal, discount, delivery_fee, total, coupon, method, etaText } = req.body;
  if (!customer?.name || !customer?.phone || !customer?.address || !customer?.pincode) {
    return res.status(400).json({ error: 'Please fill in all customer details (name, phone, address, pincode)' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Your cart is empty' });
  }

  const deliveryPin = String(Math.floor(1000 + Math.random() * 9000));
  const payMethod = String(method || 'COD').toUpperCase();
  const payStatus = payMethod === 'ONLINE' ? 'Paid' : 'Pending';

  let order = null;
  if (supabaseDb.isConfigured()) {
    try {
      order = await supabaseDb.createOrder({
        customer,
        items,
        subtotal: Number(subtotal || 0),
        discount: Number(discount || 0),
        delivery_fee: Number(delivery_fee || 0),
        total: Number(total || 0),
        coupon: coupon || null,
        method: payMethod,
        etaText: etaText || '2-4 business days',
        deliveryPin
      });
    } catch (e) {
      console.warn('[Supabase] createOrder error, falling back to localDb:', e.message);
    }
  }

  // Also save to localDb for redundancy & instant access
  const localOrder = await localDb.createOrder({
    customer,
    items,
    subtotal: Number(subtotal || 0),
    discount: Number(discount || 0),
    delivery_fee: Number(delivery_fee || 0),
    total: Number(total || 0),
    coupon: coupon || null,
    method: payMethod,
    etaText: etaText || '2-4 business days',
    razorpayOrderId: null,
    deliveryPin
  });

  const finalOrder = order || localOrder;
  finalOrder.delivery_pin = deliveryPin;
  finalOrder.order_status = 'Placed';
  finalOrder.payment_status = payStatus;
  finalOrder.payment_method = payMethod;

  
    // Auto-deduct stock for specific variants across products
    if (Array.isArray(items)) {
      for (const item of items) {
        const pId = item.id;
        const qty = Number(item.qty || 1);
        const varName = item.variant || item.unit || 'Standard';
        if (supabaseDb.isConfigured()) {
          supabaseDb.deductProductStock(pId, qty, varName).catch(e => console.warn('Supabase stock deduction warn:', e.message));
        }
        try {
          localDb.deductProductStock(pId, qty, varName);
        } catch (e) {
          console.warn('LocalDB stock deduction warn:', e.message);
        }
      }
    }

  res.json({ success: true, order: finalOrder });
}));

app.get('/api/track/:q', wrap(async (req, res) => {
  let results = [];
  if (supabaseDb.isConfigured()) {
    try {
      results = await supabaseDb.findOrdersByQuery(req.params.q);
    } catch (e) {
      console.warn('[Supabase] track error, using localDb:', e.message);
    }
  }
  if (!results || results.length === 0) {
    results = await localDb.findOrdersByQuery(req.params.q);
  }
  res.json(results || []);
}));

// ==========================================
// 3. ADMIN AUTHENTICATION & MANAGEMENT
// ==========================================

// Admin Login
app.post('/api/admin/login', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  const u = String(username || '').trim();
  const p = String(password || '');

  if (!u || !p) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  let authenticated = false;
  let adminObj = null;

  // 1. Check default credentials from env or fallback
  if (u.toLowerCase() === ADMIN_USER.toLowerCase() && p === ADMIN_PASSWORD) {
    authenticated = true;
    adminObj = { id: 1, username: ADMIN_USER, name: 'Admin' };
  }

  // 2. Check local database
  if (!authenticated) {
    const localAdmin = await localDb.getAdminByUsername(u);
    if (localAdmin) {
      let isMatch = false;
      try {
        isMatch = bcrypt.compareSync(p, localAdmin.password_hash);
      } catch (e) {
        isMatch = localAdmin.password_hash === p;
      }
      if (isMatch) {
        authenticated = true;
        adminObj = { id: localAdmin.id, username: localAdmin.username, name: localAdmin.name || 'Admin' };
      }
    }
  }

  // 3. Check Supabase if configured
  if (!authenticated && supabaseDb.isConfigured()) {
    try {
      const sbAdmin = await supabaseDb.getAdminByUsername(u);
      if (sbAdmin) {
        let isMatch = false;
        try {
          isMatch = bcrypt.compareSync(p, sbAdmin.password_hash);
        } catch (e) {
          isMatch = sbAdmin.password_hash === p;
        }
        if (isMatch) {
          authenticated = true;
          adminObj = { id: sbAdmin.id, username: sbAdmin.username, name: sbAdmin.name || 'Admin' };
        }
      }
    } catch (e) {
      console.warn('Supabase admin check error:', e.message);
    }
  }

  if (!authenticated) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = jwt.sign({ id: adminObj.id, username: adminObj.username, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
  res.json({
    success: true,
    message: 'Login successful',
    token,
    admin: adminObj
  });
}));

// Admin Signup
app.post('/api/admin/signup', wrap(async (req, res) => {
  const { username, password, name, phone } = req.body || {};
  const u = String(username || '').trim();
  const p = String(password || '');

  if (!u || !p) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const existing = await localDb.getAdminByUsername(u);
  if (existing) {
    return res.status(400).json({ error: 'Username is already registered' });
  }

  const hash = bcrypt.hashSync(p, 10);
  const nextId = (localDb.data.admins.reduce((max, a) => Math.max(max, a.id || 0), 0)) + 1;
  const newAdmin = { id: nextId, username: u, password_hash: hash, name: name || u, phone: phone || '' };
  localDb.data.admins.push(newAdmin);
  localDb.save();

  if (supabaseDb.isConfigured()) {
    try { await supabaseDb.createAdmin(u, hash); } catch (e) { }
  }

  const token = jwt.sign({ id: newAdmin.id, username: newAdmin.username, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ success: true, message: 'Admin account created successfully', token, admin: { id: newAdmin.id, username: newAdmin.username } });
}));

// Admin Token Verification Middleware
function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Authorization header required' });
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }
}

// Current Admin Info
app.get('/api/admin/me', requireAdmin, wrap(async (req, res) => {
  res.json({ admin: req.admin });
}));

// Admin Orders
app.get('/api/admin/orders', requireAdmin, wrap(async (req, res) => {
  let orders = [];
  if (supabaseDb.isConfigured()) {
    try {
      orders = await supabaseDb.getOrders();
    } catch (e) {
      console.warn('[Supabase] getOrders error, using localDb:', e.message);
    }
  }
  if (!orders || orders.length === 0) {
    orders = await localDb.getTable('orders');
  }
  res.json(orders || []);
}));

// Admin Update Order Status
app.patch('/api/admin/orders/:id', requireAdmin, wrap(async (req, res) => {
  const { status, order_status, payment_status } = req.body;
  const newStatus = order_status || status;
  const orderId = Number(req.params.id);

  if (supabaseDb.isConfigured()) {
    try {
      await supabaseDb.updateOrderStatus(orderId, newStatus, payment_status);
    } catch (e) {
      console.warn('[Supabase] updateOrderStatus warning:', e.message);
    }
  }

  const order = localDb.data.orders.find(o => o.id === orderId);
  if (order) {
    if (newStatus) {
      order.status = newStatus;
      order.order_status = newStatus;
    }
    if (payment_status) order.payment_status = payment_status;
    localDb.save();
  }

  res.json({ success: true, order: order || { id: orderId, status: newStatus, payment_status } });
}));

// Admin Verify Delivery PIN
app.post('/api/admin/orders/:id/verify-pin', requireAdmin, wrap(async (req, res) => {
  const { pin } = req.body;
  const orderId = Number(req.params.id);
  const enteredPin = String(pin || '').trim();

  if (!enteredPin || enteredPin.length !== 4) {
    return res.status(400).json({ error: 'Please enter a valid 4-digit Delivery PIN' });
  }

  let verified = false;
  let orderData = null;

  // Check Supabase if configured
  if (supabaseDb.isConfigured()) {
    try {
      const sbResult = await supabaseDb.verifyDeliveryPin(orderId, enteredPin);
      if (sbResult.success) {
        verified = true;
        orderData = sbResult.order;
      }
    } catch (e) {
      console.warn('[Supabase] verifyDeliveryPin error, checking localDb:', e.message);
    }
  }

  // Check / sync with localDb
  const localOrder = localDb.data.orders.find(o => o.id === orderId);
  if (localOrder) {
    if (String(localOrder.delivery_pin).trim() === enteredPin) {
      localOrder.status = 'Delivered';
      localOrder.order_status = 'Delivered';
      localOrder.payment_status = 'Paid';
      localDb.save();
      verified = true;
      orderData = localOrder;
    }
  }

  if (!verified) {
    return res.status(400).json({ error: 'Incorrect Delivery PIN! Please enter the 4-digit PIN provided by the customer.' });
  }

  res.json({
    success: true,
    message: '✓ Delivery PIN verified! Order marked as Delivered and Payment marked as Paid.',
    order: orderData
  });
}));

// Admin Offers & Coupons CRUD
app.get('/api/admin/offers', requireAdmin, wrap(async (req, res) => {
  let offers = [];
  if (supabaseDb.isConfigured()) {
    try { offers = await supabaseDb.getOffers(); } catch (e) {}
  }
  if (!offers || offers.length === 0) {
    offers = await localDb.getOffers();
  }
  res.json(offers || []);
}));

app.post('/api/admin/offers', requireAdmin, wrap(async (req, res) => {
  const { code, description, discount_percent, min_order } = req.body;
  if (!code || !discount_percent) {
    return res.status(400).json({ error: 'Coupon code and discount percent are required' });
  }

  const newOffer = {
    code: String(code).toUpperCase().trim(),
    description: String(description || '').trim(),
    discount_percent: Number(discount_percent),
    min_order: Number(min_order || 0),
    active: 1
  };

  if (supabaseDb.isConfigured()) {
    try { await supabaseDb.createOffer(newOffer); } catch (e) {}
  }
  const saved = await localDb.createOffer(newOffer);

  res.json({ success: true, offer: saved });
}));

app.delete('/api/admin/offers/:id', requireAdmin, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (supabaseDb.isConfigured()) {
    try { await supabaseDb.deleteOffer(id); } catch (e) {}
  }
  await localDb.deleteOffer(id);
  res.json({ success: true, message: 'Offer deleted successfully' });
}));

// Admin Themes Management
app.get('/api/admin/themes', requireAdmin, wrap(async (req, res) => {
  const s = await getSettings();
  const currentTheme = s.theme_mode || 'default';
  const themes = [
    { key: 'default', name: 'Default Store Theme', desc: 'Clean, modern standard storefront', icon: '🛍️' },
    { key: 'diwali', name: 'Diwali Festive Grand Sale', desc: 'Gold & festive lights theme with cracker effects', icon: '🪔' },
    { key: 'eid', name: 'Eid Mubarak Festival', desc: 'Crescent moon & festive stars theme', icon: '🌙' },
    { key: 'holi', name: 'Holi Colors Celebration', desc: 'Vibrant multi-color festive theme', icon: '🎨' },
    { key: 'navratri', name: 'Shubh Navratri Festival', desc: 'Pure traditional fasting & festive theme', icon: '🌸' },
    { key: 'christmas', name: 'Christmas & Year-End Sale', desc: 'Snow & holiday winter theme', icon: '🎄' },
    { key: 'independence', name: 'Independence Day Special', desc: 'Proudly Indian tricolor celebration', icon: '🇮🇳' },
    { key: 'newyear', name: 'Happy New Year 2027', desc: 'Confetti & fresh beginnings mega sale', icon: '✨' }
  ];

  res.json({ currentTheme, themes });
}));

app.post('/api/admin/theme', requireAdmin, wrap(async (req, res) => {
  const { theme_key } = req.body;
  if (!theme_key) return res.status(400).json({ error: 'theme_key is required' });

  await localDb.setSetting('theme_mode', theme_key);
  if (supabaseDb.isConfigured()) {
    try { await supabaseDb.setTheme(theme_key); } catch (e) {}
  }

  res.json({ success: true, message: `Theme switched to '${theme_key}'! Website updated in real-time.`, activeTheme: theme_key });
}));

// Admin Products CRUD
app.get('/api/admin/products', requireAdmin, wrap(async (req, res) => {
  res.json(localDb.data.products || []);
}));

app.post('/api/admin/products', requireAdmin, wrap(async (req, res) => {
  const prodData = req.body;
  if (Array.isArray(req.body.variants)) prodData.variants = req.body.variants;
  if (req.body.category_id) prodData.category_id = Number(req.body.category_id);

  const { name, subcategory_id, price, mrp, stock, image, description, details } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'Product name and price are required' });

  const nextId = (localDb.data.products.reduce((max, p) => Math.max(max, p.id || 0), 0)) + 1;
  const newProduct = {
    id: nextId,
    subcategory_id: Number(subcategory_id) || 1,
    name: String(name).trim(),
    description: String(description || '').trim(),
    details: String(details || '').trim(),
    image: String(image || 'https://images.unsplash.com/photo-1549007994-cb92caebd54b?auto=format&fit=crop&w=500&q=80').trim(),
    mrp: Number(mrp || price),
    price: Number(price),
    unit: req.body.unit || '1 unit',
    stock: Number(stock ?? 50),
    is_available: 1
  };
  localDb.data.products.unshift(newProduct);
  localDb.save();

  res.json({ success: true, product: newProduct });
}));

app.put('/api/admin/products/:id', requireAdmin, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const p = localDb.data.products.find(x => x.id === id);
  if (!p) return res.status(404).json({ error: 'Product not found' });

  Object.assign(p, {
    name: req.body.name ? String(req.body.name).trim() : p.name,
    price: req.body.price !== undefined ? Number(req.body.price) : p.price,
    mrp: req.body.mrp !== undefined ? Number(req.body.mrp) : p.mrp,
    stock: req.body.stock !== undefined ? Number(req.body.stock) : p.stock,
    is_available: req.body.is_available !== undefined ? (req.body.is_available ? 1 : 0) : p.is_available,
    image: req.body.image !== undefined ? String(req.body.image).trim() : p.image,
    description: req.body.description !== undefined ? String(req.body.description).trim() : p.description
  });
  localDb.save();

  res.json({ success: true, product: p });
}));

app.delete('/api/admin/products/:id', requireAdmin, wrap(async (req, res) => {
  const id = Number(req.params.id);
  localDb.data.products = localDb.data.products.filter(x => x.id !== id);
  localDb.save();
  res.json({ success: true, message: 'Product deleted' });
}));

// Admin Categories CRUD
app.get('/api/admin/categories', requireAdmin, wrap(async (req, res) => {
  res.json(localDb.data.categories || []);
}));

app.post('/api/admin/categories', requireAdmin, wrap(async (req, res) => {
  const { name, icon } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name is required' });
  const nextId = (localDb.data.categories.reduce((max, c) => Math.max(max, c.id || 0), 0)) + 1;
  const newCat = {
    id: nextId,
    name: String(name).trim(),
    icon: icon || '🛍️',
    sort_order: nextId,
    is_available: 1
  };
  localDb.data.categories.push(newCat);
  localDb.save();
  res.json({ success: true, category: newCat });
}));

// Admin Settings
app.get('/api/admin/settings', requireAdmin, wrap(async (req, res) => {
  const s = await getSettings();
  res.json(s || {});
}));

app.post('/api/admin/settings', requireAdmin, wrap(async (req, res) => {
  const settingsObj = req.body;
  for (const [k, v] of Object.entries(settingsObj)) {
    await localDb.setSetting(k, v);
  }
  res.json({ success: true, message: 'Settings saved successfully' });
}));

// ==========================================
// 4. CUSTOMER AUTHENTICATION (For Storefront)
// ==========================================

app.post('/api/auth/signup', wrap(async (req, res) => {
  const { name, email, phone, password } = req.body || {};
  if (!phone || !password) return res.status(400).json({ error: 'Phone number and password are required' });

  if (!localDb.data.users) localDb.data.users = [];
  const exists = localDb.data.users.find(u => u.phone === phone);
  if (exists) return res.status(400).json({ error: 'An account with this phone already exists' });

  const hash = bcrypt.hashSync(password, 10);
  const nextId = (localDb.data.users.reduce((max, u) => Math.max(max, u.id || 0), 0)) + 1;
  const user = { id: nextId, name: name || 'Customer', email: email || '', phone, password_hash: hash };
  localDb.data.users.push(user);
  localDb.save();

  const token = jwt.sign({ id: user.id, name: user.name, phone: user.phone, role: 'customer' }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ success: true, token, user: { id: user.id, name: user.name, phone: user.phone, email: user.email } });
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const { phone, password } = req.body || {};
  if (!phone || !password) return res.status(400).json({ error: 'Phone and password are required' });

  if (!localDb.data.users) localDb.data.users = [];
  const user = localDb.data.users.find(u => u.phone === String(phone).trim() || u.email === String(phone).trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid phone or password' });
  }

  const token = jwt.sign({ id: user.id, name: user.name, phone: user.phone, role: 'customer' }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ success: true, token, user: { id: user.id, name: user.name, phone: user.phone, email: user.email } });
}));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`✓ Aashvi Hub Server running on http://localhost:${PORT}`);
  console.log(`✓ Admin Portal: http://localhost:${PORT}/admin`);
  await checkMysqlConnection();
});
