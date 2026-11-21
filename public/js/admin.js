
// ============================================================
// Dependent Subcategory & Variant Stock Matrix Management
// ============================================================
let globalCatalog = [];

async function loadCategoriesForDropdown() {
  try {
    const res = await fetch('/api/catalog');
    globalCatalog = await res.json();
    const catSelect = $('#newProdCategory');
    if (catSelect && globalCatalog && globalCatalog.length) {
      catSelect.innerHTML = '<option value="">-- Select Category --</option>' + 
        globalCatalog.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    }
  } catch (err) {
    console.warn('Could not load catalog for admin dropdown:', err);
  }
}

function handleCategoryChange(catId) {
  const subSelect = $('#newProdSubcategory');
  if (!subSelect) return;
  subSelect.innerHTML = '<option value="">-- Select Subcategory --</option>';
  if (!catId) return;

  const foundCat = globalCatalog.find(c => String(c.id) === String(catId));
  if (foundCat && Array.isArray(foundCat.subs)) {
    subSelect.innerHTML += foundCat.subs.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
  }
}

function renderVariantRow(name = '', stock = 20) {
  const container = $('#variantsContainer');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'variant-matrix-row';
  row.style.cssText = 'display:grid; grid-template-columns:1fr 1fr auto; gap:8px; align-items:center;';
  row.innerHTML = `
    <input type="text" class="form-control var-name" placeholder="Size/Weight (e.g. M, L, 500g)" value="${escapeHtml(name)}" required>
    <input type="number" class="form-control var-stock" placeholder="Stock Qty" min="0" value="${stock}" required>
    <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()" style="padding:6px 10px;">✕</button>
  `;
  container.appendChild(row);
}

function getVariantsPayload() {
  const rows = $$('#variantsContainer .variant-matrix-row');
  const variants = [];
  rows.forEach(r => {
    const name = r.querySelector('.var-name')?.value.trim();
    const stock = Math.max(0, parseInt(r.querySelector('.var-stock')?.value, 10) || 0);
    if (name) variants.push({ name, stock });
  });
  return variants;
}

// ============================================================
// Aashvi Hub - Admin Dashboard Controller
// Founder & Director: Dr Mukul Kumar (Mob: 8988227729)
// ============================================================

const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

let adminToken = localStorage.getItem('adminToken') || '';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  if (adminToken) {
    showDashboard();
  } else {
    showLogin();
  }
});

function setupEventListeners() {
  // Login form submit
  $('#adminLoginForm')?.addEventListener('submit', handleLogin);

  // Logout button
  $('#logoutBtn')?.addEventListener('click', () => {
    localStorage.removeItem('adminToken');
    adminToken = '';
    showLogin();
  });

  // Tabs switching
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.tab-btn').forEach(b => b.classList.remove('active'));
      $$('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const tabId = btn.dataset.tab;
      if ($('#' + tabId)) $('#' + tabId).classList.add('active');
    });
  });

  // Refresh orders
  $('#refreshOrdersBtn')?.addEventListener('click', loadOrders);

  // Add product modal controls
  $('#openAddProductBtn')?.addEventListener('click', () => {
    $('#addProductModal')?.classList.add('open');
    const vCont = $('#variantsContainer');
    if (vCont && vCont.children.length === 0) {
      renderVariantRow('Standard', 20);
    }
  });
  $('#closeAddProductBtn')?.addEventListener('click', () => {
    $('#addProductModal')?.classList.remove('open');
  });
  $('#addProductForm')?.addEventListener('submit', handleAddProduct);
  $('#newProdCategory')?.addEventListener('change', (e) => handleCategoryChange(e.target.value));
  $('#addVariantRowBtn')?.addEventListener('click', () => renderVariantRow('', 10));

  // Add offer modal controls
  $('#openAddOfferBtn')?.addEventListener('click', () => {
    $('#addOfferModal')?.classList.add('open');
  });
  $('#closeAddOfferBtn')?.addEventListener('click', () => {
    $('#addOfferModal')?.classList.remove('open');
  });
  $('#addOfferForm')?.addEventListener('submit', handleAddOffer);

  // Settings form submit
  $('#settingsForm')?.addEventListener('submit', handleSaveSettings);
}

// Show/Hide Screens
function showLogin() {
  $('#loginScreen').style.display = 'flex';
  $('#dashboardScreen').style.display = 'none';
}

function showDashboard() {
  $('#loginScreen').style.display = 'none';
  $('#dashboardScreen').style.display = 'block';
  loadDashboardData();
}

// API Helper with Auth
async function adminApi(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(adminToken ? { 'Authorization': `Bearer ${adminToken}` } : {}),
    ...(options.headers || {})
  };

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !url.includes('/login')) {
      localStorage.removeItem('adminToken');
      showLogin();
    }
    throw new Error(data.error || 'Server request error occurred');
  }
  return data;
}

// Handle Login
async function handleLogin(e) {
  e.preventDefault();
  const username = $('#usernameInput').value.trim();
  const password = $('#passwordInput').value;
  const alertBox = $('#loginAlert');
  const btn = $('#loginBtn');

  alertBox.style.display = 'none';
  btn.textContent = 'Logging in...';
  btn.disabled = true;

  try {
    const data = await adminApi('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });

    if (data.token) {
      adminToken = data.token;
      localStorage.setItem('adminToken', adminToken);
      showDashboard();
    } else {
      throw new Error('Token not received from server');
    }
  } catch (err) {
    alertBox.textContent = err.message || 'Login failed. Please check your credentials.';
    alertBox.style.display = 'block';
  } finally {
    btn.textContent = 'Login to Admin Portal';
    btn.disabled = false;
  }
}

// Load All Dashboard Data
async function loadDashboardData() {
  loadOrders();
  loadOffers();
  loadThemes();
  loadProducts();
  loadCategories();
  loadCategoriesForDropdown();
  loadSettings();
}

// ============================================================
// 1. ORDERS MANAGEMENT & DELIVERY PIN VERIFICATION
// ============================================================
async function loadOrders() {
  const tbody = $('#ordersTableBody');
  if (!tbody) return;
  try {
    const orders = await adminApi('/api/admin/orders');
    $('#statOrders').textContent = orders.length;

    const totalRev = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    $('#statRevenue').textContent = '₹' + Math.round(totalRev).toLocaleString('en-IN');

    if (!orders || orders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--text-muted);">No orders found. When customers place orders, they appear here live.</td></tr>`;
      return;
    }

    tbody.innerHTML = orders.map(o => {
      const orderSt = (o.order_status || o.status || 'Placed');
      const isDelivered = orderSt.toLowerCase() === 'delivered';
      const payMethod = (o.payment_method || 'COD').toUpperCase();
      const payStatus = (o.payment_status || (isDelivered ? 'Paid' : 'Pending'));
      const isPaid = payStatus.toLowerCase() === 'paid';

      return `
        <tr>
          <td>
            <b>#${o.id}</b><br>
            <small style="color:var(--text-muted);">${new Date(o.created_at || Date.now()).toLocaleDateString()}</small>
          </td>
          <td><b>${escapeHtml(o.customer_name || 'Customer')}</b></td>
          <td><a href="tel:${escapeHtml(o.phone)}">${escapeHtml(o.phone)}</a></td>
          <td><small>${escapeHtml(o.address || '')}, ${escapeHtml(o.pincode || '')}</small></td>
          <td><small>${escapeHtml(o.items || o.itemsList?.map(i => `${i.name} x${i.qty}`).join(', ') || 'Item')}</small></td>
          <td><b>₹${Number(o.total || 0).toLocaleString('en-IN')}</b></td>
          <td>
            <span style="font-weight:700; font-size:12px;">${payMethod}</span><br>
            <span class="badge-status" style="margin-top:4px; ${isPaid ? 'background:#dcfce7; color:#15803d;' : 'background:#fef3c7; color:#b45309;'}">
              ${payStatus}
            </span>
          </td>
          <td>
            <select class="form-control" style="padding:6px; font-size:12px; font-weight:600; min-width:110px;" onchange="updateOrderStatus(${o.id}, this.value)">
              <option value="Placed" ${orderSt.toLowerCase() === 'placed' ? 'selected' : ''}>Placed</option>
              <option value="Packed" ${orderSt.toLowerCase() === 'packed' ? 'selected' : ''}>Packed</option>
              <option value="Shipped" ${orderSt.toLowerCase() === 'shipped' ? 'selected' : ''}>Shipped</option>
              <option value="Delivered" ${orderSt.toLowerCase() === 'delivered' ? 'selected' : ''}>Delivered</option>
              <option value="Cancelled" ${orderSt.toLowerCase() === 'cancelled' ? 'selected' : ''}>Cancelled</option>
            </select>
          </td>
          <td>
            ${isDelivered ? `
              <div style="color:#16a34a; font-weight:700; font-size:13px;">✓ Delivered</div>
              <small style="color:var(--text-muted);">PIN: <b>${escapeHtml(o.delivery_pin || '----')}</b></small>
            ` : `
              <div style="display:flex; gap:6px; align-items:center;">
                <input type="text" id="pinInput_${o.id}" maxlength="4" placeholder="4-digit PIN" style="width:85px; padding:6px 8px; font-size:13px; font-weight:700; letter-spacing:2px; text-align:center; border:1.5px solid var(--border); border-radius:6px; outline:none;">
                <button class="btn btn-primary btn-sm" onclick="verifyOrderPin(${o.id})">Verify</button>
              </div>
            `}
          </td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    console.error('Error loading orders:', e);
  }
}

// Verify Delivery PIN (Marks Order as Delivered & Payment as Paid)
window.verifyOrderPin = async function(id) {
  const pinInput = $(`#pinInput_${id}`);
  const pin = (pinInput ? pinInput.value : '').trim();

  if (!pin || pin.length !== 4) {
    alert('Please enter the 4-digit Delivery PIN provided by the customer.');
    if (pinInput) pinInput.focus();
    return;
  }

  try {
    const res = await adminApi(`/api/admin/orders/${id}/verify-pin`, {
      method: 'POST',
      body: JSON.stringify({ pin })
    });
    alert(res.message || '✓ Delivery PIN verified successfully! Order marked as Delivered and Paid.');
    loadOrders();
  } catch (err) {
    alert('Verification Failed: ' + err.message);
  }
};

// Update Order Status via Dropdown
window.updateOrderStatus = async function(id, status) {
  try {
    await adminApi(`/api/admin/orders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, order_status: status })
    });
    loadOrders();
  } catch (err) {
    alert('Failed to update status: ' + err.message);
  }
};

// ============================================================
// 2. OFFERS & PROMO CODES MANAGEMENT
// ============================================================
async function loadOffers() {
  const tbody = $('#offersTableBody');
  if (!tbody) return;
  try {
    const offers = await adminApi('/api/admin/offers');
    if (!offers || offers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--text-muted);">No active offers created yet. Click '+ Add New Offer' above.</td></tr>`;
      return;
    }

    tbody.innerHTML = offers.map(off => `
      <tr>
        <td><b style="letter-spacing:1px; color:var(--primary); font-size:15px;">${escapeHtml(off.code)}</b></td>
        <td><b>${off.discount_percent}% OFF</b></td>
        <td>₹${off.min_order || 0}</td>
        <td>${off.expires_at ? new Date(off.expires_at).toLocaleDateString() : 'No Expiry'}</td>
        <td><span class="badge-status">Active</span></td>
        <td>
          <button class="btn btn-danger btn-sm" onclick="deleteOffer(${off.id})">Delete</button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    console.error('Error loading offers:', e);
  }
}

async function handleAddOffer(e) {
  e.preventDefault();
  const code = $('#newOfferCode').value.trim().toUpperCase();
  const discount_percent = Number($('#newOfferPercent').value);
  const min_order = Number($('#newOfferMinOrder').value) || 0;
  const expires_at = $('#newOfferExpires').value || null;

  try {
    await adminApi('/api/admin/offers', {
      method: 'POST',
      body: JSON.stringify({ code, discount_percent, min_order, expires_at })
    });
    $('#addOfferModal')?.classList.remove('open');
    $('#addOfferForm')?.reset();
    loadOffers();
    alert(`✓ Offer '${code}' created and activated successfully!`);
  } catch (err) {
    alert('Failed to create offer: ' + err.message);
  }
}

window.deleteOffer = async function(id) {
  if (!confirm('Are you sure you want to delete this offer?')) return;
  try {
    await adminApi(`/api/admin/offers/${id}`, { method: 'DELETE' });
    loadOffers();
  } catch (err) {
    alert('Failed to delete offer: ' + err.message);
  }
};

// ============================================================
// 3. THEMES & FESTIVALS MANAGEMENT
// ============================================================
async function loadThemes() {
  const container = $('#themesGrid');
  if (!container) return;
  try {
    const data = await adminApi('/api/admin/themes');
    const currentTheme = data.currentTheme || 'default';
    const themes = data.themes || [];

    container.innerHTML = themes.map(t => {
      const isActive = t.key === currentTheme;
      return `
        <div style="background:var(--card); border:${isActive ? '2px solid var(--primary)' : '1px solid var(--border)'}; border-radius:14px; padding:20px; display:flex; flex-direction:column; justify-content:space-between; box-shadow:0 4px 6px -1px rgba(0,0,0,0.03); position:relative;">
          ${isActive ? `<span style="position:absolute; top:12px; right:12px; background:#dcfce7; color:#15803d; font-size:11px; font-weight:700; padding:3px 8px; border-radius:12px;">Active Now</span>` : ''}
          <div>
            <div style="font-size:32px; margin-bottom:8px;">${t.icon || '✨'}</div>
            <div style="font-family:'Outfit',sans-serif; font-size:17px; font-weight:700; color:var(--dark);">${escapeHtml(t.name)}</div>
            <div style="font-size:13px; color:var(--text-muted); margin:6px 0 16px 0; line-height:1.4;">${escapeHtml(t.desc)}</div>
          </div>
          <button class="btn btn-sm ${isActive ? 'btn-secondary' : 'btn-primary'}" onclick="applyTheme('${t.key}')" ${isActive ? 'disabled' : ''}>
            ${isActive ? '✓ Currently Active' : 'Apply Theme to Store'}
          </button>
        </div>
      `;
    }).join('');
  } catch (e) {
    console.error('Error loading themes:', e);
  }
}

window.applyTheme = async function(themeKey) {
  try {
    const res = await adminApi('/api/admin/theme', {
      method: 'POST',
      body: JSON.stringify({ theme_key: themeKey })
    });
    alert(res.message || `✓ Theme switched to '${themeKey}' successfully!`);
    loadThemes();
  } catch (err) {
    alert('Failed to apply theme: ' + err.message);
  }
};

// ============================================================
// 4. PRODUCTS MANAGEMENT
// ============================================================
async function loadProducts() {
  const tbody = $('#productsTableBody');
  if (!tbody) return;
  try {
    const products = await adminApi('/api/admin/products');
    $('#statProducts').textContent = products.length;

    tbody.innerHTML = products.map(p => `
      <tr>
        <td>
          <img src="${p.image || 'https://via.placeholder.com/40'}" style="width:44px; height:44px; object-fit:cover; border-radius:8px;">
        </td>
        <td><b>${escapeHtml(p.name)}</b><br><small style="color:var(--text-muted);">${p.unit || ''}</small></td>
        <td><b>₹${p.price}</b></td>
        <td><del style="color:var(--text-muted);">₹${p.mrp}</del></td>
        <td>${p.stock}</td>
        <td>
          <span class="badge-status" style="${p.is_available ? '' : 'background:#fee2e2; color:#ef4444;'}">
            ${p.is_available ? 'In Stock' : 'Hidden'}
          </span>
        </td>
        <td>
          <button class="btn btn-danger btn-sm" onclick="deleteProduct(${p.id})">Delete</button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    console.error('Error loading products:', e);
  }
}

async function handleAddProduct(e) {
  e.preventDefault();
  const variants = getVariantsPayload();
  const subcategoryId = Number($('#newProdSubcategory')?.value || $('#newProdCategory')?.value || 1);
  const totalStock = variants.length > 0 ? variants.reduce((s, v) => s + v.stock, 0) : Number($('#newProdStock')?.value || 50);
  const newProd = {
    name: $('#newProdName').value,
    category_id: Number($('#newProdCategory').value) || null,
    subcategory_id: subcategoryId,
    price: Number($('#newProdPrice').value),
    mrp: Number($('#newProdMrp').value) || Number($('#newProdPrice').value),
    stock: totalStock,
    unit: $('#newProdUnit')?.value || 'Standard',
    image: $('#newProdImage').value,
    description: $('#newProdDesc').value,
    variants: variants
  };

  try {
    await adminApi('/api/admin/products', {
      method: 'POST',
      body: JSON.stringify(newProd)
    });
    $('#addProductModal')?.classList.remove('open');
    $('#addProductForm')?.reset();
    loadProducts();
    alert('✓ Product added successfully!');
  } catch (err) {
    alert('Failed to add product: ' + err.message);
  }
}

window.deleteProduct = async function(id) {
  if (!confirm('Are you sure you want to remove this product?')) return;
  try {
    await adminApi(`/api/admin/products/${id}`, { method: 'DELETE' });
    loadProducts();
  } catch (err) {
    alert('Failed to delete product: ' + err.message);
  }
};

// ============================================================
// 5. CATEGORIES
// ============================================================
async function loadCategories() {
  const tbody = $('#categoriesTableBody');
  if (!tbody) return;
  try {
    const cats = await adminApi('/api/admin/categories');
    $('#statCategories').textContent = cats.length;

    tbody.innerHTML = cats.map(c => `
      <tr>
        <td style="font-size:24px;">${c.icon || '🛍️'}</td>
        <td><b>${escapeHtml(c.name)}</b></td>
        <td>Active in Store</td>
        <td><span class="badge-status">Active</span></td>
      </tr>
    `).join('');
  } catch (e) {
    console.error('Error loading categories:', e);
  }
}

// ============================================================
// 6. STORE SETTINGS
// ============================================================
async function loadSettings() {
  try {
    const s = await adminApi('/api/admin/settings');
    if (s.shop_name) $('#settingShopName').value = s.shop_name;
    if (s.owner_phone) $('#settingPhone').value = s.owner_phone;
    if (s.support_email) $('#settingEmail').value = s.support_email;
    if (s.delivery_fee) $('#settingDeliveryFee').value = s.delivery_fee;
    if (s.free_delivery_above) $('#settingFreeDelivery').value = s.free_delivery_above;
    if (s.shop_address) $('#settingAddress').value = s.shop_address;
  } catch (e) {
    console.error('Error loading settings:', e);
  }
}

async function handleSaveSettings(e) {
  e.preventDefault();
  const settingsData = {
    shop_name: $('#settingShopName').value,
    owner_phone: $('#settingPhone').value,
    support_email: $('#settingEmail').value,
    delivery_fee: $('#settingDeliveryFee').value,
    free_delivery_above: $('#settingFreeDelivery').value,
    shop_address: $('#settingAddress').value
  };

  try {
    await adminApi('/api/admin/settings', {
      method: 'POST',
      body: JSON.stringify(settingsData)
    });
    const msg = $('#settingsSavedMsg');
    if (msg) {
      msg.style.display = 'inline';
      setTimeout(() => { msg.style.display = 'none'; }, 2500);
    }
  } catch (err) {
    alert('Failed to save settings: ' + err.message);
  }
}

// Utility
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
