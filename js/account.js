// ===== ACCOUNT PAGE =====
// Renders the user account page (account.html): order history, profile
// editing, membership status, and (simulated) password change.
// Depends on shared helpers in script.js (loadData, state, etc.) and
// db.js (dbSaveUser, dbGetOrders).

var STATUS_LABELS = {
  pending:'待付款', processing:'处理中',
  shipped:'已发货', completed:'已完成', cancelled:'已取消'
};

// ── Tab switching ──
function switchAcctTab(tab) {
  document.querySelectorAll('.acct-panel').forEach(function(p){ p.classList.remove('active'); });
  document.querySelectorAll('.acct-nav-item').forEach(function(n){ n.classList.remove('active'); });
  document.getElementById('acct-panel-' + tab).classList.add('active');
  var items = document.querySelectorAll('.acct-nav-item');
  var idx = {orders:0, profile:1, membership:2, password:3};
  if (items[idx[tab]]) items[idx[tab]].classList.add('active');
  if (tab === 'orders')     renderAccountOrders();
  if (tab === 'profile')    renderProfile();
  if (tab === 'membership') renderAccountMembership();
}

// ── Bootstrap: called after script.js init completes ──
function initAccountPage() {
  var u = state.currentUser;
  if (!u) {
    document.getElementById('acctNotLoggedIn').style.display = 'block';
    document.getElementById('acctContent').style.display = 'none';
    return;
  }
  document.getElementById('acctNotLoggedIn').style.display = 'none';
  document.getElementById('acctContent').style.display = 'grid';

  // Populate sidebar card
  document.getElementById('acctAvatarLarge').textContent = u.name[0].toUpperCase();
  document.getElementById('acctDisplayName').textContent = u.name;
  document.getElementById('acctDisplayEmail').textContent = u.email || '';
  var tiers = loadMembershipTiers();
  var tier = u.membership ? tiers[u.membership] : null;
  document.getElementById('acctTierBadge').textContent = tier ? tier.label : '非会员';

  renderAccountOrders();
}

// ── 我的订单 ──
function renderAccountOrders() {
  var u = state.currentUser;
  if (!u) return;
  var filter = document.getElementById('acctOrderFilter')
    ? document.getElementById('acctOrderFilter').value : 'all';

  var orders = (state.orders || []).filter(function(o) {
    return !o.isDemo && String(o.userId) === String(u.id);
  });
  if (filter !== 'all') {
    orders = orders.filter(function(o){ return o.status === filter; });
  }

  var container = document.getElementById('acctOrderList');
  if (!orders.length) {
    container.innerHTML = '<div class="empty-orders"><div class="ei">🧾</div><p>暂无订单记录</p></div>';
    return;
  }

  container.innerHTML = orders.map(function(o) {
    var itemsText = o.items.map(function(i){ return i.name + ' ×' + i.qty; }).join('、');
    var statusClass = {
      pending:'os-pending', processing:'os-processing',
      shipped:'os-shipped', completed:'os-completed', cancelled:'os-cancelled'
    }[o.status] || '';
    return '<div class="order-row">' +
      '<div style="flex:1;min-width:0;">' +
        '<div class="order-id">' + o.id + '</div>' +
        '<div class="order-items-text">' + itemsText + '</div>' +
        '<div class="order-meta">' +
          '<span class="order-status ' + statusClass + '">' + (STATUS_LABELS[o.status]||o.status) + '</span>' +
          (o.address ? ' · ' + o.address : '') +
        '</div>' +
      '</div>' +
      '<div class="order-right">' +
        '<div class="order-total">¥' + Number(o.total).toFixed(2) + '</div>' +
        '<div class="order-date">' + fmtAcctDate(o.createdAt) + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function fmtAcctDate(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  return d.getFullYear() + '/' +
    String(d.getMonth()+1).padStart(2,'0') + '/' +
    String(d.getDate()).padStart(2,'0');
}

// ── 个人信息 ──
function renderProfile() {
  var u = state.currentUser;
  if (!u) return;
  document.getElementById('acctName').value = u.name || '';
  document.getElementById('acctEmail').value = u.email || '';
  document.getElementById('acctProvider').value =
    ({email:'邮箱注册', Google:'Google 登录', Apple:'Apple 登录', Facebook:'Facebook 登录'})[u.provider] || u.provider;
  document.getElementById('acctJoined').value = fmtAcctDate(u.createdAt);
}

async function saveProfile() {
  var u = state.currentUser;
  if (!u) return;
  var newName = document.getElementById('acctName').value.trim();
  if (!newName) { toast('姓名不能为空'); return; }
  var updated = Object.assign({}, u, { name: newName });
  try {
    await dbSaveUser(updated);
    state.currentUser = updated;
    // Refresh session
    var stored = localStorage.getItem('oneprime_session_user_id');
    if (stored) localStorage.setItem('oneprime_session_user_id', String(updated.id));
    // Update header display name
    var nd = document.getElementById('userNameDisplay');
    var av = document.getElementById('userAvatar');
    if (nd) nd.textContent = newName;
    if (av) av.textContent = newName[0].toUpperCase();
    document.getElementById('acctDisplayName').textContent = newName;
    document.getElementById('acctAvatarLarge').textContent = newName[0].toUpperCase();
    toast('个人信息已保存 ✓');
  } catch(e) {
    toast('保存失败：' + e.message);
  }
}

// ── 会员状态 ──
function renderAccountMembership() {
  var u = state.currentUser;
  var container = document.getElementById('acctMembershipBody');
  if (!u || !container) return;
  var tiers = loadMembershipTiers();
  var tier = u.membership ? tiers[u.membership] : null;
  var spend = getUserCumulativeSpend(u.id);
  var ordered = getTierOrdered();
  var nextTier = ordered.filter(function(t){
    return t.order > (tier ? tier.order : -1);
  })[0] || null;

  var html = '<div style="display:flex;flex-wrap:wrap;gap:1.5rem;margin-bottom:1.5rem;">';

  html += '<div class="ms-row"><div class="ms-label">当前等级</div><div class="ms-value">' +
    (tier ? tier.label : '非会员') + '</div>' +
    (tier ? '<div style="font-size:.75rem;color:var(--success);margin-top:.2rem;">全场' +
      (tier.discount < 1 ? Math.round((1-tier.discount)*100)+'% OFF' : '普通会员价') + '</div>' : '') +
  '</div>';

  html += '<div class="ms-row"><div class="ms-label">历史累计消费</div><div class="ms-value">¥' + spend.toFixed(2) + '</div></div>';

  if (u.membershipSince) {
    html += '<div class="ms-row"><div class="ms-label">开通时间</div><div class="ms-value" style="font-size:1rem;">' + fmtAcctDate(u.membershipSince) + '</div></div>';
  }
  html += '</div>';

  // Next tier progress
  if (nextTier && nextTier.spendThreshold > 0) {
    var pct = Math.min(100, Math.round(spend / nextTier.spendThreshold * 100));
    var remaining = Math.max(0, nextTier.spendThreshold - spend);
    html += '<div style="background:var(--cream);border-radius:8px;padding:1rem 1.25rem;margin-bottom:1.25rem;">';
    html += '<div style="display:flex;justify-content:space-between;font-size:.8rem;color:var(--text-muted);margin-bottom:.5rem;">';
    html += '<span>距离 <strong style="color:var(--text);">' + nextTier.label + '</strong>（¥' + nextTier.spendThreshold.toLocaleString() + '）</span>';
    html += '<span>还差 <strong style="color:var(--gold);">¥' + remaining.toFixed(2) + '</strong></span>';
    html += '</div>';
    html += '<div style="height:6px;background:rgba(0,0,0,.08);border-radius:3px;overflow:hidden;">';
    html += '<div style="width:' + pct + '%;height:100%;background:var(--gold);border-radius:3px;transition:width .4s;"></div></div></div>';
  }

  // Tier comparison table
  html += '<table style="width:100%;border-collapse:collapse;font-size:.82rem;">';
  html += '<thead><tr style="border-bottom:1px solid rgba(0,0,0,.07);">';
  ['等级','年费','折扣','年度盲盒'].forEach(function(h){
    html += '<th style="text-align:left;padding:.6rem .75rem;font-size:.7rem;color:var(--text-muted);letter-spacing:.05em;">' + h + '</th>';
  });
  html += '</tr></thead><tbody>';
  ordered.forEach(function(t) {
    var isCurrent = tier && tier.key === t.key;
    html += '<tr style="border-bottom:1px solid rgba(0,0,0,.04);' + (isCurrent ? 'background:var(--gold-pale);' : '') + '">';
    html += '<td style="padding:.7rem .75rem;font-weight:' + (isCurrent?'700':'400') + ';">' + t.label + (isCurrent ? ' ✓' : '') + '</td>';
    html += '<td style="padding:.7rem .75rem;">¥' + t.fee + '/年</td>';
    html += '<td style="padding:.7rem .75rem;">' + (t.discount >= 1 ? '普通价' : Math.round((1-t.discount)*100)+'% OFF') + '</td>';
    html += '<td style="padding:.7rem .75rem;">价值 ¥' + t.mysteryBoxValue + '</td>';
    html += '</tr>';
  });
  html += '</tbody></table>';

  if (!tier) {
    html += '<div style="margin-top:1.25rem;">';
    html += '<a href="membership.html" class="acct-save-btn" style="display:inline-block;text-decoration:none;">查看并开通会员 →</a>';
    html += '</div>';
  }

  container.innerHTML = html;
}

// ── 修改密码 (simulated) ──
function changePassword() {
  var cur  = document.getElementById('pwdCurrent').value;
  var nw   = document.getElementById('pwdNew').value;
  var conf = document.getElementById('pwdConfirm').value;
  if (!cur || !nw || !conf) { toast('请填写所有密码字段'); return; }
  if (nw.length < 6)        { toast('新密码至少6位'); return; }
  if (nw !== conf)          { toast('两次输入的新密码不一致'); return; }
  // Simulated — no real auth backend
  toast('密码已更新（模拟）✓');
  document.getElementById('pwdCurrent').value = '';
  document.getElementById('pwdNew').value = '';
  document.getElementById('pwdConfirm').value = '';
}

// ── Init ──
// script.js runs its own async init() which calls loadData() then sets
// state.currentUser. We hook into DOMContentLoaded to run after that,
// but since script.js is async we use a small polling wait just in case.
function waitForStateAndInit(tries) {
  tries = tries || 0;
  // state is set by script.js; give it up to 3s to finish Supabase fetch
  if (typeof state !== 'undefined' && (state.products.length > 0 || tries > 30)) {
    initAccountPage();
  } else if (tries < 60) {
    setTimeout(function(){ waitForStateAndInit(tries + 1); }, 100);
  } else {
    initAccountPage(); // timeout fallback
  }
}

document.addEventListener('DOMContentLoaded', function(){
  waitForStateAndInit();
});
