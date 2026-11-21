// ============================================================
// Aashvi Hub - Admin Dashboard Controller
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

  // Quick fill button
  $('#quickFillBtn')?.addEventListener('click', () => {
    $('#usernameInput').value = 'admin';
    $('#passwordInput').value = 'admin123';
  });

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
    $('#addProductModal').classList.add('open');
  });
  $('#closeAddProductBtn')?.addEventListener('click', () => {
    $('#addProductModal').classList.remove('open');
  });
  $('#addProductForm')?.addEventListener('submit', handleAddProduct);

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
    throw new Error(data.error || 'Server error occurred');
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
  loadProducts();
  loadCategories();
  loadSettings();
}

// 1. Load Orders
async function loadOrders() {
  const tbody = $('#ordersTableBody');
  try {
    const orders = await adminApi('/api/admin/orders');
    $('#statOrders').textContent = orders.length;

    const totalRev = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    $('#statRevenue').textContent = '₹' + Math.round(totalRev).toLocaleString('en-IN');

    if (!orders || orders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--text-muted);">No orders found. When customers place orders, they appear here live.</td></tr>`;
      return;
    }

    tbody.innerHTML = orders.map(o => `
      <tr>
        <td><b>#${o.id}</b><br><small style="color:var(--text-muted);">${new Date(o.created_at || Date.now()).toLocaleDateString()}</small></td>
        <td><b>${escapeHtml(o.customer_name || 'Customer')}</b></td>
        <td><a href="tel:${escapeHtml(o.phone)}">${escapeHtml(o.phone)}</a></td>
        <td><small>${escapeHtml(o.address || '')}, ${escapeHtml(o.pincode || '')}</small></td>
        <td><small>${escapeHtml(o.items || o.itemsList?.map(i => `${i.name} x${i.qty}`).join(', ') || 'Item')}</small></td>
        <td><b>₹${Number(o.total || 0).toLocaleString('en-IN')}</b></td>
        <td><span style="text-transform:uppercase; font-size:11px; font-weight:700;">${o.payment_method || 'COD'}</span></td>
        <td>
          <span class="status-badge status-${o.status || 'pending'}">${o.status || 'pending'}</span>
        </td>
        <td>
          <select class="form-control" style="padding:6px; font-size:12px;" onchange="updateOrderStatus(${o.id}, this.value)">
            <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="confirmed" ${o.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
            <option value="shipped" ${o.status === 'shipped' ? 'selected' : ''}>Shipped</option>
            <option value="delivered" ${o.status === 'delivered' ? 'selected' : ''}>Delivered</option>
            <option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    console.error('Error loading orders:', e);
  }
}

// Update Order Status
window.updateOrderStatus = async function(id, status) {
  try {
    await adminApi(`/api/admin/orders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    loadOrders();
  } catch (err) {
    alert('Failed to update status: ' + err.message);
  }
};

// 2. Load Products
async function loadProducts() {
  const tbody = $('#productsTableBody');
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

// Add Product
async function handleAddProduct(e) {
  e.preventDefault();
  const newProd = {
    name: $('#newProdName').value,
    subcategory_id: Number($('#newProdCategory').value),
    price: Number($('#newProdPrice').value),
    mrp: Number($('#newProdMrp').value) || Number($('#newProdPrice').value),
    stock: Number($('#newProdStock').value),
    unit: $('#newProdUnit').value,
    image: $('#newProdImage').value,
    description: $('#newProdDesc').value
  };

  try {
    await adminApi('/api/admin/products', {
      method: 'POST',
      body: JSON.stringify(newProd)
    });
    $('#addProductModal').classList.remove('open');
    $('#addProductForm').reset();
    loadProducts();
  } catch (err) {
    alert('Failed to add product: ' + err.message);
  }
}

// Delete Product
window.deleteProduct = async function(id) {
  if (!confirm('Are you sure you want to remove this product?')) return;
  try {
    await adminApi(`/api/admin/products/${id}`, { method: 'DELETE' });
    loadProducts();
  } catch (err) {
    alert('Failed to delete product: ' + err.message);
  }
};

// 3. Load Categories
async function loadCategories() {
  const tbody = $('#categoriesTableBody');
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

// 4. Load & Save Settings
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
    msg.style.display = 'inline';
    setTimeout(() => { msg.style.display = 'none'; }, 2500);
  } catch (err) {
    alert('Failed to save settings: ' + err.message);
  }
}

// Utility
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
