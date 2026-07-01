// ===== ADMIN STATE =====
let fmActive = true;
let selectedProductIds = []; // tracks checked items in the mobile card list for batch actions
let selectedOrderIds = []; // tracks checked order ids for batch status/delete actions
let selectedUserIds = []; // tracks checked user ids for batch membership/delete actions
let userSortKey = 'createdAt';
let userSortDir = 'desc'; // 'asc' | 'desc'

// NOTE: CATS is already defined in script.js, which is loaded before this
// file on admin.html. Re-declaring it here with `const` would throw a
// SyntaxError ("Identifier 'CATS' has already been declared") and prevent
// this entire script from running at all — which previously broke the
// whole admin dashboard silently. We reuse the shared definition instead.

// NOTE: toast(), loadData(), saveProducts(), saveUsers(), and saveOrders()
// are already defined in script.js, which is loaded before this file on
// admin.html. They're intentionally not redefined here to avoid the two
// copies silently drifting out of sync with each other over time.

// ===== UTILITY FUNCTIONS =====
function statusLabel(s) {
  var labels = {pending:'待付款', processing:'处理中', shipped:'已发货', completed:'已完成', cancelled:'已取消'};
  return labels[s] || s;
}

function fmtDate(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  return d.toLocaleDateString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'});
}

// ===== MOBILE NAV =====
function toggleAdminMobileNav() {
  var nav = document.getElementById('adminMobileNav');
  if (!nav) return;
  nav.classList.toggle('open');
}

// ===== ADMIN PANEL =====
function showAdminPanel(name) {
  document.querySelectorAll('.admin-panel').forEach(function(p) {
    p.classList.remove('active');
  });
  document.getElementById('panel-' + name).classList.add('active');
  document.querySelectorAll('.admin-nav-item').forEach(function(i) {
    i.classList.remove('active');
  });
  // Update desktop sidebar active state
  var titles = {dashboard:'数据概览', products:'商品管理', orders:'订单管理', users:'用户管理', revenue:'收入趋势', membership:'会员管理'};
  document.getElementById('adminPageTitle').textContent = titles[name] || name;
  var navItems = document.querySelectorAll('.admin-nav-item');
  var idx = {dashboard:0, products:1, orders:2, users:3, revenue:4, membership:5};
  if (navItems[idx[name]]) navItems[idx[name]].classList.add('active');
  // Update mobile nav active state
  document.querySelectorAll('.admin-mobile-nav-item').forEach(function(item) {
    item.classList.toggle('active', item.getAttribute('data-panel') === name);
  });
  if (name === 'dashboard') refreshAdminDashboard();
  if (name === 'products') renderAdminProducts();
  if (name === 'orders') renderOrders();
  if (name === 'users') renderUsers();
  if (name === 'revenue') renderRevenueChart();
  if (name === 'membership') renderMembershipAdmin();
}

// Jump to 商品管理 pre-filtered to a given category — used by the
// clickable "各分类商品分布" cards on the dashboard (this used to be a
// separate "分类管理" tab; folding it into the dashboard cards removes a
// redundant nav item while keeping the same one-click filtering).
function goToCategoryProducts(catKey) {
  showAdminPanel('products');
  setTimeout(function() {
    var filterEl = document.getElementById('prodCatFilter');
    if (filterEl) {
      filterEl.value = catKey;
      renderAdminProducts();
    }
  }, 50);
}

// ===== DASHBOARD =====
function refreshAdminDashboard() {
  loadData();
  document.getElementById('statProducts').textContent = state.products.length;
  var activeCount = state.products.filter(function(p) { return p.active; }).length;
  document.getElementById('statProductsChange').textContent = '↑ ' + activeCount + ' 款已上架';

  // Demo/sample orders (used only to make the 收入趋势 chart look populated
  // before real order volume builds up) are excluded from the dashboard's
  // real totals — see note in script.js seedDemoRevenueOrders().
  var realOrders = state.orders.filter(function(o) { return !o.isDemo; });
  document.getElementById('statOrders').textContent = realOrders.length;
  document.getElementById('statUsers').textContent = state.users.length;
  var rev = realOrders.filter(function(o) { return o.status === 'completed'; }).reduce(function(s, o) { return s + o.total; }, 0);
  document.getElementById('statRevenue').textContent = '¥' + rev.toFixed(0);
  
  var cg = document.getElementById('catStatsGrid');
  if (cg) {
    cg.innerHTML = Object.keys(CATS).map(function(k) {
      var v = CATS[k];
      var cnt = state.products.filter(function(p) { return p.cat === k; }).length;
      var active = state.products.filter(function(p) { return p.cat === k && p.active; }).length;
      return '<div class="cat-stat-card" onclick="goToCategoryProducts(\'' + k + '\')">' +
        '<div class="cat-stat-icon">' + v.icon + '</div>' +
        '<div class="cat-stat-count">' + cnt + '</div>' +
        '<div class="cat-stat-label">' + v.label + '</div>' +
        '<div class="cat-stat-active">' + active + ' 已上架</div>' +
        '</div>';
    }).join('');
  }
  
  var rb = document.getElementById('recentOrdersBody');
  if (rb) {
    rb.innerHTML = realOrders.slice(0, 5).map(function(o) {
      return '<tr>' +
        '<td style="font-family:monospace;font-size:.75rem;">' + o.id + '</td>' +
        '<td>' + o.userName + '</td>' +
        '<td class="text-gold" style="font-weight:600;">¥' + o.total + '</td>' +
        '<td><span class="order-status os-' + o.status + '">' + statusLabel(o.status) + '</span></td>' +
        '<td style="font-size:.75rem;color:#7A6850;">' + fmtDate(o.createdAt) + '</td>' +
        '</tr>';
    }).join('');
  }
}

// ===== PRODUCT MANAGEMENT =====
function renderAdminProducts() {
  loadData();
  var search = document.getElementById('prodSearch') ? document.getElementById('prodSearch').value.toLowerCase() : '';
  var cat = document.getElementById('prodCatFilter') ? document.getElementById('prodCatFilter').value : 'all';
  var prods = state.products.filter(function(p) {
    var matchSearch = !search || p.name.toLowerCase().indexOf(search) !== -1 || (p.nameEn || '').toLowerCase().indexOf(search) !== -1;
    var matchCat = cat === 'all' || p.cat === cat;
    return matchSearch && matchCat;
  });
  
  var total = prods.length;
  var pp = 10;
  var pages = Math.ceil(total / pp);
  if (state.productPage > pages) state.productPage = 1;
  var start = (state.productPage - 1) * pp;
  var paged = prods.slice(start, start + pp);

  // Desktop table (unchanged) — hidden via CSS on narrow screens in favor
  // of the card list below, since the table needs horizontal scroll to
  // reach 建议零售价/库存/状态/操作 on small viewports.
  var tbody = document.getElementById('adminProductsBody');
  if (tbody) {
    tbody.innerHTML = paged.map(function(p) {
      var imgHtml = p.img ? '<img class="td-img" src="' + p.img + '" alt="">' : '<div class="td-img-ph">' + (CATS[p.cat] ? CATS[p.cat].icon : '📦') + '</div>';
      return '<tr>' +
        '<td>' + imgHtml + '</td>' +
        '<td><div style="font-weight:600;font-size:.85rem;">' + p.name + '</div><div style="font-size:.72rem;color:#7A6850;">' + (p.nameEn || '') + '</div></td>' +
        '<td><span class="badge badge-gold">' + (CATS[p.cat] ? CATS[p.cat].icon : '') + ' ' + (CATS[p.cat] ? CATS[p.cat].label : '') + '</span></td>' +
        '<td style="font-weight:700;color:#C9A84C;">¥' + p.price + '</td>' +
        '<td style="color:#7A6850;">' + (p.origPrice ? '¥' + p.origPrice : '—') + '</td>' +
        '<td>' + p.stock + '</td>' +
        '<td><span class="badge ' + (p.active ? 'badge-green' : 'badge-red') + '">' + (p.active ? '上架中' : '已下架') + '</span></td>' +
        '<td><div class="td-actions">' +
        '<button class="td-btn td-edit" onclick="editProduct(' + p.id + ')">编辑</button>' +
        '<button class="td-btn td-del" onclick="deleteProduct(' + p.id + ')">删除</button>' +
        '</div></td>' +
        '</tr>';
    }).join('');
  }

  renderProductCards(paged);

  var pg = document.getElementById('prodPagination');
  if (pg) {
    var btns = '';
    for (var i = 1; i <= pages; i++) {
      btns += '<button class="page-btn ' + (i === state.productPage ? 'active' : '') + '" onclick="goPage(' + i + ')">' + i + '</button>';
    }
    pg.innerHTML = '<span class="page-info">共 ' + total + ' 件商品</span><div class="page-btns">' + btns + '</div>';
  }
}

// Mobile card list: every field (image, name, category, price, original
// price, stock, status) fits without horizontal scrolling. Tapping a card
// opens it for editing; the checkbox (which stops the tap from bubbling
// to the card) selects it for batch 上架/下架/删除.
function renderProductCards(paged) {
  var container = document.getElementById('productCards');
  if (!container) return;
  // Drop any selected ids that fell off the current filtered/paged view
  var pagedIds = paged.map(function(p){ return p.id; });
  selectedProductIds = selectedProductIds.filter(function(id){ return pagedIds.indexOf(id) !== -1; });

  container.innerHTML = paged.map(function(p) {
    var imgHtml = p.img ? '<img class="pac-img" src="' + p.img + '" alt="">' : '<div class="pac-img-ph">' + (CATS[p.cat] ? CATS[p.cat].icon : '📦') + '</div>';
    var checked = selectedProductIds.indexOf(p.id) !== -1;
    return '<div class="prod-admin-card' + (checked ? ' selected' : '') + '" data-id="' + p.id + '" onclick="handleCardTap(event,' + p.id + ')">' +
      '<input type="checkbox" class="pac-checkbox" ' + (checked ? 'checked' : '') + ' onclick="event.stopPropagation()" onchange="toggleProductSelection(' + p.id + ',this.checked)">' +
      imgHtml +
      '<div class="pac-body">' +
        '<div class="pac-name">' + p.name + '</div>' +
        '<div class="pac-meta">' +
          '<span class="badge badge-gold">' + (CATS[p.cat] ? CATS[p.cat].icon : '') + ' ' + (CATS[p.cat] ? CATS[p.cat].label : '') + '</span>' +
          '<span class="badge ' + (p.active ? 'badge-green' : 'badge-red') + '">' + (p.active ? '上架中' : '已下架') + '</span>' +
        '</div>' +
        '<div class="pac-row">' +
          '<span><span class="pac-price">¥' + p.price + '</span>' + (p.origPrice ? '<span class="pac-orig">¥' + p.origPrice + '</span>' : '') + '</span>' +
          '<span class="pac-stock">库存 ' + p.stock + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  updateBatchBar();
  var selectAllCb = document.getElementById('selectAllCheckbox');
  if (selectAllCb) {
    selectAllCb.checked = paged.length > 0 && selectedProductIds.length === paged.length;
  }
}

// Tapping anywhere on a card except the checkbox opens it for editing —
// matches the "点进去再编辑或删除" request instead of exposing separate
// edit/delete buttons that would crowd the small card.
function handleCardTap(evt, id) {
  editProduct(id);
}

function toggleProductSelection(id, checked) {
  var idx = selectedProductIds.indexOf(id);
  if (checked && idx === -1) selectedProductIds.push(id);
  if (!checked && idx !== -1) selectedProductIds.splice(idx, 1);
  var card = document.querySelector('.prod-admin-card[data-id="' + id + '"]');
  if (card) card.classList.toggle('selected', checked);
  updateBatchBar();
  var selectAllCb = document.getElementById('selectAllCheckbox');
  var totalCards = document.querySelectorAll('.prod-admin-card').length;
  if (selectAllCb) selectAllCb.checked = totalCards > 0 && selectedProductIds.length === totalCards;
}

function toggleSelectAll(checked) {
  var cards = document.querySelectorAll('.prod-admin-card');
  selectedProductIds = [];
  cards.forEach(function(card) {
    var id = parseInt(card.getAttribute('data-id'));
    var cb = card.querySelector('.pac-checkbox');
    if (cb) cb.checked = checked;
    card.classList.toggle('selected', checked);
    if (checked) selectedProductIds.push(id);
  });
  updateBatchBar();
}

function clearSelection() {
  selectedProductIds = [];
  renderAdminProducts();
}

function updateBatchBar() {
  var bar = document.getElementById('batchBar');
  var info = document.getElementById('batchBarInfo');
  if (!bar) return;
  if (selectedProductIds.length > 0) {
    bar.classList.add('show');
    if (info) info.textContent = '已选择 ' + selectedProductIds.length + ' 项';
  } else {
    bar.classList.remove('show');
  }
}

function batchSetActive(active) {
  if (!selectedProductIds.length) return;
  state.products.forEach(function(p) {
    if (selectedProductIds.indexOf(p.id) !== -1) p.active = active;
  });
  saveProducts();
  toast(active ? '已批量上架 ' + selectedProductIds.length + ' 件商品' : '已批量下架 ' + selectedProductIds.length + ' 件商品');
  selectedProductIds = [];
  renderAdminProducts();
}

function batchDelete() {
  if (!selectedProductIds.length) return;
  if (!confirm('确定要删除选中的 ' + selectedProductIds.length + ' 件商品吗？')) return;
  state.products = state.products.filter(function(p) {
    return selectedProductIds.indexOf(p.id) === -1;
  });
  saveProducts();
  toast('已批量删除商品');
  selectedProductIds = [];
  renderAdminProducts();
}

function goPage(n) {
  state.productPage = n;
  selectedProductIds = []; // selection doesn't carry across pages
  renderAdminProducts();
}

// ===== ORDERS =====
function renderOrders() {
  // Demo/sample orders exist only to populate the 收入趋势 chart with a
  // believable 2-year trend — they must never appear in the actual order
  // management list, since an admin could otherwise try to "process" or
  // change the status of a fake order, or mistake it for a real customer.
  var realOrders = state.orders.filter(function(o) { return !o.isDemo; });
  var filter = document.getElementById('orderStatusFilter') ? document.getElementById('orderStatusFilter').value : 'all';
  var search = document.getElementById('orderSearch') ? document.getElementById('orderSearch').value.toLowerCase().trim() : '';
  var orders = filter === 'all' ? realOrders : realOrders.filter(function(o) { return o.status === filter; });
  if (search) {
    orders = orders.filter(function(o) {
      return o.id.toLowerCase().indexOf(search) !== -1 ||
        o.userName.toLowerCase().indexOf(search) !== -1 ||
        o.items.some(function(i){ return i.name.toLowerCase().indexOf(search) !== -1; });
    });
  }

  // Drop any selected order ids that fell out of the current filtered view
  var visibleOrderIds = orders.map(function(o){ return o.id; });
  selectedOrderIds = selectedOrderIds.filter(function(id){ return visibleOrderIds.indexOf(id) !== -1; });

  var tbody = document.getElementById('ordersBody');
  if (tbody) {
    tbody.innerHTML = orders.map(function(o) {
      var checked = selectedOrderIds.indexOf(o.id) !== -1;
      return '<tr>' +
        '<td><input type="checkbox" class="pac-checkbox" ' + (checked?'checked':'') + ' onchange="toggleOrderSelection(\'' + o.id + '\',this.checked)"></td>' +
        '<td style="font-family:monospace;font-size:.75rem;">' + o.id + '</td>' +
        '<td>' + o.userName + '</td>' +
        '<td style="font-size:.78rem;max-width:200px;">' + o.items.map(function(i) { return i.name + '×' + i.qty; }).join('、') + '</td>' +
        '<td style="font-weight:700;color:#C9A84C;">¥' + o.total + '</td>' +
        '<td><span class="order-status os-' + o.status + '">' + statusLabel(o.status) + '</span></td>' +
        '<td style="font-size:.75rem;color:#7A6850;">' + fmtDate(o.createdAt) + '</td>' +
        '<td>' +
        '<select class="filter-select" style="font-size:.72rem;padding:4px 8px;" onchange="updateOrderStatus(\'' + o.id + '\',this.value)">' +
        ['pending','processing','shipped','completed','cancelled'].map(function(s) { return '<option value="' + s + '" ' + (s === o.status ? 'selected' : '') + '>' + statusLabel(s) + '</option>'; }).join('') +
        '</select>' +
        '</td>' +
        '</tr>';
    }).join('');
  }

  // Mobile card view — same data, no horizontal scrolling required; the
  // status dropdown is still right there on the card so it stays usable.
  // Each card also gets a selection checkbox for batch status/delete.
  var cardsContainer = document.getElementById('orderCards');
  if (cardsContainer) {
    cardsContainer.innerHTML = orders.map(function(o) {
      var statusOptions = ['pending','processing','shipped','completed','cancelled'].map(function(s) {
        return '<option value="' + s + '" ' + (s === o.status ? 'selected' : '') + '>' + statusLabel(s) + '</option>';
      }).join('');
      var checked = selectedOrderIds.indexOf(o.id) !== -1;
      return '<div class="order-admin-card' + (checked ? ' selected' : '') + '">' +
        '<div class="oac-top">' +
          '<span style="display:flex;align-items:center;gap:.5rem;"><input type="checkbox" class="pac-checkbox" ' + (checked?'checked':'') + ' onchange="toggleOrderSelection(\'' + o.id + '\',this.checked)"><span class="oac-id">' + o.id + '</span></span>' +
          '<span class="oac-total">¥' + o.total + '</span>' +
        '</div>' +
        '<div class="oac-buyer">' + o.userName + '</div>' +
        '<div class="oac-items">' + o.items.map(function(i) { return i.name + ' ×' + i.qty; }).join('、') + '</div>' +
        '<div class="oac-bottom">' +
          '<span class="order-status os-' + o.status + '">' + statusLabel(o.status) + '</span>' +
          '<span class="oac-time">' + fmtDate(o.createdAt) + '</span>' +
          '<select class="oac-status-select" onchange="updateOrderStatus(\'' + o.id + '\',this.value)">' + statusOptions + '</select>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  updateOrderBatchBar();
  var orderSelectAllCb = document.getElementById('orderSelectAllCheckbox');
  var orderSelectAllCbMobile = document.getElementById('orderSelectAllCheckboxMobile');
  var allOrdersSelected = orders.length > 0 && selectedOrderIds.length === orders.length;
  if (orderSelectAllCb) orderSelectAllCb.checked = allOrdersSelected;
  if (orderSelectAllCbMobile) orderSelectAllCbMobile.checked = allOrdersSelected;
}

function toggleOrderSelection(id, checked) {
  var idx = selectedOrderIds.indexOf(id);
  if (checked && idx === -1) selectedOrderIds.push(id);
  if (!checked && idx !== -1) selectedOrderIds.splice(idx, 1);
  renderOrders();
}

function toggleSelectAllOrders(checked) {
  if (checked) {
    var filter = document.getElementById('orderStatusFilter') ? document.getElementById('orderStatusFilter').value : 'all';
    var search = document.getElementById('orderSearch') ? document.getElementById('orderSearch').value.toLowerCase().trim() : '';
    var realOrders = state.orders.filter(function(o) { return !o.isDemo; });
    var orders = filter === 'all' ? realOrders : realOrders.filter(function(o) { return o.status === filter; });
    if (search) {
      orders = orders.filter(function(o) {
        return o.id.toLowerCase().indexOf(search) !== -1 ||
          o.userName.toLowerCase().indexOf(search) !== -1 ||
          o.items.some(function(i){ return i.name.toLowerCase().indexOf(search) !== -1; });
      });
    }
    selectedOrderIds = orders.map(function(o){ return o.id; });
  } else {
    selectedOrderIds = [];
  }
  renderOrders();
}

function clearOrderSelection() {
  selectedOrderIds = [];
  renderOrders();
}

function updateOrderBatchBar() {
  var bar = document.getElementById('orderBatchBar');
  var info = document.getElementById('orderBatchBarInfo');
  if (!bar) return;
  if (selectedOrderIds.length > 0) {
    bar.classList.add('show');
    if (info) info.textContent = '已选择 ' + selectedOrderIds.length + ' 项';
  } else {
    bar.classList.remove('show');
  }
}

function batchSetOrderStatus() {
  if (!selectedOrderIds.length) return;
  var statusSelect = document.getElementById('orderBatchStatusSelect');
  var status = statusSelect ? statusSelect.value : 'processing';
  state.orders.forEach(function(o) {
    if (selectedOrderIds.indexOf(o.id) !== -1) o.status = status;
  });
  saveOrders();
  toast('已批量更新 ' + selectedOrderIds.length + ' 个订单状态为「' + statusLabel(status) + '」');
  selectedOrderIds = [];
  renderOrders();
  if (document.getElementById('panel-dashboard') && document.getElementById('panel-dashboard').classList.contains('active')) {
    refreshAdminDashboard();
  }
}

function batchDeleteOrders() {
  if (!selectedOrderIds.length) return;
  if (!confirm('确定要删除选中的 ' + selectedOrderIds.length + ' 个订单吗？此操作无法撤销。')) return;
  state.orders = state.orders.filter(function(o) {
    return selectedOrderIds.indexOf(o.id) === -1;
  });
  saveOrders();
  toast('已批量删除订单');
  selectedOrderIds = [];
  renderOrders();
  if (document.getElementById('panel-dashboard') && document.getElementById('panel-dashboard').classList.contains('active')) {
    refreshAdminDashboard();
  }
}

function updateOrderStatus(id, status) {
  var o = state.orders.find(function(x) { return x.id === id; });
  if (o) {
    o.status = status;
    saveOrders();
    toast('订单状态已更新');
    renderOrders();
    if (document.getElementById('panel-dashboard') && document.getElementById('panel-dashboard').classList.contains('active')) {
      refreshAdminDashboard();
    }
  }
}

// ===== USERS =====
function sortUsers(key) {
  if (userSortKey === key) {
    userSortDir = userSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    userSortKey = key;
    userSortDir = 'asc';
  }
  // Update header arrow indicators
  document.querySelectorAll('th.sortable').forEach(function(th) {
    var arrow = th.querySelector('.sort-arrow');
    if (!arrow) return;
    if (th.getAttribute('data-sort') === key) {
      th.classList.add('sort-active');
      arrow.textContent = userSortDir === 'asc' ? '↑' : '↓';
    } else {
      th.classList.remove('sort-active');
      arrow.textContent = '↕';
    }
  });
  renderUsers();
}

function getMembershipLabelForUser(u) {
  if (u.role === 'admin') return '管理员';
  if (!u.membership) return '非会员';
  var tiers = loadMembershipTiers();
  var t = tiers[u.membership];
  return t ? t.label : '非会员';
}

function renderUsers() {
  var search = document.getElementById('userSearch') ? document.getElementById('userSearch').value.toLowerCase().trim() : '';
  var roleFilter = document.getElementById('userRoleFilter') ? document.getElementById('userRoleFilter').value : 'all';

  var users = state.users.slice();

  // Filter by search
  if (search) {
    users = users.filter(function(u) {
      return u.name.toLowerCase().indexOf(search) !== -1 ||
        u.email.toLowerCase().indexOf(search) !== -1;
    });
  }

  // Filter by role/membership
  if (roleFilter !== 'all') {
    users = users.filter(function(u) {
      if (roleFilter === 'admin') return u.role === 'admin';
      if (roleFilter === 'none') return u.role !== 'admin' && !u.membership;
      return u.membership === roleFilter;
    });
  }

  // Sort
  users.sort(function(a, b) {
    var av, bv;
    if (userSortKey === 'name') { av = a.name; bv = b.name; }
    else if (userSortKey === 'email') { av = a.email; bv = b.email; }
    else if (userSortKey === 'provider') { av = a.provider; bv = b.provider; }
    else if (userSortKey === 'status') { av = getMembershipLabelForUser(a); bv = getMembershipLabelForUser(b); }
    else { av = a.createdAt||''; bv = b.createdAt||''; } // createdAt default
    if (av < bv) return userSortDir === 'asc' ? -1 : 1;
    if (av > bv) return userSortDir === 'asc' ? 1 : -1;
    return 0;
  });

  // Drop any selected user ids that fell out of the current filtered view
  var visibleUserIds = users.map(function(u){ return u.id; });
  selectedUserIds = selectedUserIds.filter(function(id){ return visibleUserIds.indexOf(id) !== -1; });

  var tbody = document.getElementById('usersBody');
  if (tbody) {
    tbody.innerHTML = users.map(function(u) {
      var label = getMembershipLabelForUser(u);
      var isAdmin = u.role === 'admin';
      var checked = selectedUserIds.indexOf(u.id) !== -1;
      return '<tr>' +
        '<td><input type="checkbox" class="pac-checkbox" ' + (checked?'checked':'') + ' onchange="toggleUserSelection(' + u.id + ',this.checked)"></td>' +
        '<td style="font-weight:600;">' + u.name + '</td>' +
        '<td style="font-size:.82rem;color:#7A6850;">' + u.email + '</td>' +
        '<td><span class="badge badge-gold">' + u.provider + '</span></td>' +
        '<td style="font-size:.75rem;color:#7A6850;">' + fmtDate(u.createdAt) + '</td>' +
        '<td><span class="badge ' + (isAdmin ? 'badge-gold' : (u.membership ? 'badge-green' : 'badge-red')) + '">' + label + '</span></td>' +
        '</tr>';
    }).join('');
  }

  var cardsContainer = document.getElementById('userCards');
  if (cardsContainer) {
    cardsContainer.innerHTML = users.map(function(u) {
      var label = getMembershipLabelForUser(u);
      var isAdmin = u.role === 'admin';
      var checked = selectedUserIds.indexOf(u.id) !== -1;
      return '<div class="user-admin-card' + (checked ? ' selected' : '') + '">' +
        '<div style="display:flex;align-items:flex-start;gap:.6rem;">' +
          '<input type="checkbox" class="pac-checkbox" style="margin-top:3px;" ' + (checked?'checked':'') + ' onchange="toggleUserSelection(' + u.id + ',this.checked)">' +
          '<div>' +
            '<div class="uac-name">' + u.name + '</div>' +
            '<div class="uac-email">' + u.email + '</div>' +
            '<div class="uac-meta">' +
              '<span class="badge badge-gold">' + u.provider + '</span>' +
              '<span class="badge ' + (isAdmin ? 'badge-gold' : (u.membership ? 'badge-green' : 'badge-red')) + '">' + label + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="uac-date">' + fmtDate(u.createdAt) + '</div>' +
      '</div>';
    }).join('');
  }

  updateUserBatchBar();
  var userSelectAllCb = document.getElementById('userSelectAllCheckbox');
  var userSelectAllCbMobile = document.getElementById('userSelectAllCheckboxMobile');
  // Exclude admins from "select all" eligibility implicitly only in count;
  // admins can still be individually selected but batch membership/delete
  // guard against modifying admin accounts (see batch functions below).
  var allUsersSelected = users.length > 0 && selectedUserIds.length === users.length;
  if (userSelectAllCb) userSelectAllCb.checked = allUsersSelected;
  if (userSelectAllCbMobile) userSelectAllCbMobile.checked = allUsersSelected;
}

function toggleUserSelection(id, checked) {
  var idx = selectedUserIds.indexOf(id);
  if (checked && idx === -1) selectedUserIds.push(id);
  if (!checked && idx !== -1) selectedUserIds.splice(idx, 1);
  renderUsers();
}

function toggleSelectAllUsers(checked) {
  if (checked) {
    // Re-derive the currently visible (filtered/sorted) user id list the
    // same way renderUsers() does, so "select all" only selects what's
    // actually shown on screen.
    var search = document.getElementById('userSearch') ? document.getElementById('userSearch').value.toLowerCase().trim() : '';
    var roleFilter = document.getElementById('userRoleFilter') ? document.getElementById('userRoleFilter').value : 'all';
    var users = state.users.slice();
    if (search) {
      users = users.filter(function(u) {
        return u.name.toLowerCase().indexOf(search) !== -1 || u.email.toLowerCase().indexOf(search) !== -1;
      });
    }
    if (roleFilter !== 'all') {
      users = users.filter(function(u) {
        if (roleFilter === 'admin') return u.role === 'admin';
        if (roleFilter === 'none') return u.role !== 'admin' && !u.membership;
        return u.membership === roleFilter;
      });
    }
    selectedUserIds = users.map(function(u){ return u.id; });
  } else {
    selectedUserIds = [];
  }
  renderUsers();
}

function clearUserSelection() {
  selectedUserIds = [];
  renderUsers();
}

function updateUserBatchBar() {
  var bar = document.getElementById('userBatchBar');
  var info = document.getElementById('userBatchBarInfo');
  if (!bar) return;
  if (selectedUserIds.length > 0) {
    bar.classList.add('show');
    if (info) info.textContent = '已选择 ' + selectedUserIds.length + ' 项';
  } else {
    bar.classList.remove('show');
  }
}

// Batch membership changes and deletes both skip admin accounts even if
// one happens to be checked — an admin's role/account shouldn't be
// silently changed or removed via a bulk action meant for customers.
function batchSetUserMembership() {
  if (!selectedUserIds.length) return;
  var select = document.getElementById('userBatchMembershipSelect');
  var membershipKey = select ? (select.value || null) : null;
  var skippedAdmins = 0;
  var updated = 0;
  state.users.forEach(function(u) {
    if (selectedUserIds.indexOf(u.id) === -1) return;
    if (u.role === 'admin') { skippedAdmins++; return; }
    u.membership = membershipKey;
    updated++;
  });
  saveUsers();
  var label = membershipKey ? (loadMembershipTiers()[membershipKey] ? loadMembershipTiers()[membershipKey].label : membershipKey) : '非会员';
  toast('已批量将 ' + updated + ' 位用户设为「' + label + '」' + (skippedAdmins ? '（已跳过 ' + skippedAdmins + ' 位管理员）' : ''));
  selectedUserIds = [];
  renderUsers();
  if (document.getElementById('panel-dashboard') && document.getElementById('panel-dashboard').classList.contains('active')) {
    refreshAdminDashboard();
  }
}

function batchDeleteUsers() {
  if (!selectedUserIds.length) return;
  var adminCount = state.users.filter(function(u) { return selectedUserIds.indexOf(u.id) !== -1 && u.role === 'admin'; }).length;
  var deletableCount = selectedUserIds.length - adminCount;
  if (!deletableCount) { toast('管理员账户不能通过批量操作删除'); return; }
  if (!confirm('确定要删除选中的 ' + deletableCount + ' 位用户吗？' + (adminCount ? '（管理员账户将被跳过）' : '') + '此操作无法撤销。')) return;
  state.users = state.users.filter(function(u) {
    return !(selectedUserIds.indexOf(u.id) !== -1 && u.role !== 'admin');
  });
  saveUsers();
  toast('已批量删除用户');
  selectedUserIds = [];
  renderUsers();
  if (document.getElementById('panel-dashboard') && document.getElementById('panel-dashboard').classList.contains('active')) {
    refreshAdminDashboard();
  }
}

// ===== REVENUE TREND =====
var revenueRange = 'day'; // 'day' | 'month' | 'year'

function setRevenueRange(range) {
  revenueRange = range;
  document.querySelectorAll('.range-tab').forEach(function(btn) {
    btn.classList.toggle('active', btn.getAttribute('data-range') === range);
  });
  renderRevenueChart();
}

// Groups completed orders (real + demo) into buckets by day/month/year and
// draws a simple line+bar SVG chart. No external charting library is used
// since this project has no build step — plain SVG keeps it dependency-free
// and consistent with how the rest of the admin UI is built.
function renderRevenueChart() {
  loadData();
  var completed = state.orders.filter(function(o) { return o.status === 'completed'; });

  var buckets = {}; // key -> { total, count, isDemo }
  completed.forEach(function(o) {
    var d = new Date(o.createdAt);
    var key;
    if (revenueRange === 'day') key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    else if (revenueRange === 'month') key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    else key = String(d.getFullYear());
    if (!buckets[key]) buckets[key] = { total: 0, count: 0, hasDemo: false, hasReal: false };
    buckets[key].total += o.total;
    buckets[key].count += 1;
    if (o.isDemo) buckets[key].hasDemo = true;
    else buckets[key].hasReal = true;
  });

  var keys = Object.keys(buckets).sort();
  var data = keys.map(function(k) { return { key: k, total: buckets[k].total, count: buckets[k].count, hasDemo: buckets[k].hasDemo, hasReal: buckets[k].hasReal }; });

  renderRevenueSummary(data, completed);
  drawRevenueChartSvg(data);
}

function renderRevenueSummary(data, completedOrders) {
  var el = document.getElementById('revenueSummary');
  if (!el) return;
  var total = data.reduce(function(s, d) { return s + d.total; }, 0);
  var avg = data.length ? total / data.length : 0;
  var peak = data.reduce(function(max, d) { return d.total > max ? d.total : max; }, 0);
  var rangeLabel = revenueRange === 'day' ? '日均' : revenueRange === 'month' ? '月均' : '年均';
  el.innerHTML =
    '<div class="rs-item"><div class="rs-label">区间总收入</div><div class="rs-value">¥' + total.toFixed(0) + '</div></div>' +
    '<div class="rs-item"><div class="rs-label">' + rangeLabel + '收入</div><div class="rs-value">¥' + avg.toFixed(0) + '</div></div>' +
    '<div class="rs-item"><div class="rs-label">单期最高</div><div class="rs-value">¥' + peak.toFixed(0) + '</div></div>';
}

function drawRevenueChartSvg(data) {
  var svg = document.getElementById('revenueChart');
  if (!svg) return;
  if (!data.length) {
    svg.innerHTML = '<text x="400" y="140" text-anchor="middle" font-size="14" fill="#7A6850">暂无收入数据</text>';
    return;
  }

  var W = 800, H = 280, padL = 50, padR = 20, padT = 20, padB = 40;
  var chartW = W - padL - padR, chartH = H - padT - padB;
  var maxVal = Math.max.apply(null, data.map(function(d) { return d.total; })) || 1;
  var n = data.length;
  var stepX = n > 1 ? chartW / (n - 1) : 0;

  // Gridlines + Y-axis labels (4 horizontal bands)
  var grid = '';
  for (var i = 0; i <= 4; i++) {
    var y = padT + chartH - (chartH * i / 4);
    var val = (maxVal * i / 4);
    grid += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="rgba(0,0,0,0.06)" stroke-width="1"/>';
    grid += '<text x="' + (padL - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10" fill="#7A6850">¥' + Math.round(val) + '</text>';
  }

  // Bars (so single-bucket / sparse data is still visible, not just a flat line)
  var bars = '';
  var barW = Math.min(28, chartW / n * 0.5);
  data.forEach(function(d, i) {
    var x = n > 1 ? padL + i * stepX : padL + chartW / 2;
    var barH = (d.total / maxVal) * chartH;
    var y = padT + chartH - barH;
    var fill = d.hasReal ? 'rgba(201,168,76,0.35)' : 'rgba(122,104,80,0.25)';
    bars += '<rect x="' + (x - barW/2) + '" y="' + y + '" width="' + barW + '" height="' + Math.max(barH,1) + '" fill="' + fill + '" rx="2"/>';
  });

  // Line connecting bucket totals
  var points = data.map(function(d, i) {
    var x = n > 1 ? padL + i * stepX : padL + chartW / 2;
    var y = padT + chartH - (d.total / maxVal) * chartH;
    return x + ',' + y;
  }).join(' ');
  var line = '<polyline points="' + points + '" fill="none" stroke="#C9A84C" stroke-width="2.5"/>';

  // Points + x-axis labels (demo buckets get a dashed ring + "示例" label so
  // they're never mistaken for real revenue at a glance)
  var dots = '';
  data.forEach(function(d, i) {
    var x = n > 1 ? padL + i * stepX : padL + chartW / 2;
    var y = padT + chartH - (d.total / maxVal) * chartH;
    var label = formatBucketLabel(d.key);
    dots += '<circle cx="' + x + '" cy="' + y + '" r="4" fill="#C9A84C"' + (d.hasDemo && !d.hasReal ? ' stroke="#7A6850" stroke-width="1.5" stroke-dasharray="2,2"' : '') + '/>';
    // Thin out labels if there are many buckets to avoid overlapping text
    if (n <= 14 || i % Math.ceil(n / 14) === 0) {
      dots += '<text x="' + x + '" y="' + (H - padB + 16) + '" text-anchor="middle" font-size="9" fill="#7A6850">' + label + (d.hasDemo && !d.hasReal ? ' *' : '') + '</text>';
    }
  });

  svg.innerHTML = grid + bars + line + dots +
    '<text x="' + (W - padR) + '" y="' + (H - 6) + '" text-anchor="end" font-size="9" fill="#7A6850" font-style="italic">* 示例数据</text>';
}

function formatBucketLabel(key) {
  if (revenueRange === 'day') {
    var parts = key.split('-');
    return parts[1] + '/' + parts[2];
  }
  if (revenueRange === 'month') {
    var p2 = key.split('-');
    return p2[0] + '年' + p2[1] + '月';
  }
  return key + '年';
}

// ===== PRODUCT FORM =====
function openProductForm() {
  fmActive = true;
  document.getElementById('fmId').value = '';
  document.getElementById('fmName').value = '';
  document.getElementById('fmNameEn').value = '';
  document.getElementById('fmDesc').value = '';
  document.getElementById('fmCat').value = 'wine';
  document.getElementById('fmPrice').value = '';
  document.getElementById('fmOrigPrice').value = '';
  document.getElementById('fmStock').value = '100';
  document.getElementById('fmImgData').value = '';
  document.getElementById('imgPreview').classList.add('hidden');
  document.getElementById('imgPreview').src = '';
  document.getElementById('fmActiveToggle').className = 'toggle on';
  document.getElementById('fmActiveLabel').textContent = '已上架';
  document.getElementById('fmTitle').textContent = '添加商品';
  document.getElementById('productFormModal').classList.remove('hidden');
}

function editProduct(id) {
  var p = state.products.find(function(x) { return x.id === id; });
  if (!p) return;
  fmActive = p.active;
  document.getElementById('fmId').value = p.id;
  document.getElementById('fmName').value = p.name;
  document.getElementById('fmNameEn').value = p.nameEn || '';
  document.getElementById('fmDesc').value = p.desc;
  document.getElementById('fmCat').value = p.cat;
  document.getElementById('fmPrice').value = p.price;
  document.getElementById('fmOrigPrice').value = p.origPrice || '';
  document.getElementById('fmStock').value = p.stock || 0;
  document.getElementById('fmImgData').value = p.img || '';
  if (p.img) {
    document.getElementById('imgPreview').src = p.img;
    document.getElementById('imgPreview').classList.remove('hidden');
  } else {
    document.getElementById('imgPreview').classList.add('hidden');
  }
  document.getElementById('fmActiveToggle').className = 'toggle ' + (p.active ? 'on' : '');
  document.getElementById('fmActiveLabel').textContent = p.active ? '已上架' : '已下架';
  document.getElementById('fmTitle').textContent = '编辑商品';
  document.getElementById('productFormModal').classList.remove('hidden');
}

function closeProductForm() {
  document.getElementById('productFormModal').classList.add('hidden');
}

function toggleActive() {
  fmActive = !fmActive;
  document.getElementById('fmActiveToggle').className = 'toggle ' + (fmActive ? 'on' : '');
  document.getElementById('fmActiveLabel').textContent = fmActive ? '已上架' : '已下架';
}

async function handleImgUpload(e) {
  var file = e.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    toast('图片不能超过5MB');
    return;
  }
  toast('上传中…');
  try {
    var url = await dbUploadImage(file);
    document.getElementById('fmImgData').value = url;
    document.getElementById('imgPreview').src = url;
    document.getElementById('imgPreview').classList.remove('hidden');
    toast('图片上传成功 ✓');
  } catch(err) {
    toast('上传失败：' + err.message);
  }
}

function saveProduct() {
  var name = document.getElementById('fmName').value.trim();
  var price = parseFloat(document.getElementById('fmPrice').value);
  var desc = document.getElementById('fmDesc').value.trim();
  var cat = document.getElementById('fmCat').value;
  if (!name || !price || !desc) {
    toast('请填写商品名称、价格和描述');
    return;
  }
  var id = document.getElementById('fmId').value;
  var origPriceVal = document.getElementById('fmOrigPrice').value;
  var prod = {
    id: id ? parseInt(id) : Date.now(),
    name: name,
    nameEn: document.getElementById('fmNameEn').value.trim(),
    desc: desc,
    cat: cat,
    price: price,
    origPrice: origPriceVal ? parseFloat(origPriceVal) : null,
    stock: parseInt(document.getElementById('fmStock').value) || 0,
    img: document.getElementById('fmImgData').value || '',
    active: fmActive
  };
  if (id) {
    var idx = state.products.findIndex(function(x) { return x.id === prod.id; });
    if (idx > -1) state.products[idx] = prod;
  } else {
    state.products.unshift(prod);
  }
  saveProducts();
  renderAdminProducts();
  closeProductForm();
  toast(id ? '商品已更新 ✓' : '商品已添加 ✓');
}

function deleteProduct(id) {
  if (!confirm('确定要删除该商品吗？')) return;
  state.products = state.products.filter(function(x) { return x.id !== id; });
  saveProducts();
  renderAdminProducts();
  toast('商品已删除');
}

// ===== MEMBERSHIP MANAGEMENT =====
// Admin can edit each tier's annual fee, discount, and the cumulative-
// spend threshold that unlocks (not auto-grants) the option to upgrade.
// The 盲盒礼包 now supports multi-select: admin can tick multiple products,
// but ONLY products whose 普通会员价 (p.price) is strictly below the tier's
// annual fee are shown in the picker — showing expensive items as a gift
// for a cheaper tier would be misleading.
// loadMembershipTiers()/saveMembershipTiers() are defined in script.js
// (loaded before this file), so they're reused here rather than
// duplicated — same pattern as CATS.
function renderMembershipAdmin() {
  loadData();
  var tiers = loadMembershipTiers();
  var ordered = Object.keys(tiers).map(function(k){return tiers[k];}).sort(function(a,b){return a.order-b.order;});

  var grid = document.getElementById('tierAdminGrid');
  if (grid) {
    grid.innerHTML = ordered.map(function(t) {
      // Mystery box product picker: only show products whose 普通会员价
      // (p.price) is strictly less than this tier's annual fee. This
      // prevents, e.g., a ¥999/year 经销商 gift-box containing a product
      // whose 普通会员价 already exceeds that tier's fee (which would be
      // confusing/misleading on the membership page).
      var eligibleProducts = state.products.filter(function(p) {
        return p.active && p.price < t.fee;
      });
      var currentIds = t.mysteryBoxProductIds || [];
      var boxPickerHtml;
      if (!eligibleProducts.length) {
        boxPickerHtml = '<div class="tier-box-picker"><div class="tier-box-picker-empty">暂无普通会员价 &lt; ¥'+t.fee+' 的上架商品</div></div>';
      } else {
        boxPickerHtml = '<div class="tier-box-picker">' +
          eligibleProducts.map(function(p) {
            var checked = currentIds.indexOf(p.id) !== -1;
            return '<label class="tier-box-picker-item">' +
              '<input type="checkbox" data-tier="'+t.key+'" data-pid="'+p.id+'" '+(checked?'checked':'')+' onchange="syncBoxSelection(\''+t.key+'\')">' +
              p.name + '（¥'+p.price+'）' +
              '</label>';
          }).join('') +
          '</div>';
      }
      return '<div class="tier-admin-card">' +
        '<h4>'+t.label+'</h4>' +
        '<div class="tier-admin-field"><label>年费（元）</label><input type="number" min="0" step="1" id="tierFee-'+t.key+'" value="'+t.fee+'"></div>' +
        '<div class="tier-admin-field"><label>折扣（例如 0.9 表示9折，1 表示无折扣）</label><input type="number" min="0" max="1" step="0.01" id="tierDiscount-'+t.key+'" value="'+t.discount+'"></div>' +
        '<div class="tier-admin-field"><label>累计消费门槛（元，达到后可补差价升级；0 表示入门级随时可开通）</label><input type="number" min="0" step="100" id="tierThreshold-'+t.key+'" value="'+t.spendThreshold+'"></div>' +
        '<div class="tier-admin-field"><label>🎁 年度盲盒礼包商品（多选，仅显示普通会员价 &lt; ¥'+t.fee+' 的商品）</label>'+boxPickerHtml+'</div>' +
        '<div class="tier-admin-field"><label>盲盒礼包宣传价值（元，显示给会员看的"价值¥X"）</label><input type="number" min="0" step="1" id="tierBoxValue-'+t.key+'" value="'+t.mysteryBoxValue+'"></div>' +
        '<button class="admin-btn admin-btn-gold tier-admin-save" onclick="saveMembershipTierEdit(\''+t.key+'\')">保存'+t.label+'设置</button>' +
        '</div>';
    }).join('');
  }

  var statsBody = document.getElementById('membershipStatsBody');
  if (statsBody) {
    statsBody.innerHTML = ordered.map(function(t) {
      var count = state.users.filter(function(u){return u.membership===t.key;}).length;
      var selectedProducts = (t.mysteryBoxProductIds||[]).map(function(pid){
        return state.products.find(function(p){return p.id===pid;});
      }).filter(Boolean);
      var boxLabel = selectedProducts.length
        ? selectedProducts.map(function(p){return p.name;}).join('、') + ' · ¥'+t.mysteryBoxValue
        : '（未指定商品）· ¥'+t.mysteryBoxValue;
      return '<tr>' +
        '<td style="font-weight:600;">'+t.label+'</td>' +
        '<td>¥'+t.fee+'/年</td>' +
        '<td>'+(t.discount>=1 ? '无折扣' : Math.round((1-t.discount)*100)+'% OFF') +'</td>' +
        '<td style="font-size:.78rem;">'+boxLabel+'</td>' +
        '<td>'+count+' 人</td>' +
        '</tr>';
    }).join('');
  }
}

// Called whenever a checkbox in a tier's mystery-box picker is toggled —
// reads all checked checkboxes for that tier immediately (no "save" needed
// just to confirm the selection, since save still commits to localStorage).
function syncBoxSelection(tierKey) {
  // This just syncs the checkbox state visually; the actual ids are read
  // fresh from the DOM when the "保存" button is clicked.
}

function saveMembershipTierEdit(tierKey) {
  var tiers = loadMembershipTiers();
  var t = tiers[tierKey];
  if (!t) { toast('会员等级不存在'); return; }

  var feeEl = document.getElementById('tierFee-'+tierKey);
  var discountEl = document.getElementById('tierDiscount-'+tierKey);
  var thresholdEl = document.getElementById('tierThreshold-'+tierKey);
  var boxValueEl = document.getElementById('tierBoxValue-'+tierKey);

  var fee = parseFloat(feeEl.value);
  var discount = parseFloat(discountEl.value);
  var threshold = parseFloat(thresholdEl.value);
  var boxValue = parseFloat(boxValueEl.value);

  if (isNaN(fee) || fee < 0) { toast('请输入有效的年费'); return; }
  if (isNaN(discount) || discount < 0 || discount > 1) { toast('折扣必须在 0 到 1 之间'); return; }
  if (isNaN(threshold) || threshold < 0) { toast('消费门槛必须为非负数'); return; }
  if (isNaN(boxValue) || boxValue < 0) { toast('盲盒价值必须为非负数'); return; }

  // Collect multi-select product ids from all checked checkboxes for this tier
  var checkedBoxes = document.querySelectorAll('input[data-tier="'+tierKey+'"]:checked');
  var boxProductIds = [];
  checkedBoxes.forEach(function(cb) {
    var pid = parseInt(cb.getAttribute('data-pid'));
    if (!isNaN(pid)) boxProductIds.push(pid);
  });

  tiers[tierKey] = Object.assign({}, t, {
    fee: fee,
    discount: discount,
    spendThreshold: threshold,
    mysteryBoxProductIds: boxProductIds,
    mysteryBoxValue: boxValue
  });
  saveMembershipTiers(tiers);
  renderMembershipAdmin();
  toast(t.label+' 设置已保存');
}

// ===== LOGOUT =====
function logout() {
  if (confirm('确定要退出后台吗？')) {
    window.location.href = 'index.html';
  }
}

// ===== INIT =====
loadData();
// Set default state
window.state = window.state || {};
state.productPage = state.productPage || 1;
state.revenueRange = state.revenueRange || 'day';
refreshAdminDashboard();
renderAdminProducts();
renderOrders();
renderUsers();
