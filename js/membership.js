// ===== MEMBERSHIP PAGE =====
// Renders the public membership benefits page (membership.html): tier
// comparison cards, the logged-in user's current status, and the
// (simulated) upgrade buttons. Relies on the shared helpers defined in
// script.js: loadMembershipTiers(), getUserCumulativeSpend(),
// getEligibleTierBySpend(), getUpgradeCost(), purchaseMembership().

function refreshMembershipPage(){
  renderMembershipStatus();
  renderTierGrid();
}

function renderMembershipStatus(){
  var el = document.getElementById('membershipStatus');
  if(!el) return;
  var u = state.currentUser;
  if(!u){
    el.style.display='none';
    return;
  }
  el.style.display='block';
  var tiers = loadMembershipTiers();
  var current = u.membership ? tiers[u.membership] : null;
  var spend = getUserCumulativeSpend(u.id);
  var eligible = getEligibleTierBySpend(u.id);

  var html = '<div class="ms-inner">';
  html += '<div class="ms-row">';
  html += '<div class="ms-label">当前等级</div>';
  html += '<div class="ms-value">'+(current ? current.label : '非会员') + (current ? ' <span class="ms-discount">'+Math.round((1-current.discount)*100)+'% OFF</span>' : '') + '</div>';
  html += '</div>';
  html += '<div class="ms-row">';
  html += '<div class="ms-label">历史累计消费</div>';
  html += '<div class="ms-value">¥'+spend.toFixed(2)+'</div>';
  html += '</div>';
  // Only surface the "you qualify, upgrade now" banner for a tier that
  // (a) actually has a spend threshold above zero (the entry-level 普通会员
  // has spendThreshold:0, which trivially "qualifies" everyone including
  // brand-new users with ¥0 spend — that's not a meaningful achievement
  // worth a congratulatory banner) and (b) is better than what the user
  // already holds.
  if(eligible && eligible.spendThreshold>0 && (!current || eligible.order>current.order)){
    html += '<div class="ms-eligible">🎉 您的累计消费已达到 <strong>'+eligible.label+'</strong> 标准，可补差价升级！</div>';
  } else {
    var nextInfo = getAmountToNextTier(u);
    if(nextInfo){
      html += '<div class="ms-eligible ms-next-tier">📈 距离 <strong>'+nextInfo.tier.label+'</strong>（累计消费满 ¥'+nextInfo.tier.spendThreshold.toLocaleString()+'）还差 <strong>¥'+nextInfo.remaining.toFixed(2)+'</strong></div>';
    }
  }
  html += '</div>';
  el.innerHTML = html;
}

function renderTierGrid(){
  var grid = document.getElementById('tierGrid');
  if(!grid) return;
  var tiers = loadMembershipTiers();
  var ordered = Object.keys(tiers).map(function(k){return tiers[k];}).sort(function(a,b){return a.order-b.order;});
  var u = state.currentUser;
  var current = u && u.membership ? tiers[u.membership] : null;
  var eligible = u ? getEligibleTierBySpend(u.id) : null;

  grid.innerHTML = ordered.map(function(t){
    var isCurrent = current && current.key===t.key;
    var canAfford = !current || t.order > current.order;
    // Same fix as renderMembershipStatus: don't treat trivially qualifying
    // for the zero-threshold entry tier as a "spend achievement" worth a
    // note — only meaningful for tiers with a real spend requirement.
    var qualifiesBySpend = eligible && t.spendThreshold>0 && eligible.order >= t.order;
    var cost = u ? getUpgradeCost(t.key) : t.fee;

    var badge = '';
    if(isCurrent) badge = '<div class="tier-badge tier-badge-current">当前等级</div>';
    else if(t.order===2) badge = '<div class="tier-badge tier-badge-top">尊享折扣最高</div>';

    var actionHtml;
    if(!u){
      actionHtml = '<button class="tier-cta" onclick="openAuthModal()">登录后开通</button>';
    } else if(isCurrent){
      actionHtml = '<button class="tier-cta tier-cta-disabled" disabled>已是当前等级</button>';
    } else if(!canAfford){
      actionHtml = '<button class="tier-cta tier-cta-disabled" disabled>已拥有更高等级</button>';
    } else {
      var label = current ? '补差价 ¥'+cost+' 升级' : '开通会员 ¥'+cost;
      actionHtml = '<button class="tier-cta" onclick="purchaseMembership(\''+t.key+'\')">'+label+'</button>';
      if(qualifiesBySpend){
        actionHtml += '<div class="tier-qualify-note">✓ 您的消费记录已符合该等级标准</div>';
      }
    }

    // Multi-select mystery box: show the names of all selected products
    // (or a generic "价值¥X" if none have been configured yet).
    var mysteryBoxText = '年度盲盒礼包（价值 ¥'+t.mysteryBoxValue+'）';
    var boxIds = t.mysteryBoxProductIds || [];
    if(boxIds.length > 0){
      var boxProds = boxIds.map(function(pid){
        return state.products.find(function(p){return p.id===pid;});
      }).filter(Boolean);
      if(boxProds.length){
        mysteryBoxText = '年度盲盒礼包：<strong>'+boxProds.map(function(p){return p.name;}).join('、')+'</strong>（价值 ¥'+t.mysteryBoxValue+'）';
      }
    }

    var perks = [
      t.discount>=1 ? '普通会员价购买全场商品' : '全场商品享 <strong>'+Math.round((1-t.discount)*100)+'%</strong> 折扣（在普通会员价基础上）',
      '🎁 '+mysteryBoxText,
      t.spendThreshold>0 ? '累计消费满 ¥'+t.spendThreshold.toLocaleString()+' 可补差价升级至此等级' : '入门等级，随时可开通',
      '会员折扣登录后自动应用于商品价格与结算'
    ];

    return '<div class="tier-card '+(isCurrent?'tier-card-current':'')+'">'+
      badge+
      '<div class="tier-name">'+t.label+'</div>'+
      '<div class="tier-price"><span class="tier-price-num">¥'+t.fee+'</span><span class="tier-price-unit">/ 年</span></div>'+
      '<ul class="tier-perks">'+perks.map(function(p){return '<li>'+p+'</li>';}).join('')+'</ul>'+
      actionHtml+
      '</div>';
  }).join('');
}

// ===== INIT =====
// script.js's own INIT block guards on #shopScreen, which membership.html
// also has (for header reuse), so it will run initData() + try to show
// the shop screen — but membership.html lacks #homeProductGrid, which is
// already guarded inside showShopScreen(). We still need our own init
// here for the tier grid and status banner.
document.addEventListener('DOMContentLoaded', function(){
  refreshMembershipPage();
});
// In case this script runs after DOMContentLoaded already fired (script
// is loaded at the end of <body>, so this is the common case in practice).
if(document.readyState==='complete' || document.readyState==='interactive'){
  refreshMembershipPage();
}
