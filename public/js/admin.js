// ==========================================================================
// Aashvi Hub - Admin Dashboard Logic
// Owner: Dr Mukul Kumar (Mob: 8988227729)
// ==========================================================================

let token = localStorage.at || '';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = n => '₹' + (Math.round(Number(n) * 100) / 100).toLocaleString('en-IN');

async function api(method, url, body) {
  const r = await fetch('/api/admin/' + url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: body ? JSON.stringify(body) : undefined
  });
  if (r.status === 401 && url !== 'login') {
    logout();
    throw new Error('Session expired. Please login again.');
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Server error');
  return j;
}

function logout() {
  token = '';
  localStorage.removeItem('at');
  showLogin();
}

function showLogin() {
  $('#app').hidden = true;
  $('#login').hidden = false;
}

async function loadStats() {
  try {
    const stats = await api('GET', 'stats');
    $('#statRevenue').textContent = inr(stats.totalRevenue);
    $('#statOrders').textContent = stats.totalOrders;
    $('#statPending').textContent = stats.pendingOrders;
    $('#statProducts').textContent = stats.totalProducts;
  } catch (e) {
    console.warn('Stats fetch notice:', e.message);
  }
}

const ORDER_STATUS = 'enum:pending,confirmed,shipped,delivered,cancelled';
const TABS = {
  categories: {
    label: 'Categories',
    note: 'Tick or untick "Available" to show/hide category. Icon can be any emoji (e.g. 🩺, 🌾, 🍵).',
    fields: [['name', 'Category Name'], ['icon', 'Emoji Icon'], ['sort_order', 'Sort Order', 'number'], ['is_available', 'Available', 'check']]
  },
  subcategories: {
    label: 'Sub-Categories',
    note: 'Subcategories organize products under main categories (e.g. Wellness → Immunity & Ayurveda).',
    fields: [['category_id', 'Category', 'sel:categories'], ['name', 'Subcategory Name'], ['image', 'Cover Image URL'], ['is_available', 'Available', 'check']]
  },
  products: {
    label: 'Products Catalog',
    note: 'All products listed under Dr Mukul Kumar supervision. MRP shows crossed out, discount is computed automatically.',
    fields: [
      ['subcategory_id', 'Subcategory', 'sel:subcategories'],
      ['name', 'Product Name'],
      ['description', 'Short Description'],
      ['details', 'Full Details / Doctor Note', 'area'],
      ['image', 'Image URL'],
      ['mrp', 'MRP ₹', 'number'],
      ['price', 'Selling Price ₹', 'number'],
      ['unit', 'Unit (e.g. 500 g, 60 caps)'],
      ['stock', 'Stock Count', 'number'],
      ['is_available', 'Available', 'check']
    ]
  },
  offers: {
    label: 'Discount Coupons',
    note: 'Promo codes that customers enter in their cart. Discount is calculated on subtotal above min order.',
    fields: [['code', 'Code'], ['description', 'Description'], ['discount_percent', 'Discount %', 'number'], ['min_order', 'Min Order ₹', 'number'], ['active', 'Active', 'check']]
  },
  themes: {
    label: 'Festival Themes',
    note: 'Change dates for Diwali, Eid, Holi, Christmas, etc. When theme_mode = auto in Settings, active theme automatically applies.',
    fields: [['theme_key', 'Theme Key'], ['name', 'Banner Text'], ['start_date', 'Start Date', 'date'], ['end_date', 'End Date', 'date']]
  },
  zones: {
    label: 'Delivery Zones & ETA',
    route: 'zones',
    id: 'zone_key',
    noAdd: true,
    noDel: true,
    note: 'Set minimum and maximum days for local, regional, national, and remote shipping across India.',
    fields: [['zone_key', 'Zone Key', 'ro'], ['label', 'Zone Label'], ['min_days', 'Min Days', 'number'], ['max_days', 'Max Days', 'number']]
  },
  settings: {
    label: 'Store Settings',
    id: 'k',
    noAdd: true,
    noDel: true,
    note: 'Owner contact: Dr Mukul Kumar (8988227729). origin_pincode calculates dispatch distance. delivery_fee applies under free_delivery_above limit.',
    fields: [['k', 'Setting Key', 'ro'], ['v', 'Setting Value']]
  },
  orders: {
    label: 'Customer Orders',
    noAdd: true,
    noDel: true,
    note: 'Manage customer orders. Update status to "confirmed", "shipped" or "delivered" to track progress.',
    fields: [
      ['id', 'Order ID', 'ro'],
      ['created_at', 'Order Time', 'ro'],
      ['customer_name', 'Customer', 'ro'],
      ['phone', 'Mobile', 'ro'],
      ['address', 'Address', 'ro'],
      ['pincode', 'Pincode', 'ro'],
      ['items', 'Items Ordered', 'ro'],
      ['total', 'Total ₹', 'ro'],
      ['payment_method', 'Payment Mode', 'ro'],
      ['payment_status', 'Payment Status', 'ro'],
      ['status', 'Delivery Status', ORDER_STATUS]
    ]
  }
};

let cur = 'orders', refs = {};

function cell(f, v) {
  const [k, , t = 'text'] = f;
  v = v == null ? '' : v;
  if (t === 'ro') {
    if (k === 'total') return `<strong>${inr(v)}</strong>`;
    if (k === 'status') return `<span style="font-weight:700;color:var(--primary)">${esc(v)}</span>`;
    return `<span>${esc(v)}</span>`;
  }
  if (t === 'check') return `<input type="checkbox" data-k="${k}" ${+v ? 'checked' : ''}>`;
  if (t === 'area') return `<textarea data-k="${k}" rows="2">${esc(v)}</textarea>`;
  if (t.startsWith('sel:')) {
    const opts = refs[t.slice(4)] || [];
    return `<select data-k="${k}">${opts.map(o => `<option value="${o.id}" ${o.id == v ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
  }
  if (t.startsWith('enum:')) {
    return `<select data-k="${k}">${t.slice(5).split(',').map(o => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
  }
  return `<input data-k="${k}" type="${t}" ${t === 'number' ? 'step="any"' : ''} value="${esc(t === 'date' ? String(v).slice(0, 10) : v)}">`;
}

function collect(tr) {
  const o = {};
  tr.querySelectorAll('[data-k]').forEach(e => {
    o[e.dataset.k] = e.type === 'checkbox' ? (e.checked ? 1 : 0) : e.value;
  });
  return o;
}

async function show(tab) {
  cur = tab;
  const c = TABS[tab], route = c.route || tab, idk = c.id || 'id';
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
  $('#note').textContent = c.note || '';

  try {
    if (c.fields.some(f => (f[2] || '').startsWith('sel:'))) {
      const cats = await api('GET', 'categories'), subs = await api('GET', 'subcategories');
      const cn = Object.fromEntries(cats.map(x => [x.id, x.name]));
      refs.categories = cats.map(x => ({ id: x.id, label: x.name }));
      refs.subcategories = subs.map(x => ({ id: x.id, label: (cn[x.category_id] || '?') + ' › ' + x.name }));
    }

    const rows = await api('GET', route);
    const head = c.fields.map(f => `<th>${f[1]}</th>`).join('') + '<th style="text-align:right">Actions</th>';

    const body = rows.map(r => `
      <tr data-id="${esc(r[idk])}">
        ${c.fields.map(f => `<td>${cell(f, r[f[0]])}</td>`).join('')}
        <td style="text-align:right;white-space:nowrap">
          <button class="btn pri" data-save>Save</button>
          ${c.noDel ? '' : ' <button class="btn del" data-del>Delete</button>'}
        </td>
      </tr>
    `).join('');

    const add = c.noAdd ? '' : `
      <tr data-new style="background:#f0fdf4">
        ${c.fields.map(f => `<td>${cell(f, f[2] === 'check' ? 1 : '')}</td>`).join('')}
        <td style="text-align:right">
          <button class="btn pri" data-add style="background:#059669">+ Add Item</button>
        </td>
      </tr>
    `;

    $('#view').innerHTML = `
      <table>
        <thead><tr>${head}</tr></thead>
        <tbody>${body}${add}</tbody>
      </table>
    `;

    $('#view').querySelectorAll('[data-save]').forEach(b => b.onclick = async () => {
      const tr = b.closest('tr');
      try {
        await api('PUT', `${route}/${encodeURIComponent(tr.dataset.id)}`, collect(tr));
        b.textContent = '✓ Saved';
        loadStats();
        setTimeout(() => b.textContent = 'Save', 1400);
      } catch (e) {
        alert(e.message);
      }
    });

    $('#view').querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('Are you sure you want to delete this record?')) return;
      try {
        await api('DELETE', `${route}/${b.closest('tr').dataset.id}`);
        loadStats();
        show(tab);
      } catch (e) {
        alert(e.message);
      }
    });

    const nb = $('#view').querySelector('[data-add]');
    if (nb) nb.onclick = async () => {
      try {
        await api('POST', route, collect(nb.closest('tr')));
        loadStats();
        show(tab);
      } catch (e) {
        alert(e.message);
      }
    };
  } catch (e) {
    if (e.message !== 'Session expired. Please login again.') {
      $('#view').innerHTML = `<p class="err" style="padding:16px">${esc(e.message)}</p>`;
    }
  }
}

function start() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#nav').innerHTML = Object.entries(TABS).map(([k, v]) => `
    <button data-t="${k}">${v.label}</button>
  `).join('');
  $('#nav').querySelectorAll('button').forEach(b => b.onclick = () => show(b.dataset.t));
  loadStats();
  show(cur);
}

$('#login').onsubmit = async e => {
  e.preventDefault();
  const errEl = $('#lerr');
  errEl.textContent = '';
  try {
    const r = await api('POST', 'login', { username: $('#u').value, password: $('#p').value });
    token = r.token;
    localStorage.at = token;
    start();
  } catch (err) {
    errEl.textContent = err.message;
  }
};

$('#logout').onclick = logout;

token ? start() : showLogin();
