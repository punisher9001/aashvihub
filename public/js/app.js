// ==========================================================================
// Aashvi Hub - Core Store Logic
// Founder & Director: Dr Mukul Kumar (Mob: 8988227729)
// ==========================================================================

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = n => '₹' + (Math.round(Number(n) * 100) / 100).toLocaleString('en-IN');

let lang = localStorage.lang && I18N[localStorage.lang] ? localStorage.lang : 'en';
const T = k => (I18N[lang] && I18N[lang][k]) || (I18N.en && I18N.en[k]) || k;

let cart = {};
try { cart = JSON.parse(localStorage.cart || '{}'); } catch { cart = {}; }

let wishlist = [];
try { wishlist = JSON.parse(localStorage.getItem('aashvi_wishlist') || '[]'); } catch { wishlist = []; }

let customerUser = null;
try { customerUser = JSON.parse(localStorage.getItem('customerUser') || 'null'); } catch { customerUser = null; }

const st = {
  catalog: [],
  cat: null,
  sub: null,
  products: [],
  cfg: {
    shop: 'Aashvi Hub',
    owner_name: 'Dr Mukul Kumar',
    owner_phone: '8988227729',
    free_delivery_above: 499,
    delivery_fee: 40
  },
  eta: null,
  pct: 0,
  minOrder: 0,
  code: '',
  timer: null,
  searchTimer: null,
  // Filters
  sort: 'featured',
  priceRange: 'all',
  stockOnly: false
};

const FX = {
  diwali: ['🎆', '🪔', '✨', '🎇'],
  eid: ['🌙', '⭐', '✨'],
  holi: ['🎨', '💦', '🌸'],
  navratri: ['🪔', '🌸', '✨'],
  christmas: ['❄️', '🎄', '⭐'],
  independence: ['🇮🇳', '✨'],
  newyear: ['🎉', '✨', '🎊']
};

// Toast Notifications
function showToast(message, type = 'success') {
  const container = $('#toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, 2800);
}

// API Helper
async function api(url, opt) {
  try {
    const r = await fetch(url, opt);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Server request error');
    return j;
  } catch (err) {
    throw err;
  }
}

// Internationalization Handler
function applyLang() {
  const L = I18N[lang] || I18N.en;
  document.documentElement.lang = lang;
  document.body.dir = L.rtl ? 'rtl' : 'ltr';

  // Translate all marked elements
  $$('[data-t]').forEach(e => {
    const k = e.dataset.t;
    if (k && T(k)) e.textContent = T(k);
  });
  $$('[data-ph]').forEach(e => {
    const k = e.dataset.ph;
    if (k && T(k)) e.placeholder = T(k);
  });

  // Update Sort dropdown options
  const sortSelect = $('#sortSelect');
  if (sortSelect) {
    sortSelect.querySelectorAll('option').forEach(opt => {
      const k = opt.dataset.t;
      if (k && T(k)) opt.textContent = T(k);
    });
  }

  // Update Price Filter Chips
  const priceChips = $('#priceChips');
  if (priceChips) {
    priceChips.querySelectorAll('button').forEach(btn => {
      const k = btn.dataset.t;
      if (k && T(k)) btn.textContent = T(k);
    });
  }

  renderEta();
  renderCats();
  renderSubs();
  renderProducts();
  renderCart();
}

// Dynamic Festival Themes
async function loadTheme() {
  try {
    const t = await api('/api/theme');
    document.body.dataset.theme = t.key;
    const b = $('#banner');
    if (t.key !== 'default') {
      b.textContent = t.name;
      b.hidden = false;
    } else {
      b.hidden = true;
    }
    const fx = $('#fx');
    fx.innerHTML = '';
    clearInterval(st.timer);
    const list = FX[t.key];
    if (list) {
      st.timer = setInterval(() => {
        if (fx.children.length > 30) return;
        const e = document.createElement('span');
        e.className = 'fall';
        e.textContent = list[Math.floor(Math.random() * list.length)];
        e.style.left = Math.random() * 100 + 'vw';
        e.style.fontSize = 18 + Math.random() * 22 + 'px';
        e.style.animationDuration = 5 + Math.random() * 6 + 's';
        fx.appendChild(e);
        setTimeout(() => e.remove(), 11000);
      }, 500);
    }
  } catch (e) {
    console.warn('Theme load notice:', e.message);
  }
}

// Render Categories with Translations
function renderCats() {
  const container = $('#cats');
  if (!container) return;

  container.innerHTML = st.catalog.map(c => {
    const translatedName = T('cat_' + c.id) || c.name;
    return `
      <div class="cat ${st.cat === c.id ? 'on' : ''}" data-id="${c.id}">
        <span class="ic">${esc(c.icon || '🛍️')}</span>
        <span class="cat-name">${esc(translatedName)}</span>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.cat').forEach(e => {
    e.onclick = () => {
      st.cat = +e.dataset.id;
      st.sub = null;
      renderCats();
      renderSubs();
      loadProducts();
    };
  });
}

// Render Subcategories for currently active category
function renderSubs() {
  const container = $('#subs');
  const subsHeader = $('#subsHeader');
  if (!container) return;

  const currentCat = st.catalog.find(x => x.id === st.cat);
  if (!currentCat || !currentCat.subs || !currentCat.subs.length) {
    container.innerHTML = '';
    if (subsHeader) subsHeader.hidden = true;
    return;
  }

  if (subsHeader) subsHeader.hidden = false;

  const catName = T('cat_' + currentCat.id) || currentCat.name;
  const allLabel = `${T('filter_all')} ${catName}`;
  const allChip = `<span class="chip ${!st.sub ? 'on' : ''}" data-id="">${esc(allLabel)}</span>`;

  const subChips = currentCat.subs.map(s => {
    const translatedSub = T('sub_' + s.id) || s.name;
    return `
      <span class="chip ${st.sub === s.id ? 'on' : ''}" data-id="${s.id}">
        ${esc(translatedSub)}
      </span>
    `;
  }).join('');

  container.innerHTML = allChip + subChips;

  container.querySelectorAll('.chip').forEach(e => {
    e.onclick = () => {
      st.sub = e.dataset.id ? +e.dataset.id : null;
      renderSubs();
      loadProducts();
    };
  });
}

// Fetch Products from Backend
async function loadProducts() {
  const p = new URLSearchParams();
  const qv = $('#search').value.trim();

  const titleEl = $('#currentCatTitle');
  if (qv) {
    p.set('q', qv);
    if (titleEl) titleEl.textContent = `Search results for "${qv}"`;
    $('#clearSearch').hidden = false;
  } else {
    $('#clearSearch').hidden = true;
    if (st.sub) {
      p.set('sub', st.sub);
      const cat = st.catalog.find(x => x.id === st.cat);
      const sub = cat && cat.subs.find(x => x.id === st.sub);
      const name = sub ? (T('sub_' + sub.id) || sub.name) : 'Products';
      if (titleEl) titleEl.textContent = name;
    } else if (st.cat) {
      p.set('cat', st.cat);
      const cat = st.catalog.find(x => x.id === st.cat);
      const name = cat ? (T('cat_' + cat.id) || cat.name) : 'Products';
      if (titleEl) titleEl.textContent = name;
    } else {
      if (titleEl) titleEl.textContent = 'All Featured Products';
    }
  }

  try {
    st.products = await api('/api/products?' + p.toString());
  } catch (e) {
    console.error('Error fetching products:', e);
    st.products = [];
  }
  renderProducts();
}

// Compute Filtered & Sorted Products
function getFilteredProducts() {
  let list = [...st.products];

  // In Stock Filter
  if (st.stockOnly) {
    list = list.filter(p => p.available && Number(p.stock) > 0);
  }

  // Price Range Filter
  if (st.priceRange === 'under_100') {
    list = list.filter(p => Number(p.price) < 100);
  } else if (st.priceRange === '100_300') {
    list = list.filter(p => Number(p.price) >= 100 && Number(p.price) <= 300);
  } else if (st.priceRange === '300_500') {
    list = list.filter(p => Number(p.price) >= 300 && Number(p.price) <= 500);
  } else if (st.priceRange === 'above_500') {
    list = list.filter(p => Number(p.price) > 500);
  }

  // Sorting
  if (st.sort === 'low_high') {
    list.sort((a, b) => Number(a.price) - Number(b.price));
  } else if (st.sort === 'high_low') {
    list.sort((a, b) => Number(b.price) - Number(a.price));
  } else if (st.sort === 'discount') {
    const disc = p => p.mrp > p.price ? ((p.mrp - p.price) / p.mrp) : 0;
    list.sort((a, b) => disc(b) - disc(a));
  }

  return list;
}

// Render Product Grid with Active Filters
function renderProducts() {
  const grid = $('#grid');
  const empty = $('#emptyGrid');
  const countBadge = $('#productCountBadge');

  const visibleList = getFilteredProducts();

  if (countBadge) {
    countBadge.textContent = `${visibleList.length} item${visibleList.length === 1 ? '' : 's'}`;
  }

  if (!visibleList.length) {
    grid.innerHTML = '';
    if (empty) empty.hidden = false;
    return;
  }

  if (empty) empty.hidden = true;

  grid.innerHTML = visibleList.map(p => {
    const off = p.mrp > p.price ? Math.round((1 - p.price / p.mrp) * 100) : 0;
    const n = cart[p.id] ? cart[p.id].qty : 0;
    const isWished = wishlist.some(w => w.id === p.id);

    const ctl = !p.available
      ? `<button class="btn-unavailable" disabled>${esc(T('unavailable'))}</button>`
      : n
        ? `<div class="qty-control">
             <button data-m="${p.id}" aria-label="Decrease quantity">−</button>
             <b>${n}</b>
             <button data-a="${p.id}" aria-label="Increase quantity">+</button>
           </div>`
        : `<button class="btn-add" data-a="${p.id}">+ ${esc(T('add'))}</button>`;

    return `
      <div class="card ${p.available ? '' : 'na'}" style="position:relative;">
        <button class="btn-wish-toggle" data-w="${p.id}" title="${isWished ? 'Remove from Wishlist' : 'Add to Wishlist'}" style="position:absolute; top:8px; right:8px; background:white; border:none; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,0.12); cursor:pointer; font-size:16px; z-index:10; transition:transform 0.2s;">
          ${isWished ? '❤️' : '🤍'}
        </button>
        <div class="card-top">
          ${off ? `<div class="discount-badge">${off}% ${esc(T('off'))}</div>` : ''}
          <div class="doctor-verified-tag">✓ Verified</div>
          <div class="img-box" data-d="${p.id}" title="View details">
            ${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">` : '<span style="font-size:42px">📦</span>'}
          </div>
        </div>

        <div class="card-meta">
          <div class="un">${esc(p.unit || 'Standard Unit')}</div>
          <div class="nm" data-d="${p.id}" title="${esc(p.name)}">${esc(p.name)}</div>
          <div class="rating-line">
            <span>★★★★★</span>
            <span class="rating-count">(4.9)</span>
          </div>
        </div>

        <div class="card-bottom">
          <div class="price-box">
            <div class="price-main">${inr(p.price)}</div>
            ${p.mrp > p.price ? `
              <div class="price-mrp-row">
                <s>${inr(p.mrp)}</s>
                <span class="save-tag">Save ${inr(p.mrp - p.price)}</span>
              </div>
            ` : ''}
          </div>
          <div class="card-cta">${ctl}</div>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('[data-a]').forEach(e => e.onclick = () => changeQuantity(+e.dataset.a, 1));
  grid.querySelectorAll('[data-m]').forEach(e => e.onclick = () => changeQuantity(+e.dataset.m, -1));
  grid.querySelectorAll('[data-d]').forEach(e => e.onclick = () => openDetail(+e.dataset.d));
  grid.querySelectorAll('[data-w]').forEach(e => e.onclick = (ev) => {
    ev.stopPropagation();
    toggleWishlist(+e.dataset.w);
  });
}

// Product Details Modal
function openDetail(id) {
  const p = st.products.find(x => x.id === id) || (cart[id] && cart[id].p);
  if (!p) return;

  const off = p.mrp > p.price ? Math.round((1 - p.price / p.mrp) * 100) : 0;
  const inCart = cart[p.id] ? cart[p.id].qty : 0;

  const waText = encodeURIComponent(`Hello Dr Mukul Kumar, I would like to order "${p.name}" (${p.unit}) from Aashvi Hub at ${inr(p.price)}.`);

  $('#modalBody').innerHTML = `
    <div class="modal-detail-wrap">
      ${p.image ? `<img src="${esc(p.image)}" class="modal-detail-img" alt="${esc(p.name)}">` : ''}
      <div class="un" style="color:var(--text-muted);font-weight:600;font-size:13px">${esc(p.unit)}</div>
      <h3 class="modal-detail-title">${esc(p.name)}</h3>

      <div class="price-box" style="margin: 8px 0 14px">
        <div style="font-size:24px;font-weight:800;color:var(--primary)">${inr(p.price)}</div>
        ${p.mrp > p.price ? `
          <div style="font-size:13.5px;color:var(--text-muted)">
            MRP: <s>${inr(p.mrp)}</s> • <strong style="color:var(--primary)">${off}% ${esc(T('off'))}</strong>
          </div>
        ` : ''}
      </div>

      <div class="modal-doctor-box">
        <strong>🩺 Quality Checked • Dr Mukul Kumar (8988227729)</strong>
        <p>${esc(p.description || 'Authentic quality assured with direct dispatch from central hub.')}</p>
      </div>

      ${p.details ? `
        <div style="margin: 14px 0">
          <h4 style="font-size:14.5px;font-weight:700;margin-bottom:6px">Product Details &amp; Specifications</h4>
          <p style="white-space:pre-wrap;font-size:13.5px;color:#334155;line-height:1.6">${esc(p.details)}</p>
        </div>
      ` : ''}

      <div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap">
        <button id="modalAddBtn" class="primary-btn" style="flex:1">
          ${inCart ? `Add More (${inCart} in cart)` : `Add to Cart • ${inr(p.price)}`}
        </button>
        <a href="https://wa.me/918988227729?text=${waText}" target="_blank" rel="noopener" class="btn-whatsapp-order" style="display:flex;align-items:center;padding:12px 18px;border-radius:var(--radius-sm)">
          <span>WhatsApp Order</span>
        </a>
      </div>
    </div>
  `;

  $('#modalAddBtn').onclick = () => {
    changeQuantity(p.id, 1);
    showToast(`Added "${p.name}" to cart`);
    $('#modal').hidden = true;
  };

  $('#modal').hidden = false;
}

// Cart Quantity Management
function changeQuantity(id, delta) {
  const p = st.products.find(x => x.id === id) || (cart[id] && cart[id].p);
  if (!p) return;

  const current = cart[id] ? cart[id].qty : 0;
  const next = current + delta;

  if (next <= 0) {
    delete cart[id];
  } else {
    cart[id] = { p, qty: next };
  }

  localStorage.cart = JSON.stringify(cart);
  renderProducts();
  renderCart();
}

// Totals Calculation
function calculateTotals() {
  const sub = Object.values(cart).reduce((sum, item) => sum + item.p.price * item.qty, 0);
  const disc = st.pct && sub >= st.minOrder ? Math.round(sub * st.pct) / 100 : 0;
  const freeAbove = Number(st.cfg.free_delivery_above || 499);
  const fee = (!sub || (freeAbove > 0 && (sub - disc) >= freeAbove)) ? 0 : Number(st.cfg.delivery_fee || 40);
  const total = Math.max(0, sub - disc + fee);

  return { sub, disc, fee, total, freeAbove };
}

// Render Cart Drawer
function renderCart() {
  const items = Object.entries(cart);
  const totalCount = items.reduce((sum, [, c]) => sum + c.qty, 0);

  // Update header indicators
  $('#cartCount').textContent = totalCount;
  const t = calculateTotals();
  const headerTotalEl = $('#cartTotalHeader');
  if (headerTotalEl) headerTotalEl.textContent = inr(t.total);

  // Free delivery progress meter
  const trackerEl = $('#freeDeliveryTracker');
  const trackerText = $('#trackerText');
  const trackerBar = $('#trackerBar');

  if (trackerEl && trackerText && trackerBar) {
    if (t.sub === 0) {
      trackerText.innerHTML = `Add items to qualify for <strong>FREE Delivery</strong> (Above ${inr(t.freeAbove)})`;
      trackerBar.style.width = '0%';
    } else if (t.sub >= t.freeAbove) {
      trackerText.innerHTML = `🎉 Congratulations! You have unlocked <strong>FREE Delivery</strong>!`;
      trackerBar.style.width = '100%';
    } else {
      const remaining = t.freeAbove - t.sub;
      const pct = Math.min(100, Math.round((t.sub / t.freeAbove) * 100));
      trackerText.innerHTML = `Add <strong>${inr(remaining)}</strong> more to get <strong>FREE Delivery</strong>!`;
      trackerBar.style.width = `${pct}%`;
    }
  }

  // Items List
  const listEl = $('#cartItems');
  if (items.length) {
    listEl.innerHTML = items.map(([id, c]) => `
      <div class="cart-line">
        ${c.p.image ? `<img src="${esc(c.p.image)}" class="cart-line-img" alt="">` : ''}
        <div class="cart-line-info">
          <div class="cart-line-name">${esc(c.p.name)}</div>
          <div class="cart-line-price">${inr(c.p.price)} <small style="color:var(--text-muted)">(${esc(c.p.unit || '')})</small></div>
        </div>
        <div class="qty-control">
          <button data-m="${id}" aria-label="Decrease">−</button>
          <b>${c.qty}</b>
          <button data-a="${id}" aria-label="Increase">+</button>
        </div>
      </div>
    `).join('');
  } else {
    listEl.innerHTML = `
      <div class="empty-state" style="padding: 30px 10px; margin: 10px 0;">
        <div style="font-size:36px;margin-bottom:8px">🛒</div>
        <p style="margin:0">${esc(T('empty'))}</p>
      </div>
    `;
  }

  listEl.querySelectorAll('[data-a]').forEach(e => e.onclick = () => changeQuantity(+e.dataset.a, 1));
  listEl.querySelectorAll('[data-m]').forEach(e => e.onclick = () => changeQuantity(+e.dataset.m, -1));

  // Bill Summary
  $('#sSub').textContent = inr(t.sub);
  $('#sDisc').textContent = '-' + inr(t.disc);
  $('#sFee').textContent = t.fee ? inr(t.fee) : T('free');
  $('#sTotal').textContent = inr(t.total);
}

// Render Delivery ETA
function renderEta() {
  const e = $('#eta');
  const locVal = $('#locVal');
  const locLabel = $('#locLabel');

  if (!st.eta) {
    if (e) e.hidden = true;
    if (locVal) locVal.textContent = 'Set Pincode for ETA';
    return;
  }

  if (e) {
    e.hidden = false;
    e.innerHTML = `<span>🚚 <strong>${esc(st.eta.label || 'Express Delivery')}:</strong> ${T('deliveryIn')} ${st.eta.min}-${st.eta.max} ${T('days')}</span>`;
  }

  if (locVal) locVal.textContent = `${localStorage.pin || ''} (${st.eta.min}-${st.eta.max} Days)`;
  if (locLabel) locLabel.textContent = `Deliver to: ${st.eta.zone.toUpperCase()}`;
}

// Check Pincode ETA
async function checkPin(pinToTest) {
  const pin = (pinToTest || $('#modalPinInput').value || '').trim();
  if (!/^[1-9]\d{5}$/.test(pin)) {
    st.eta = null;
    renderEta();
    throw new Error(T('invalidPin'));
  }

  st.eta = await api('/api/delivery/' + pin);
  localStorage.pin = pin;
  renderEta();
  showToast(`Delivery estimate updated for ${pin}`);
  return st.eta;
}

// Open/Close Cart
function openCart() {
  $('#cartPanel').hidden = false;
  $('#cartOverlay').hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeCart() {
  $('#cartPanel').hidden = true;
  $('#cartOverlay').hidden = true;
  document.body.style.overflow = '';
}

// Event Listeners for Cart
$('#cartBtn').onclick = openCart;
$('#closeCart').onclick = closeCart;
$('#cartOverlay').onclick = closeCart;

// Modals
$('#closeModal').onclick = () => $('#modal').hidden = true;
$('#modal').onclick = e => { if (e.target.id === 'modal') $('#modal').hidden = true; };

// Location / Pincode Modal
$('#locationPill').onclick = () => {
  $('#modalPinInput').value = localStorage.pin || '';
  $('#modalPinFeedback').textContent = '';
  $('#pinModal').hidden = false;
};
$('#closePinModal').onclick = () => $('#pinModal').hidden = true;
$('#pinModal').onclick = e => { if (e.target.id === 'pinModal') $('#pinModal').hidden = true; };

$('#modalPinCheckBtn').onclick = async () => {
  const feedback = $('#modalPinFeedback');
  try {
    const res = await checkPin();
    feedback.style.color = 'var(--primary)';
    feedback.innerHTML = `✓ <strong>${res.label}</strong>: Estimated delivery in ${res.min} to ${res.max} days.`;
    setTimeout(() => { $('#pinModal').hidden = true; }, 1400);
  } catch (err) {
    feedback.style.color = '#ef4444';
    feedback.textContent = err.message;
  }
};

// Search handling
$('#search').oninput = () => {
  clearTimeout(st.searchTimer);
  st.searchTimer = setTimeout(loadProducts, 250);
};

$('#clearSearch').onclick = () => {
  $('#search').value = '';
  $('#clearSearch').hidden = true;
  loadProducts();
};

// Filter & Sort Toolbar Handlers
const sortSelect = $('#sortSelect');
if (sortSelect) {
  sortSelect.onchange = e => {
    st.sort = e.target.value;
    renderProducts();
  };
}

const priceChips = $('#priceChips');
if (priceChips) {
  priceChips.querySelectorAll('button').forEach(btn => {
    btn.onclick = () => {
      priceChips.querySelectorAll('button').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      st.priceRange = btn.dataset.price;
      renderProducts();
    };
  });
}

const stockOnly = $('#stockOnly');
if (stockOnly) {
  stockOnly.onchange = e => {
    st.stockOnly = e.target.checked;
    renderProducts();
  };
}

const resetFiltersBtn = $('#resetFiltersBtn');
if (resetFiltersBtn) {
  resetFiltersBtn.onclick = () => {
    st.sort = 'featured';
    if (sortSelect) sortSelect.value = 'featured';
    st.priceRange = 'all';
    if (priceChips) {
      priceChips.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.price === 'all'));
    }
    st.stockOnly = false;
    if (stockOnly) stockOnly.checked = false;
    $('#search').value = '';
    renderProducts();
    showToast('Filters reset to default');
  };
}

const resetBtn = $('#resetSearchBtn');
if (resetBtn) resetBtn.onclick = () => {
  $('#search').value = '';
  if (resetFiltersBtn) resetFiltersBtn.click();
};

// Language Selection Switcher
$('#lang').onchange = e => {
  lang = e.target.value;
  localStorage.lang = lang;
  applyLang();
  showToast(`Language switched to ${I18N[lang]._n}`);
};

// Coupon Handling
$('#applyBtn').onclick = async () => {
  const code = ($('#coupon').value || '').trim();
  const msgEl = $('#couponMsg');
  if (!code) return;

  try {
    const r = await api('/api/coupon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    st.pct = r.percent;
    st.minOrder = r.min_order;
    st.code = code.toUpperCase();
    msgEl.style.color = 'var(--primary)';
    msgEl.textContent = `✓ ${r.percent}% ${T('off')} applied successfully!`;
    showToast(`Coupon ${st.code} Applied (${r.percent}% OFF)`);
  } catch (e) {
    st.pct = 0;
    st.code = '';
    msgEl.style.color = '#ef4444';
    msgEl.textContent = e.message;
  }
  renderCart();
};

// Order Tracking Modal Handlers
function openTrackModal() {
  $('#trackInput').value = '';
  $('#trackResults').innerHTML = '';
  $('#trackModal').hidden = false;
}
$('#openTrackBtn').onclick = openTrackModal;
const footerTrack = $('#footerTrackLink');
if (footerTrack) footerTrack.onclick = openTrackModal;
$('#closeTrackModal').onclick = () => $('#trackModal').hidden = true;
$('#trackModal').onclick = e => { if (e.target.id === 'trackModal') $('#trackModal').hidden = true; };

$('#trackSubmitBtn').onclick = async () => {
  const q = ($('#trackInput').value || '').trim();
  const resEl = $('#trackResults');
  if (!q) {
    resEl.innerHTML = '<p style="color:#ef4444">Please enter your Order ID or registered mobile number.</p>';
    return;
  }

  resEl.innerHTML = '<p>Searching orders...</p>';
  try {
    const orders = await api('/api/track/' + encodeURIComponent(q));
    resEl.innerHTML = orders.map(o => {
      const stepMap = { pending: 1, confirmed: 2, shipped: 3, delivered: 4, cancelled: 0 };
      const curStep = stepMap[o.status] || 1;

      return `
        <div class="track-card-item">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <strong>Order #${o.id}</strong>
            <span class="badge-pill" style="text-transform:capitalize">${o.status}</span>
          </div>
          <div style="font-size:12px;color:var(--text-muted);margin:4px 0">
            Placed on ${new Date(o.created_at).toLocaleDateString()} • Amount: ${inr(o.total)}
          </div>
          <div style="font-size:12.5px;margin-bottom:8px">
            ETA: <strong>${esc(o.eta_text || '2-5 days')}</strong>
          </div>

          <div class="track-steps">
            <div class="track-step ${curStep >= 1 ? 'done' : ''}">
              <div class="step-dot">1</div>
              <span class="step-label">Placed</span>
            </div>
            <div class="track-step ${curStep >= 2 ? 'done' : ''}">
              <div class="step-dot">2</div>
              <span class="step-label">Verified</span>
            </div>
            <div class="track-step ${curStep >= 3 ? 'done' : ''}">
              <div class="step-dot">3</div>
              <span class="step-label">Shipped</span>
            </div>
            <div class="track-step ${curStep >= 4 ? 'done' : ''}">
              <div class="step-dot">4</div>
              <span class="step-label">Delivered</span>
            </div>
          </div>

          <div style="font-size:11.5px;color:#15803d;margin-top:8px">
            Supervised by Dr Mukul Kumar (Mob: 8988227729)
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    resEl.innerHTML = `<p style="color:#ef4444">${esc(err.message)}</p>`;
  }
};

// Checkout & Order Submission
$('#checkout').onsubmit = async ev => {
  ev.preventDefault();
  const msg = $('#orderMsg');
  msg.textContent = '';

  const items = Object.entries(cart).map(([id, c]) => ({ id: +id, qty: c.qty }));
  if (!items.length) {
    msg.textContent = T('empty');
    return;
  }

  const pin = localStorage.pin || prompt('Please enter your 6-digit Delivery Pincode:') || '';
  if (!/^[1-9]\d{5}$/.test(pin.trim())) {
    msg.textContent = T('invalidPin');
    $('#modalPinInput').value = '';
    $('#pinModal').hidden = false;
    return;
  }

  const cName = $('#cName').value.trim();
  const cPhone = $('#cPhone').value.trim();
  const cAddr = $('#cAddr').value.trim();
  const method = document.querySelector('input[name="pay"]:checked').value;

  const submitBtn = $('#placeOrderBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Processing Order...';

  // Direct WhatsApp order handling
  if (method === 'whatsapp') {
    const t = calculateTotals();
    const orderItemsSummary = items.map(it => {
      const p = cart[it.id].p;
      return `• ${p.name} (${p.unit}) x ${it.qty} = ${inr(p.price * it.qty)}`;
    }).join('\n');

    const waText = encodeURIComponent(
      `*AASHVI HUB NEW ORDER REQUEST*\n` +
      `Owner: Dr Mukul Kumar (8988227729)\n` +
      `--------------------------------\n` +
      `*Customer:* ${cName}\n` +
      `*Phone:* ${cPhone}\n` +
      `*Address:* ${cAddr}, PIN: ${pin}\n` +
      `--------------------------------\n` +
      `*Items Ordered:*\n${orderItemsSummary}\n` +
      `--------------------------------\n` +
      `*Total to Pay:* ${inr(t.total)}\n` +
      `*Payment Method:* Direct WhatsApp / UPI / COD\n\n` +
      `Please confirm order dispatch. Thank you!`
    );

    try {
      const o = await api('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          coupon: st.code,
          method: 'cod',
          customer: { name: cName, phone: cPhone, address: cAddr, pincode: pin }
        })
      });
      showOrderSuccess(o, true, waText);
    } catch (e) {
      window.open(`https://wa.me/918988227729?text=${waText}`, '_blank');
      showToast('Opening WhatsApp to complete order...');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = T('placeOrder');
    }
    return;
  }

  try {
    const o = await api('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items,
        coupon: st.code,
        method: method === 'online' ? 'online' : 'cod',
        customer: { name: cName, phone: cPhone, address: cAddr, pincode: pin }
      })
    });

    if (method === 'cod') {
      showOrderSuccess(o, false);
      submitBtn.disabled = false;
      submitBtn.textContent = T('placeOrder');
      return;
    }

    new Razorpay({
      key: st.cfg.razorpay_key,
      amount: o.amount,
      currency: 'INR',
      order_id: o.razorpay_order_id,
      name: st.cfg.shop,
      description: 'Order #' + o.order_id,
      prefill: { name: cName, contact: cPhone },
      handler: async res => {
        try {
          await api('/api/payment/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: o.order_id, ...res })
          });
          showOrderSuccess(o, false);
        } catch (e) {
          msg.textContent = e.message;
        }
      }
    }).open();
  } catch (e) {
    msg.textContent = e.message;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = T('placeOrder');
  }
};

// Show Order Success Celebration Modal
function showOrderSuccess(o, isWhatsapp = false, prefillWa = '') {
  cart = {};
  localStorage.cart = '{}';
  renderCart();
  renderProducts();
  closeCart();

  $('#successOrderId').textContent = `Order Reference: #${o.order_id}`;
  $('#successDetailsCard').innerHTML = `
    <div><strong>Payable Amount:</strong> ${inr(o.total)}</div>
    <div><strong>Delivery ETA:</strong> ${o.eta.min}-${o.eta.max} Days (${esc(o.eta.label)})</div>
    <div style="margin-top:6px;color:#15803d">
      Dispatched directly under supervision of <strong>Dr Mukul Kumar</strong> (Mob: 8988227729).
    </div>
  `;

  const waBtn = $('#successWhatsappBtn');
  const waMsg = prefillWa || encodeURIComponent(
    `Hello Dr Mukul Kumar, I have placed Order #${o.order_id} for ${inr(o.total)} on Aashvi Hub. Please confirm my dispatch.`
  );

  waBtn.onclick = () => {
    window.open(`https://wa.me/918988227729?text=${waMsg}`, '_blank');
  };

  $('#closeSuccessBtn').onclick = () => {
    $('#successModal').hidden = true;
  };

  $('#successModal').hidden = false;
  showToast(`Order #${o.order_id} successfully confirmed!`);
}

// ==========================================
// WISHLIST FUNCTIONALITY
// ==========================================
function updateWishlistBadge() {
  const count = wishlist.length;
  const countEl = $('#wishlistCount');
  const modalCountEl = $('#wishlistModalCount');
  if (countEl) countEl.textContent = count;
  if (modalCountEl) modalCountEl.textContent = count;
}

function toggleWishlist(productId) {
  const p = st.products.find(x => x.id === productId);
  if (!p) return;
  const idx = wishlist.findIndex(x => x.id === productId);
  if (idx >= 0) {
    wishlist.splice(idx, 1);
    showToast('Removed from Wishlist', 'info');
  } else {
    wishlist.push({ id: p.id, name: p.name, price: p.price, mrp: p.mrp, image: p.image, unit: p.unit });
    showToast('Added to Wishlist ❤️', 'success');
  }
  localStorage.setItem('aashvi_wishlist', JSON.stringify(wishlist));
  updateWishlistBadge();
  renderProducts();
  renderWishlistModal();
}

function renderWishlistModal() {
  const container = $('#wishlistItemsList');
  if (!container) return;
  if (!wishlist || wishlist.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:36px 16px; color:#64748b;">
        <div style="font-size:44px; margin-bottom:10px;">🤍</div>
        <div style="font-weight:700; font-size:16px; color:#0f172a;">Your Wishlist is Empty</div>
        <p style="font-size:13px; margin-top:4px;">Tap the heart icon on any product to save it here for later.</p>
      </div>
    `;
    return;
  }
  container.innerHTML = wishlist.map(item => `
    <div style="display:flex; align-items:center; gap:12px; padding:12px; border-bottom:1px solid #f1f5f9;">
      <img src="${item.image || 'https://via.placeholder.com/50'}" style="width:48px; height:48px; border-radius:8px; object-fit:cover;">
      <div style="flex:1;">
        <div style="font-weight:700; font-size:13px; color:#0f172a;">${esc(item.name)}</div>
        <div style="font-size:13px; color:#059669; font-weight:700;">₹${item.price} <del style="color:#94a3b8; font-size:11px; margin-left:4px;">₹${item.mrp || ''}</del></div>
      </div>
      <button class="btn-add" style="padding:6px 12px; font-size:12px;" onclick="addWishlistToCart(${item.id})">+ Cart</button>
      <button style="background:none; border:none; cursor:pointer; font-size:18px; color:#ef4444; padding:4px;" onclick="toggleWishlist(${item.id})" title="Remove">✕</button>
    </div>
  `).join('');
}

window.addWishlistToCart = function(id) {
  changeQuantity(id, 1);
  showToast('Moved to Cart 🛍️', 'success');
};

$('#openWishlistBtn')?.addEventListener('click', () => {
  renderWishlistModal();
  $('#wishlistModal').style.display = 'flex';
});

$('#closeWishlistBtn')?.addEventListener('click', () => {
  $('#wishlistModal').style.display = 'none';
});

// ==========================================
// CUSTOMER AUTH FUNCTIONALITY
// ==========================================
function updateCustomerAuthUI() {
  const statusEl = $('#customerAuthStatusText');
  if (!statusEl) return;
  if (customerUser && customerUser.name) {
    statusEl.textContent = 'Hi, ' + customerUser.name.split(' ')[0];
  } else {
    statusEl.textContent = 'Login / Signup';
  }
}

$('#openCustomerAuthBtn')?.addEventListener('click', () => {
  const modal = $('#customerAuthModal');
  const loggedView = $('#customerLoggedInView');
  const loginForm = $('#customerLoginForm');
  const signupForm = $('#customerSignupForm');

  if (customerUser && customerUser.name) {
    $('#customerLoggedInName').textContent = 'Welcome, ' + customerUser.name;
    $('#customerLoggedInPhone').textContent = 'Phone: ' + (customerUser.phone || '');
    loggedView.style.display = 'block';
    loginForm.style.display = 'none';
    signupForm.style.display = 'none';
  } else {
    loggedView.style.display = 'none';
    loginForm.style.display = 'block';
    signupForm.style.display = 'none';
  }
  modal.style.display = 'flex';
});

$('#closeCustomerAuthBtn')?.addEventListener('click', () => {
  $('#customerAuthModal').style.display = 'none';
});

$('#toggleToSignup')?.addEventListener('click', (e) => {
  e.preventDefault();
  $('#authModalTitle').textContent = 'Customer Sign Up';
  $('#customerLoginForm').style.display = 'none';
  $('#customerSignupForm').style.display = 'block';
});

$('#toggleToLogin')?.addEventListener('click', (e) => {
  e.preventDefault();
  $('#authModalTitle').textContent = 'Customer Login';
  $('#customerSignupForm').style.display = 'none';
  $('#customerLoginForm').style.display = 'block';
});

$('#customerLoginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const phone = $('#custLoginPhone').value.trim();
  const password = $('#custLoginPassword').value;
  const alertEl = $('#customerAuthAlert');

  alertEl.style.display = 'none';
  try {
    const res = await api('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password })
    });
    customerUser = res.user;
    localStorage.setItem('customerUser', JSON.stringify(customerUser));
    updateCustomerAuthUI();
    $('#customerAuthModal').style.display = 'none';
    showToast(`Welcome back, ${customerUser.name}!`, 'success');
  } catch (err) {
    alertEl.textContent = err.message || 'Login failed';
    alertEl.style.display = 'block';
  }
});

$('#customerSignupForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#custSignupName').value.trim();
  const phone = $('#custSignupPhone').value.trim();
  const password = $('#custSignupPassword').value;
  const alertEl = $('#customerAuthAlert');

  alertEl.style.display = 'none';
  try {
    const res = await api('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, password })
    });
    customerUser = res.user;
    localStorage.setItem('customerUser', JSON.stringify(customerUser));
    updateCustomerAuthUI();
    $('#customerAuthModal').style.display = 'none';
    showToast(`Account created! Welcome, ${customerUser.name}`, 'success');
  } catch (err) {
    alertEl.textContent = err.message || 'Signup failed';
    alertEl.style.display = 'block';
  }
});

$('#customerLogoutBtn')?.addEventListener('click', () => {
  localStorage.removeItem('customerUser');
  customerUser = null;
  updateCustomerAuthUI();
  $('#customerAuthModal').style.display = 'none';
  showToast('Logged out successfully', 'info');
});

// Logo Click to Reset
$('#logoBtn').onclick = () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// Initialize Application
(async function init() {
  try {
    updateWishlistBadge();
    updateCustomerAuthUI();

    $('#lang').innerHTML = Object.entries(I18N).map(([k, v]) => `
      <option value="${k}">${v._n}</option>
    `).join('');
    $('#lang').value = lang;

    st.cfg = await api('/api/config');
    $('#logo').textContent = st.cfg.shop || 'Aashvi Hub';
    document.title = `${st.cfg.shop} | Owner ${st.cfg.owner_name}`;

    if (!st.cfg.online_payment) {
      const onlineLbl = $('#onlineLbl');
      if (onlineLbl) onlineLbl.hidden = true;
    }

    st.catalog = await api('/api/catalog');
    if (st.catalog.length) {
      st.cat = st.catalog[0].id;
    }

    if (localStorage.pin) {
      checkPin(localStorage.pin).catch(() => {});
    }

    applyLang();
    loadTheme().catch(() => {});
    loadProducts();
  } catch (err) {
    console.error('Initialization error:', err);
  }
})();
