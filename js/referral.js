// ===== REFERRAL PAGE =====
// Depends on script.js (loaded first): state, onDataReady(), loadCommissionRate(),
// dbGetCommissions(), dbGetReferredUsers(), toast()

// ── Entry point ──
// onDataReady() fires once script.js has finished the Supabase fetch.
onDataReady(function() {
  initReferralPage();
});

async function initReferralPage() {
  var u = state.currentUser;
  var notLogged = document.getElementById('refNotLoggedIn');
  var content   = document.getElementById('refContent');

  if (!u) {
    if (notLogged) notLogged.style.display = 'block';
    if (content)   content.style.display   = 'none';
    return;
  }
  if (notLogged) notLogged.style.display = 'none';
  if (content)   content.style.display   = 'block';

  // Show commission rate
  var rateEl = document.getElementById('refRateDisplay');
  if (rateEl) rateEl.textContent = Math.round(loadCommissionRate() * 100);

  // Build and display referral link
  var refUrl = buildReferralUrl(u.id);
  var linkEl = document.getElementById('refLink');
  if (linkEl) linkEl.textContent = refUrl;

  // Fetch commissions + downlines in parallel
  var results = await Promise.all([
    dbGetCommissions(u.id),
    dbGetReferredUsers(u.id)
  ]);
  var commissions  = results[0];
  var downlines    = results[1];

  renderRefStats(commissions, downlines);
  renderDownlines(downlines, commissions);
  renderCommissionHistory(commissions);
}

// Build the shareable referral URL from the current page's origin + path
function buildReferralUrl(userId) {
  var url  = new URL(window.location.href);
  // Replace current filename (referral.html) with index.html
  var path = url.pathname.replace(/[^/]*$/, 'index.html');
  return url.origin + path + '?ref=' + encodeURIComponent(userId);
}

// ── Copy link ──
function copyReferralLink() {
  var linkEl = document.getElementById('refLink');
  if (!linkEl) return;
  var text = linkEl.textContent;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function() {
      toast('推荐链接已复制到剪贴板 ✓');
    }).catch(fallbackCopy.bind(null, text));
  } else {
    fallbackCopy(text);
  }
}
function fallbackCopy(text) {
  var el = document.createElement('input');
  el.value = text;
  el.style.position = 'fixed';
  el.style.opacity  = '0';
  document.body.appendChild(el);
  el.focus();
  el.select();
  try { document.execCommand('copy'); toast('推荐链接已复制 ✓'); }
  catch (e) { toast('请手动复制上方链接'); }
  document.body.removeChild(el);
}

// ── Stats row ──
function renderRefStats(commissions, downlines) {
  var total = commissions.reduce(function(s, c) { return s + c.commissionAmount; }, 0);

  var elD = document.getElementById('refStatDownlines');
  var elC = document.getElementById('refStatCommission');
  var elO = document.getElementById('refStatOrders');
  if (elD) elD.textContent = downlines.length;
  if (elC) elC.textContent = '¥' + total.toFixed(2);
  if (elO) elO.textContent = commissions.length;
}

// ── Downlines list ──
function renderDownlines(downlines, commissions) {
  var el = document.getElementById('refDownlines');
  if (!el) return;

  if (!downlines.length) {
    el.innerHTML = '<div class="empty-state" style="padding:2.5rem 1rem;">' +
      '<div class="ei">👥</div>' +
      '<p>还没有下线，快分享您的专属链接吧！</p>' +
      '</div>';
    return;
  }

  // Sum commission earned per downline
  var byUser = {};
  commissions.forEach(function(c) {
    var k = String(c.referredUserId);
    byUser[k] = (byUser[k] || 0) + c.commissionAmount;
  });

  el.innerHTML = downlines.map(function(u) {
    var earned = byUser[String(u.id)] || 0;
    var tierLabel = '';
    try {
      var tiers = loadMembershipTiers();
      if (u.membership && tiers[u.membership]) tierLabel = tiers[u.membership].label;
    } catch(e) {}
    return '<div class="downline-row">' +
      '<div class="downline-avatar">' + (u.name ? u.name[0].toUpperCase() : '?') + '</div>' +
      '<div class="downline-info">' +
        '<div class="downline-name">' + escHtml(u.name || '—') + '</div>' +
        '<div class="downline-meta">' + fmtRefDate(u.createdAt) + ' 加入' +
          (tierLabel ? ' · <span class="badge badge-gold">' + tierLabel + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="downline-earned">为您贡献佣金<br><strong>¥' + earned.toFixed(2) + '</strong></div>' +
    '</div>';
  }).join('');
}

// ── Commission history ──
function renderCommissionHistory(commissions) {
  var tableEl = document.getElementById('refHistoryTable');
  var cardsEl = document.getElementById('refHistoryCards');

  if (!commissions.length) {
    var empty = '<div style="padding:2rem;text-align:center;color:var(--text-muted);">暂无佣金记录</div>';
    if (tableEl) tableEl.innerHTML = empty;
    if (cardsEl) cardsEl.innerHTML = '';
    return;
  }

  // Desktop table
  if (tableEl) {
    tableEl.innerHTML =
      '<table>' +
      '<thead><tr>' +
        '<th>下线订单号</th>' +
        '<th>订单金额</th>' +
        '<th>佣金比例</th>' +
        '<th>我的佣金</th>' +
        '<th>时间</th>' +
      '</tr></thead>' +
      '<tbody>' +
      commissions.map(function(c) {
        return '<tr>' +
          '<td style="font-family:monospace;font-size:.75rem;">' + c.orderId + '</td>' +
          '<td>¥' + c.orderTotal.toFixed(2) + '</td>' +
          '<td>' + Math.round(c.commissionRate * 100) + '%</td>' +
          '<td style="font-weight:700;color:var(--gold);">+¥' + c.commissionAmount.toFixed(2) + '</td>' +
          '<td style="font-size:.75rem;color:var(--text-muted);">' + fmtRefDate(c.createdAt) + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>';
  }

  // Mobile cards
  if (cardsEl) {
    cardsEl.innerHTML = commissions.map(function(c) {
      return '<div style="display:flex;justify-content:space-between;align-items:baseline;padding:.8rem 1rem;border-bottom:1px solid rgba(0,0,0,.05);">' +
        '<div>' +
          '<div style="font-family:monospace;font-size:.72rem;color:var(--text-muted);">' + c.orderId + '</div>' +
          '<div style="font-size:.8rem;margin-top:.2rem;">订单 ¥' + c.orderTotal.toFixed(2) + ' · ' + Math.round(c.commissionRate * 100) + '% 佣金</div>' +
          '<div style="font-size:.72rem;color:var(--text-muted);margin-top:.15rem;">' + fmtRefDate(c.createdAt) + '</div>' +
        '</div>' +
        '<div style="font-weight:700;color:var(--gold);font-size:.95rem;white-space:nowrap;">+¥' + c.commissionAmount.toFixed(2) + '</div>' +
      '</div>';
    }).join('');
  }
}

// ── Helpers ──
function fmtRefDate(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  return d.getFullYear() + '/' +
    String(d.getMonth() + 1).padStart(2, '0') + '/' +
    String(d.getDate()).padStart(2, '0');
}
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
