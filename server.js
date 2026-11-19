require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const { localDb, checkMysqlConnection, getUseMysql, getMysqlPool } = require('./database/db');
const supabaseDb = require('./database/supabase');

const JWT_SECRET = process.env.JWT_SECRET || 'aashvi_hub_dr_mukul_kumar_secure_jwt_secret_2026';
const RZP_KEY = process.env.RAZORPAY_KEY_ID || '';
const RZP_SECRET = process.env.RAZORPAY_KEY_SECRET || '';

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const wrap = f => (req, res) => f(req, res).catch(e => {
  console.error(e);
  res.status(e.status || 500).json({ error: e.message || 'Internal server error' });
});
const fail = (status, message) => Object.assign(new Error(message), { status });
const money = n => Math.round(Number(n) * 100) / 100;

// ---------------- Multi-Store Unified Helpers ----------------

async function getSettings() {
  if (supabaseDb.isConfigured()) {
    const s = await supabaseDb.getSettings();
    if (s && Object.keys(s).length) return s;
  }
  if (getUseMysql() && getMysqlPool()) {
    try {
      const [rows] = await getMysqlPool().query('SELECT k, v FROM settings');
      return Object.fromEntries(rows.map(r => [r.k, r.v]));
    } catch (e) {
      console.warn('MySQL settings query failed, falling back:', e.message);
    }
  }
  return localDb.getSettings();
}

async function calculateEta(pin) {
  if (!/^[1-9]\d{5}$/.test(pin)) return null;
  const s = await getSettings();
  const origin = s.origin_pincode || '110001';
  let key = 'national';
  const remote = (s.remote_prefixes || '18,19,744,78,79').split(',').map(x => x.trim()).filter(Boolean);

  if (remote.some(p => pin.startsWith(p))) key = 'remote';
  else if (origin && pin.slice(0, 3) === origin.slice(0, 3)) key = 'local';
  else if (origin && pin[0] === origin[0]) key = 'regional';

  if (supabaseDb.isConfigured()) {
    try {
      const z = await supabaseDb.getDeliveryZone(key);
      if (z) return { zone: key, label: z.label, min: z.min_days, max: z.max_days };
    } catch {}
  }

  if (getUseMysql() && getMysqlPool()) {
    try {
      const [rows] = await getMysqlPool().query('SELECT * FROM delivery_zones WHERE zone_key = ?', [key]);
      if (rows && rows[0]) {
        const z = rows[0];
        return { zone: key, label: z.label, min: z.min_days, max: z.max_days };
      }
    } catch (e) {}
  }

  const z = await localDb.getDeliveryZone(key);
  return z ? { zone: key, label: z.label, min: z.min_days, max: z.max_days } : { zone: key, label: 'Standard Delivery', min: 2, max: 5 };
}

// ---------------- Public API Endpoints ----------------

// ---------- Admin Authentication Routes ----------
// Login endpoint – verifies admin credentials and returns JWT token
app.post('/api/admin/login', wrap(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) throw fail(400, 'Username and password required');

  // Try Supabase first, fallback to local .env credentials
  let adminRecord = null;
  if (supabaseDb.isConfigured()) {
    adminRecord = await supabaseDb.getAdminByUsername(username);
  }
  if (!adminRecord) {
    // fallback to .env static credentials
    if (process.env.ADMIN_USER === username) {
      adminRecord = { username, password_hash: await bcrypt.hash(process.env.ADMIN_PASSWORD, 10) };
    }
  }
  if (!adminRecord) throw fail(401, 'Invalid admin credentials');

  const match = await bcrypt.compare(password, adminRecord.password_hash);
  if (!match) throw fail(401, 'Invalid admin credentials');

  const token = jwt.sign({ sub: adminRecord.username, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
}));

// Middleware to protect admin routes
function adminAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'admin') throw new Error('Not admin');
    req.admin = payload;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Example protected admin route – fetch admin stats (placeholder)
app.get('/api/admin/stats', adminAuth, wrap(async (req, res) => {
  // For now just return a static object; replace with real stats as needed
  res.json({
    totalUsers: 0,
    totalOrders: 0,
    totalRevenue: 0
  });
}));

// ---------------------------------------------------

app.get('/api/config', wrap(async (req, res) => {
  const s = await getSettings();
  res.json({
    shop: s.shop_name || 'Aashvi Hub',
    owner_name: s.owner_name || 'Dr Mukul Kumar',
    owner_phone: s.owner_phone || '8988227729',
    owner_whatsapp: s.owner_whatsapp || '918988227729',
    owner_title: s.owner_title || 'Founder & Director',
    support_email: s.support_email || 'support@aashvihub.com',
    origin_pincode: s.origin_pincode || '110001',
    delivery_fee: Number(s.delivery_fee || 40),
    free_delivery_above: Number(s.free_delivery_above || 499),
    online_payment: !!(RZP_KEY && RZP_SECRET),
    razorpay_key: RZP_KEY,
    database_mode: supabaseDb.isConfigured() ? 'supabase' : (getUseMysql() ? 'mysql' : 'local')
  });
}));

app.get('/api/contact', wrap(async (req, res) => {
  const s = await getSettings();
  res.json({
    shop: s.shop_name || 'Aashvi Hub',
    owner: s.owner_name || 'Dr Mukul Kumar',
    phone: s.owner_phone || '8988227729',
    whatsapp: s.owner_whatsapp || '918988227729',
    email: s.support_email || 'support@aashvihub.com',
    address: s.shop_address || 'Aashvi Hub Central Store, New Delhi - 110001',
    hours: 'Mon - Sat: 9:00 AM – 9:00 PM | Sun: 10:00 AM – 6:00 PM',
    message: 'For order inquiries, bulk purchases, or expert guidance, connect directly with Dr Mukul Kumar.'
  });
}));

app.get('/api/theme', wrap(async (req, res) => {
  if (supabaseDb.isConfigured()) {
    try {
      const theme = await supabaseDb.getActiveTheme();
      if (theme) return res.json({ key: theme.theme_key || 'default', name: theme.name || 'Aashvi Hub' });
    } catch {}
  }

  const s = await getSettings();
  if (getUseMysql() && getMysqlPool()) {
    try {
      let key = 'default';
      if (s.theme_mode && s.theme_mode !== 'auto') key = s.theme_mode;
      else {
        const [rows] = await getMysqlPool().query(
          'SELECT theme_key FROM themes WHERE start_date <= CURDATE() AND end_date >= CURDATE() ORDER BY start_date DESC LIMIT 1'
        );
        if (rows && rows[0]) key = rows[0].theme_key;
      }
      const [tRows] = await getMysqlPool().query('SELECT theme_key, name FROM themes WHERE theme_key = ?', [key]);
      const t = tRows && tRows[0];
      return res.json({ key: t ? t.theme_key : 'default', name: t ? t.name : (s.shop_name || 'Aashvi Hub') });
    } catch (e) {}
  }

  const theme = await localDb.getActiveTheme();
  res.json({ key: theme.theme_key || 'default', name: theme.name || (s.shop_name || 'Aashvi Hub') });
}));

app.get('/api/catalog', wrap(async (req, res) => {
  if (supabaseDb.isConfigured()) {
    try {
      const cat = await supabaseDb.getCatalog();
      if (cat && cat.length) return res.json(cat);
    } catch {}
  }

  if (getUseMysql() && getMysqlPool()) {
    try {
      const [cats] = await getMysqlPool().query('SELECT id, name, icon FROM categories WHERE is_available = 1 ORDER BY sort_order, id');
      const [subs] = await getMysqlPool().query('SELECT id, category_id, name, image FROM subcategories WHERE is_available = 1 ORDER BY id');
      return res.json(cats.map(c => ({ ...c, subs: subs.filter(s => s.category_id === c.id) })));
    } catch (e) {}
  }

  const catalog = await localDb.getCatalog();
  res.json(catalog);
}));

app.get('/api/products', wrap(async (req, res) => {
  if (supabaseDb.isConfigured()) {
    try {
      const prods = await supabaseDb.getProducts(req.query);
      if (prods && prods.length) return res.json(prods);
    } catch {}
  }

  if (getUseMysql() && getMysqlPool()) {
    try {
      const where = ['s.is_available = 1', 'c.is_available = 1'];
      const params = [];
      if (req.query.sub) { where.push('p.subcategory_id = ?'); params.push(Number(req.query.sub)); }
      else if (req.query.cat) { where.push('s.category_id = ?'); params.push(Number(req.query.cat)); }
      if (req.query.q) { where.push('(p.name LIKE ? OR p.description LIKE ?)'); params.push('%' + req.query.q + '%', '%' + req.query.q + '%'); }

      const [rows] = await getMysqlPool().query(
        `SELECT p.id, p.subcategory_id, p.name, p.description, p.details, p.image, p.mrp, p.price, p.unit, p.stock,
                (p.is_available = 1 AND p.stock > 0) AS available
         FROM products p JOIN subcategories s ON s.id = p.subcategory_id JOIN categories c ON c.id = s.category_id
         WHERE ${where.join(' AND ')} ORDER BY p.id LIMIT 200`, params);
      return res.json(rows.map(r => ({ ...r, available: !!r.available, mrp: Number(r.mrp), price: Number(r.price) })));
    } catch (e) {}
  }

  const products = await localDb.getProducts(req.query);
  res.json(products);
}));

app.get('/api/delivery/:pin', wrap(async (req, res) => {
  const e = await calculateEta(req.params.pin);
  if (!e) throw fail(400, 'Invalid 6-digit pincode');
  res.json(e);
}));

app.post('/api/coupon', wrap(async (req, res) => {
  const code = String(req.body.code || '').toUpperCase().trim();

  if (supabaseDb.isConfigured()) {
    try {
      const o = await supabaseDb.getCoupon(code);
      if (o) return res.json({ percent: Number(o.discount_percent), min_order: Number(o.min_order), description: o.description });
    } catch {}
  }

  if (getUseMysql() && getMysqlPool()) {
    try {
      const [rows] = await getMysqlPool().query('SELECT * FROM offers WHERE code = ? AND active = 1', [code]);
      const o = rows && rows[0];
      if (!o) throw fail(404, 'Invalid coupon code');
      return res.json({ percent: Number(o.discount_percent), min_order: Number(o.min_order), description: o.description });
    } catch (e) {
      if (e.status) throw e;
    }
  }

  const o = await localDb.getCoupon(code);
  if (!o) throw fail(404, 'Invalid coupon code');
  res.json({ percent: Number(o.discount_percent), min_order: Number(o.min_order), description: o.description });
}));

app.post('/api/orders', wrap(async (req, res) => {
  const { items, customer = {}, coupon, method } = req.body;
  const name = String(customer.name || '').trim();
  const phone = String(customer.phone || '').trim();
  const address = String(customer.address || '').trim();
  const pin = String(customer.pincode || '').trim();

  if (!name || !/^\d{10}$/.test(phone) || !address) {
    throw fail(400, 'Valid full name, 10-digit mobile number, and delivery address are required');
  }
  if (!Array.isArray(items) || !items.length) {
    throw fail(400, 'Your shopping cart is empty');
  }
  if (!['online', 'cod'].includes(method)) {
    throw fail(400, 'Invalid payment method selected');
  }
  if (method === 'online' && !(RZP_KEY && RZP_SECRET)) {
    throw fail(503, 'Online payment gateway is in test mode. Please choose Cash on Delivery or contact Dr Mukul Kumar at 8988227729.');
  }

  const e = await calculateEta(pin);
  if (!e) throw fail(400, 'Invalid delivery pincode provided');

  const s = await getSettings();

  // 1. Supabase Path
  if (supabaseDb.isConfigured()) {
    try {
      let sub = 0;
      for (const it of items) {
        const qty = parseInt(it.qty, 10);
        if (!(qty > 0)) throw fail(400, 'Invalid quantity');
        const p = await supabaseDb.getProductById(it.id);
        if (!p || !p.is_available || p.stock < qty) {
          throw fail(409, `"${p ? p.name : it.id}" is currently not available in quantity ${qty}`);
        }
        sub += Number(p.price) * qty;
      }
      sub = money(sub);

      let discount = 0;
      let usedCoupon = null;
      if (coupon) {
        const o = await supabaseDb.getCoupon(coupon);
        if (o && sub >= Number(o.min_order)) {
          discount = money(sub * Number(o.discount_percent) / 100);
          usedCoupon = o.code;
        }
      }

      const freeAbove = Number(s.free_delivery_above || 499);
      const fee = freeAbove > 0 && (sub - discount) >= freeAbove ? 0 : Number(s.delivery_fee || 40);
      const total = money(sub - discount + fee);

      const createdOrder = await supabaseDb.createOrder({
        customer: { name, phone, address, pincode: pin },
        items,
        subtotal: sub,
        discount,
        delivery_fee: fee,
        total,
        coupon: usedCoupon,
        method,
        etaText: `${e.min}-${e.max} days`,
        razorpayOrderId: null
      });

      return res.json({
        order_id: createdOrder.id,
        total,
        eta: e,
        razorpay_order_id: null,
        amount: Math.round(total * 100)
      });
    } catch (err) {
      if (err.status) throw err;
      console.warn('[Supabase] Order creation failed, falling back to localDb:', err.message);
    }
  }

  // 2. MySQL Path
  if (getUseMysql() && getMysqlPool()) {
    const conn = await getMysqlPool().getConnection();
    try {
      await conn.beginTransaction();
      let sub = 0;
      const lines = [];
      for (const it of items) {
        const qty = parseInt(it.qty, 10);
        if (!(qty > 0)) throw fail(400, 'Invalid quantity');
        const [[p]] = await conn.query('SELECT * FROM products WHERE id = ? FOR UPDATE', [it.id]);
        if (!p || !p.is_available || p.stock < qty) throw fail(409, `"${p ? p.name : it.id}" is out of stock in requested quantity`);
        sub += Number(p.price) * qty;
        lines.push([p, qty]);
      }
      sub = money(sub);
      let discount = 0, usedCoupon = null;
      if (coupon) {
        const [[o]] = await conn.query('SELECT * FROM offers WHERE code = ? AND active = 1', [String(coupon).toUpperCase()]);
        if (o && sub >= Number(o.min_order)) {
          discount = money(sub * Number(o.discount_percent) / 100);
          usedCoupon = o.code;
        }
      }
      const freeAbove = Number(s.free_delivery_above || 499);
      const fee = freeAbove > 0 && (sub - discount) >= freeAbove ? 0 : Number(s.delivery_fee || 40);
      const total = money(sub - discount + fee);

      let rzp = null;
      if (method === 'online') {
        const r = await fetch('https://api.razorpay.com/v1/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(RZP_KEY + ':' + RZP_SECRET).toString('base64') },
          body: JSON.stringify({ amount: Math.round(total * 100), currency: 'INR', receipt: 'AH' + Date.now() })
        });
        rzp = await r.json();
        if (!r.ok) throw fail(502, 'Payment gateway error: ' + (rzp.error && rzp.error.description || r.status));
      }

      const [ins] = await conn.query('INSERT INTO orders SET ?', [{
        customer_name: name, phone, address, pincode: pin, subtotal: sub, discount, delivery_fee: fee, total,
        coupon: usedCoupon, payment_method: method, razorpay_order_id: rzp ? rzp.id : null,
        eta_text: `${e.min}-${e.max} days`
      }]);
      for (const [p, qty] of lines) {
        await conn.query('INSERT INTO order_items SET ?', [{ order_id: ins.insertId, product_id: p.id, name: p.name, price: p.price, qty }]);
        await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [qty, p.id]);
      }
      await conn.commit();
      return res.json({ order_id: ins.insertId, total, eta: e, razorpay_order_id: rzp ? rzp.id : null, amount: Math.round(total * 100) });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // 3. Local Embedded Storage (Saves immediately to database/local_store.json)
  let sub = 0;
  for (const it of items) {
    const qty = parseInt(it.qty, 10);
    if (!(qty > 0)) throw fail(400, 'Invalid quantity');
    const p = await localDb.getProductById(it.id);
    if (!p || !p.is_available || p.stock < qty) {
      throw fail(409, `"${p ? p.name : it.id}" is currently not available in quantity ${qty}`);
    }
    sub += Number(p.price) * qty;
  }
  sub = money(sub);

  let discount = 0;
  let usedCoupon = null;
  if (coupon) {
    const o = await localDb.getCoupon(coupon);
    if (o && sub >= Number(o.min_order)) {
      discount = money(sub * Number(o.discount_percent) / 100);
      usedCoupon = o.code;
    }
  }

  const freeAbove = Number(s.free_delivery_above || 499);
  const fee = freeAbove > 0 && (sub - discount) >= freeAbove ? 0 : Number(s.delivery_fee || 40);
  const total = money(sub - discount + fee);

  const newOrder = await localDb.createOrder({
    customer: { name, phone, address, pincode: pin },
    items,
    subtotal: sub,
    discount,
    delivery_fee: fee,
    total,
    coupon: usedCoupon,
    method,
    etaText: `${e.min}-${e.max} days`,
    razorpayOrderId: null
  });

  res.json({
    order_id: newOrder.id,
    total,
    eta: e,
    razorpay_order_id: null,
    amount: Math.round(total * 100)
  });
}));

app.post('/api/payment/verify', wrap(async (req, res) => {
  const { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (supabaseDb.isConfigured()) {
    await supabaseDb.updateOrderPayment(order_id, { payment_id: razorpay_payment_id, status: 'paid' });
    return res.json({ ok: true });
  }

  if (getUseMysql() && getMysqlPool()) {
    const [rows] = await getMysqlPool().query('SELECT * FROM orders WHERE id = ? AND razorpay_order_id = ?', [order_id, razorpay_order_id]);
    const o = rows && rows[0];
    if (!o) throw fail(404, 'Order not found');
    const expected = crypto.createHmac('sha256', RZP_SECRET).update(razorpay_order_id + '|' + razorpay_payment_id).digest('hex');
    const ok = typeof razorpay_signature === 'string' && expected.length === razorpay_signature.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpay_signature));
    if (!ok) {
      await getMysqlPool().query("UPDATE orders SET payment_status = 'failed' WHERE id = ?", [o.id]);
      throw fail(400, 'Payment verification failed');
    }
    await getMysqlPool().query("UPDATE orders SET payment_status = 'paid', status = 'confirmed', razorpay_payment_id = ? WHERE id = ?", [razorpay_payment_id, o.id]);
    return res.json({ ok: true });
  }

  await localDb.updateOrderPayment(order_id, { payment_id: razorpay_payment_id, status: 'paid' });
  res.json({ ok: true });
}));

app.get('/api/track/:query', wrap(async (req, res) => {
  const query = req.params.query.trim();

  if (supabaseDb.isConfigured()) {
    try {
      const results = await supabaseDb.findOrdersByQuery(query);
      if (results && results.length) return res.json(results);
    } catch {}
  }

  if (getUseMysql() && getMysqlPool()) {
    try {
      const isNum = /^\d+$/.test(query);
      const sql = isNum && query.length <= 8
        ? 'SELECT * FROM orders WHERE id = ?'
        : 'SELECT * FROM orders WHERE phone = ? ORDER BY id DESC LIMIT 5';
      const [rows] = await getMysqlPool().query(sql, [query]);
      if (!rows || !rows.length) throw fail(404, 'No matching order found. Please check your Order ID or registered mobile number.');
      return res.json(rows);
    } catch (e) {
      if (e.status) throw e;
    }
  }

  const results = await localDb.findOrdersByQuery(query);
  if (!results.length) throw fail(404, 'No orders found matching that Order ID or phone number.');
  res.json(results);
}));

// ---------------- Admin API Endpoints ----------------

const auth = (req, res, next) => {
  try {
    req.admin = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized session. Please log in again.' });
  }
};

// Foolproof Admin Login
app.post('/api/admin/login', wrap(async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();

  if (!username || !password) {
    throw fail(400, 'Please enter both username and password');
  }

  const lowerUser = username.toLowerCase();
  const isStandardAdminUser = ['admin', 'drmukul', 'dr mukul', 'dr mukul kumar', '8988227729', 'admin@aashvihub.com'].includes(lowerUser);

  // Master password check (supports admin123, admin, 8988227729, or custom ADMIN_PASSWORD in .env)
  const envAdminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const isMasterPasswordMatch = (
    password === 'admin123' ||
    password === 'admin' ||
    password === '8988227729' ||
    password === envAdminPass
  );

  let adminUser = null;

  // Check Supabase
  if (supabaseDb.isConfigured()) {
    try {
      adminUser = await supabaseDb.getAdminByUsername(username);
    } catch (e) {}
  }

  // Check MySQL
  if (!adminUser && getUseMysql() && getMysqlPool()) {
    try {
      const [rows] = await getMysqlPool().query('SELECT * FROM admins WHERE username = ? OR phone = ?', [username, username]);
      adminUser = rows && rows[0];
    } catch (e) {}
  }

  // Check Local Store
  if (!adminUser) {
    adminUser = await localDb.getAdminByUsername(username);
  }

  // Verification
  if (adminUser) {
    let isMatch = false;
    if (adminUser.password_hash) {
      try {
        isMatch = await bcrypt.compare(password, adminUser.password_hash);
      } catch {}
    }
    if (isMatch || isMasterPasswordMatch) {
      return res.json({
        token: jwt.sign({ id: adminUser.id || 1, username: adminUser.username || username }, JWT_SECRET, { expiresIn: '7d' }),
        admin: { name: adminUser.name || 'Dr Mukul Kumar', username: adminUser.username || 'admin', phone: '8988227729' }
      });
    }
  }

  // Standard administrator fallback
  if (isStandardAdminUser && isMasterPasswordMatch) {
    return res.json({
      token: jwt.sign({ id: 1, username: 'admin' }, JWT_SECRET, { expiresIn: '7d' }),
      admin: { name: 'Dr Mukul Kumar', username: 'admin', phone: '8988227729' }
    });
  }

  throw fail(401, 'Invalid username or password. Default is: admin / admin123 (or phone: 8988227729)');
}));

// Admin Statistics Dashboard
app.get('/api/admin/stats', auth, wrap(async (req, res) => {
  let orders = [];
  let products = [];

  if (supabaseDb.isConfigured()) {
    try {
      orders = (await supabaseDb.getTable('orders')) || [];
      products = (await supabaseDb.getTable('products')) || [];
    } catch (e) {}
  } else if (getUseMysql() && getMysqlPool()) {
    try {
      const [o] = await getMysqlPool().query('SELECT * FROM orders');
      const [p] = await getMysqlPool().query('SELECT * FROM products');
      orders = o || [];
      products = p || [];
    } catch (e) {}
  } else {
    orders = await localDb.getTable('orders');
    products = await localDb.getTable('products');
  }

  const totalRevenue = orders.reduce((sum, o) => sum + (o.payment_status === 'paid' || o.status === 'confirmed' || o.status === 'delivered' ? Number(o.total || 0) : 0), 0);
  const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'confirmed').length;
  const lowStock = products.filter(p => Number(p.stock) <= 5).length;

  res.json({
    totalOrders: orders.length,
    totalRevenue: money(totalRevenue),
    pendingOrders,
    totalProducts: products.length,
    lowStock
  });
}));

// Generic Admin CRUD Helper
const nullable = ['start_date', 'end_date'];
function pick(body, cols) {
  const o = {};
  for (const c of cols) {
    if (c in body) o[c] = body[c] === '' && nullable.includes(c) ? null : body[c];
  }
  return o;
}

function adminCrud(route, table, cols) {
  app.get(`/api/admin/${route}`, auth, wrap(async (req, res) => {
    if (supabaseDb.isConfigured()) {
      try {
        const rows = await supabaseDb.getTable(table);
        return res.json(rows);
      } catch (e) {}
    }
    if (getUseMysql() && getMysqlPool()) {
      const [rows] = await getMysqlPool().query(`SELECT * FROM ${table} ORDER BY id`);
      return res.json(rows);
    }
    res.json(await localDb.getTable(table));
  }));

  app.post(`/api/admin/${route}`, auth, wrap(async (req, res) => {
    const data = pick(req.body, cols);
    if (supabaseDb.isConfigured()) {
      const id = await supabaseDb.insertTable(table, data);
      return res.json({ id });
    }
    if (getUseMysql() && getMysqlPool()) {
      const [r] = await getMysqlPool().query(`INSERT INTO ${table} SET ?`, [data]);
      return res.json({ id: r.insertId });
    }
    const id = await localDb.insertTable(table, data);
    res.json({ id });
  }));

  app.put(`/api/admin/${route}/:id`, auth, wrap(async (req, res) => {
    const data = pick(req.body, cols);
    if (supabaseDb.isConfigured()) {
      await supabaseDb.updateTable(table, req.params.id, data);
      return res.json({ ok: true });
    }
    if (getUseMysql() && getMysqlPool()) {
      if (Object.keys(data).length) {
        await getMysqlPool().query(`UPDATE ${table} SET ? WHERE id = ?`, [data, req.params.id]);
      }
      return res.json({ ok: true });
    }
    await localDb.updateTable(table, req.params.id, data);
    res.json({ ok: true });
  }));

  app.delete(`/api/admin/${route}/:id`, auth, wrap(async (req, res) => {
    if (supabaseDb.isConfigured()) {
      await supabaseDb.deleteTable(table, req.params.id);
      return res.json({ ok: true });
    }
    if (getUseMysql() && getMysqlPool()) {
      await getMysqlPool().query(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);
      return res.json({ ok: true });
    }
    await localDb.deleteTable(table, req.params.id);
    res.json({ ok: true });
  }));
}

adminCrud('categories', 'categories', ['name', 'icon', 'sort_order', 'is_available']);
adminCrud('subcategories', 'subcategories', ['category_id', 'name', 'image', 'is_available']);
adminCrud('products', 'products', ['subcategory_id', 'name', 'description', 'details', 'image', 'mrp', 'price', 'unit', 'stock', 'is_available']);
adminCrud('offers', 'offers', ['code', 'description', 'discount_percent', 'min_order', 'active']);
adminCrud('themes', 'themes', ['theme_key', 'name', 'start_date', 'end_date']);

app.get('/api/admin/zones', auth, wrap(async (req, res) => {
  if (supabaseDb.isConfigured()) {
    const rows = await supabaseDb.getDeliveryZones();
    return res.json(rows);
  }
  if (getUseMysql() && getMysqlPool()) {
    const [rows] = await getMysqlPool().query('SELECT * FROM delivery_zones');
    return res.json(rows);
  }
  res.json(await localDb.getDeliveryZones());
}));

app.put('/api/admin/zones/:key', auth, wrap(async (req, res) => {
  const data = pick(req.body, ['label', 'min_days', 'max_days']);
  if (supabaseDb.isConfigured()) {
    await supabaseDb.updateDeliveryZone(req.params.key, data);
    return res.json({ ok: true });
  }
  if (getUseMysql() && getMysqlPool()) {
    await getMysqlPool().query('UPDATE delivery_zones SET ? WHERE zone_key = ?', [data, req.params.key]);
    return res.json({ ok: true });
  }
  await localDb.updateDeliveryZone(req.params.key, data);
  res.json({ ok: true });
}));

app.get('/api/admin/settings', auth, wrap(async (req, res) => {
  if (supabaseDb.isConfigured()) {
    const rows = await supabaseDb.getTable('settings');
    return res.json(rows);
  }
  if (getUseMysql() && getMysqlPool()) {
    const [rows] = await getMysqlPool().query('SELECT * FROM settings ORDER BY k');
    return res.json(rows);
  }
  const s = await localDb.getTable('settings');
  res.json(s);
}));

app.put('/api/admin/settings/:k', auth, wrap(async (req, res) => {
  const v = String(req.body.v ?? '');
  if (supabaseDb.isConfigured()) {
    await supabaseDb.setSetting(req.params.k, v);
    return res.json({ ok: true });
  }
  if (getUseMysql() && getMysqlPool()) {
    await getMysqlPool().query('INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [req.params.k, v]);
    return res.json({ ok: true });
  }
  await localDb.setSetting(req.params.k, v);
  res.json({ ok: true });
}));

app.get('/api/admin/orders', auth, wrap(async (req, res) => {
  if (supabaseDb.isConfigured()) {
    const rows = await supabaseDb.getTable('orders');
    return res.json(rows);
  }
  if (getUseMysql() && getMysqlPool()) {
    const [rows] = await getMysqlPool().query(
      `SELECT o.*, (SELECT GROUP_CONCAT(CONCAT(name, ' x', qty) SEPARATOR ', ') FROM order_items WHERE order_id = o.id) AS items
       FROM orders o ORDER BY o.id DESC LIMIT 200`
    );
    return res.json(rows);
  }
  const orders = await localDb.getTable('orders');
  res.json(orders);
}));

app.put('/api/admin/orders/:id', auth, wrap(async (req, res) => {
  const valid = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
  if (!valid.includes(req.body.status)) throw fail(400, 'Invalid order status');
  if (supabaseDb.isConfigured()) {
    await supabaseDb.updateOrderStatus(req.params.id, req.body.status);
    return res.json({ ok: true });
  }
  if (getUseMysql() && getMysqlPool()) {
    await getMysqlPool().query('UPDATE orders SET status = ? WHERE id = ?', [req.body.status, req.params.id]);
    return res.json({ ok: true });
  }
  await localDb.updateOrderStatus(req.params.id, req.body.status);
  res.json({ ok: true });
}));

// ---------------- Server Boot ----------------

(async () => {
  console.log('🔄 Checking database configurations...');
  if (supabaseDb.isConfigured()) {
    const ok = await supabaseDb.ping();
    if (ok) {
      console.log('⚡ Connected to Supabase Cloud PostgreSQL Database successfully!');
    } else {
      console.log('⚠️ Supabase URL/Key provided, but ping did not return success. Check internet/table permissions.');
    }
  } else {
    await checkMysqlConnection();
  }

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`====================================================`);
    console.log(`🚀 Aashvi Hub is live!`);
    console.log(`👤 Owner: Dr Mukul Kumar | Phone: 8988227729`);
    console.log(`🌐 Customer Store: http://localhost:${port}`);
    console.log(`🛡️ Admin Portal:  http://localhost:${port}/admin.html`);
    console.log(`💾 Active Database: ${supabaseDb.isConfigured() ? 'Supabase Cloud (PostgreSQL)' : (getUseMysql() ? 'MySQL Local' : 'Local JSON Storage (database/local_store.json)')}`);
    console.log(`🔑 Admin Login:  username: admin | password: admin123`);
    console.log(`====================================================`);
  });
})().catch(e => {
  console.error('Fatal initialization error:', e);
});
