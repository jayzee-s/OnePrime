// ===== STATE =====
let state = {
  currentUser: null,
  isAdmin: false,
  cart: [],
  products: [],
  orders: [],
  users: [],
  currentCategory: null,
  currentFilter: 'all',
  editingProductId: null,
  productPage: 1,
  productsPerPage: 10,
  pendingCheckout: false, // set when a guest clicks 去结算 — login first, then continue to checkout
};

const CATS = {
  wine:   {label:'红酒',en:'AUSTRALIAN RED WINE',icon:'🍷',sub:'慕易庄园原瓶进口 · 全程溯源'},
  health: {label:'大健康保健品',en:'HEALTH SUPPLEMENTS',icon:'💊',sub:'澳洲顶级品牌授权 · 功效保证'},
  beauty: {label:'美妆护肤',en:'BEAUTY & SKINCARE',icon:'✨',sub:'天然原料 · 科学配方'},
  food:   {label:'功能性食品',en:'FUNCTIONAL FOODS',icon:'🌿',sub:'营养均衡 · 健康生活'},
};

// ===== MEMBERSHIP TIERS =====
// Three paid annual tiers. Advancement is based ONLY on the member's own
// purchases with this store — either paying the fee difference outright,
// or reaching a personal cumulative-spend threshold which unlocks the
// option to pay the difference and upgrade (it does not auto-upgrade for
// free, and it is never based on recruiting other members). Editable from
// the admin portal (fee / discount / spend threshold / 盲盒 gift per tier).
// mysteryBoxProductIds is an array of product ids in the catalog that are
// given as the tier's annual 盲盒礼包 gift pool — admin can multi-select
// from products whose 普通会员价 (price) is below the tier's annual fee,
// via the 会员管理 panel. mysteryBoxValue is the advertised gift value
// shown to members (defaults to matching the tier's annual fee, since
// that's what was specified, but kept editable separately in case it
// should diverge).
const DEFAULT_MEMBERSHIP_TIERS = {
  normal:    {key:'normal',   label:'普通会员', fee:199, discount:1,    spendThreshold:0,     order:0, mysteryBoxProductIds:[], mysteryBoxValue:199},
  manager:   {key:'manager',  label:'掌柜',     fee:399, discount:0.9,  spendThreshold:10000, order:1, mysteryBoxProductIds:[], mysteryBoxValue:399},
  dealer:    {key:'dealer',   label:'经销商',   fee:999, discount:0.8,  spendThreshold:50000, order:2, mysteryBoxProductIds:[], mysteryBoxValue:999},
};

// In-memory cache populated once from Supabase (settings table, key
// 'membership_tiers') during page init — see loadMembershipTiersFromDB()
// below. loadMembershipTiers() itself stays SYNCHRONOUS because dozens of
// call sites across script.js/membership.js/account.js/admin.js call it
// inline while rendering; making it async would require converting all of
// those to async/await. Falls back to defaults before the cache is ready
// (very first paint) or if the Supabase fetch ever fails.
var _membershipTiersCache = null;

function loadMembershipTiers(){
  if(_membershipTiersCache) return _membershipTiersCache;
  return JSON.parse(JSON.stringify(DEFAULT_MEMBERSHIP_TIERS));
}

// Fetches the real tier config from Supabase once at page load, so every
// visitor — not just the admin's own browser — sees whatever the admin has
// configured (previously this lived in localStorage, so admin edits only
// ever applied to the admin's own device). Missing/legacy fields are
// backfilled against DEFAULT_MEMBERSHIP_TIERS the same way the old
// localStorage migration used to.
async function loadMembershipTiersFromDB(){
  try{
    var raw = await dbGetSetting('membership_tiers');
    var parsed = raw ? JSON.parse(raw) : {};
    var tiers = {};
    Object.keys(DEFAULT_MEMBERSHIP_TIERS).forEach(function(k){
      tiers[k] = Object.assign({}, DEFAULT_MEMBERSHIP_TIERS[k], parsed[k]||{});
      if(tiers[k].mysteryBoxProductIds===undefined) tiers[k].mysteryBoxProductIds=[];
    });
    _membershipTiersCache = tiers;
  }catch(e){
    console.warn('loadMembershipTiersFromDB failed, using defaults:', e);
    _membershipTiersCache = JSON.parse(JSON.stringify(DEFAULT_MEMBERSHIP_TIERS));
  }
  return _membershipTiersCache;
}

// Persists an edited tier config to Supabase (write is admin-only per RLS:
// settings_admin_write) and updates the in-memory cache immediately so the
// change is reflected on this page without a reload. Throws on failure so
// callers (admin.js) can show an error instead of silently no-oping.
async function saveMembershipTiers(tiers){
  await dbSetSetting('membership_tiers', JSON.stringify(tiers));
  _membershipTiersCache = tiers;
}
// ===== REFERRAL / COMMISSION HELPERS =====
// Commission rate depends on the REFERRER's own membership tier — set by
// admin per-tier in Supabase (settings keys commission_rate_normal /
// commission_rate_manager / commission_rate_dealer). Shared by the actual
// commission calculation (recordReferralCommission) and the referral
// page's displayed rate, so the two can never disagree.
async function getCommissionRateForTier(tierKey){
  var rateStr=null;
  try{ rateStr=await dbGetSetting('commission_rate_'+(tierKey||'normal')); }catch(e){}
  if(!rateStr){ try{ rateStr=await dbGetSetting('commission_rate_normal'); }catch(e){} }
  return rateStr?parseFloat(rateStr):0.03;
}

// Called on every page load: stash ?ref= in sessionStorage for registration.
function checkRefParam(){
  try {
    var ref = new URLSearchParams(window.location.search).get('ref');
    if(ref) sessionStorage.setItem('oneprime_pending_ref', ref);
  } catch(e){}
}

// onDataReady hook — page-specific scripts (referral.js) wait here.
var _dataReadyCallbacks = [];
var _dataReady = false;
function onDataReady(fn){
  if(_dataReady) fn();
  else _dataReadyCallbacks.push(fn);
}
function _fireDataReady(){
  _dataReady = true;
  _dataReadyCallbacks.forEach(function(fn){ try{ fn(); }catch(e){ console.error(e); } });
}


function getTierOrdered(){
  var tiers = loadMembershipTiers();
  return Object.keys(tiers).map(function(k){return tiers[k];}).sort(function(a,b){return a.order-b.order;});
}

// A user with no membership at all (never paid) gets no discount — this is
// distinct from "普通会员", which is the lowest *paid* tier. Browsing and
// buying without ever joining is always allowed at full price.
function getUserDiscount(user){
  if(!user || !user.membership) return 1;
  var tiers = loadMembershipTiers();
  var t = tiers[user.membership];
  return t ? t.discount : 1;
}

function getUserMembershipLabel(user){
  if(!user || !user.membership) return '非会员';
  var tiers = loadMembershipTiers();
  var t = tiers[user.membership];
  return t ? t.label : '非会员';
}

// Cumulative spend only counts completed, non-demo orders tied to this
// user's id — mirrors the same real/demo distinction used in the admin
// dashboard's revenue figures.
function getUserCumulativeSpend(userId){
  if(!userId) return 0;
  // Read from state.orders which is loaded from Supabase via loadData()
  return (state.orders||[])
    .filter(function(o){ return String(o.userId)===String(userId) && !o.isDemo; })
    .reduce(function(s,o){ return s+o.total; }, 0);
}

// Returns the highest tier (by spend threshold) the user qualifies for
// based on cumulative spend alone — used to show "您已可补差价升级到X"
// without ever auto-upgrading or charging automatically.
function getEligibleTierBySpend(userId){
  var spend = getUserCumulativeSpend(userId);
  var ordered = getTierOrdered();
  var eligible = null;
  ordered.forEach(function(t){
    if(spend >= t.spendThreshold) eligible = t;
  });
  return eligible;
}

// ===== TIERED PRICE BREAKDOWN =====
// Builds the full 建议零售价 -> 普通会员参考价 -> 用户当前等级价 breakdown
// for a single product. 建议零售价 (p.origPrice) is purely an illustrative
// reference number — it is NEVER the price anyone is actually charged.
// Anyone who completes a purchase is, at minimum, charged the 普通会员价
// (p.price) — that is the real floor price for the site, regardless of
// whether the shopper has actually paid for a membership tier yet. A paid
// tier above 普通会员 only ever discounts further from that floor.
function getPriceBreakdown(retailPrice, user){
  var tiers = loadMembershipTiers();
  var ordered = getTierOrdered();
  var normalTier = ordered.length ? ordered[0] : null; // order:0, always the baseline reference
  var normalPrice = normalTier ? Math.round(retailPrice*normalTier.discount*100)/100 : retailPrice;

  var currentTier = (user && user.membership) ? tiers[user.membership] : null;
  // Even a guest/non-member is always charged at least 普通会员价
  // (normalPrice) — 建议零售价 is shown elsewhere purely as a reference
  // "MSRP" line, never as something anyone actually pays.
  var currentPrice = currentTier ? Math.round(retailPrice*currentTier.discount*100)/100 : normalPrice;

  // "Previous tier" for the savings-vs-previous-tier line: the tier one
  // order below the user's current tier (e.g. 经销商's previous is 掌柜,
  // 掌柜's previous is 普通会员). Only relevant when the user actually
  // holds a tier above the baseline.
  var previousTier = null;
  if(currentTier && currentTier.order>0){
    previousTier = ordered.filter(function(t){return t.order===currentTier.order-1;})[0] || normalTier;
  }
  var previousPrice = previousTier ? Math.round(retailPrice*previousTier.discount*100)/100 : normalPrice;
  var savingsVsPrevious = previousTier && currentTier && currentTier.order>0 ? Math.round((previousPrice-currentPrice)*100)/100 : 0;

  return {
    retailPrice: retailPrice,
    normalTier: normalTier,
    normalPrice: normalPrice,       // the real floor price everyone pays at minimum
    currentTier: currentTier,       // null if user holds no paid membership at all
    currentPrice: currentPrice,     // what the user is ACTUALLY charged — equals normalPrice if no paid membership above 普通会员
    previousTier: previousTier,
    previousPrice: previousPrice,
    savingsVsPrevious: savingsVsPrevious,
    hasPaidTierAboveNormal: !!(currentTier && currentTier.order>0)
  };
}

// How much more cumulative spend is needed to qualify for the NEXT tier
// above the user's current one — used on the membership page, cart, and
// checkout per explicit instruction. Returns null if there's no higher
// tier, or if the user already qualifies for the highest tier.
function getAmountToNextTier(user){
  if(!user) return null;
  var tiers = loadMembershipTiers();
  var ordered = getTierOrdered();
  var current = user.membership ? tiers[user.membership] : null;
  var currentOrder = current ? current.order : -1;
  var next = ordered.filter(function(t){return t.order===currentOrder+1;})[0];
  if(!next) return null;
  var spend = getUserCumulativeSpend(user.id);
  var remaining = next.spendThreshold - spend;
  if(remaining<=0) return null; // already qualifies — handled by the "可补差价升级" messaging instead
  return {tier: next, remaining: Math.round(remaining*100)/100, spend: spend};
}

// ===== INIT DATA =====
// Historically seeded sample products/users/orders into localStorage here.
// Everything now comes from Supabase (see loadData() below), so that
// seed data was dead code — nothing ever read those localStorage keys back.
// Demo revenue-chart orders (isDemo:true) now live directly in the
// Supabase `orders` table instead of being generated client-side.
function initData(){
  return loadData();
}

async function loadData() {
  state.products = await dbGetProducts();
  state.orders  = await dbGetOrders();
  state.users   = await dbGetUsers();
}

// ===== SESSION PERSISTENCE =====
// state.currentUser is just an in-memory JS variable, which resets to
// null on every page load/navigation/refresh — this was a pre-existing
// gap (logging in and simply refreshing the page already logged you out)
// that became disruptive once registration needed to redirect to a
// separate page (membership.html) while staying logged in. We persist
// only the user's id (not the whole object, which can go stale) and
// re-look-up the full user record from oneprime_users on every load.
// Session is managed by Supabase Auth SDK.
// restoreSession() reads the persisted JWT — no extra network call.
async function restoreSession(){
  try{
    var res = await db.auth.getSession();
    if(!res.data.session) return null;
    var uid = res.data.session.user.id;
    var pr = await db.from('users').select('*').eq('id', uid).single();
    if(pr.error || !pr.data) return null;
    return rowToUser(pr.data);
  }catch(e){ console.warn('restoreSession:', e); return null; }
}

// ===== TOAST =====
function toast(msg,dur){
  dur = dur || 2800;
  const t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('show');
  setTimeout(function(){t.classList.remove('show');},dur);
}

// ===== AUTH =====
async function socialLogin(provider){
  // ── Simulated social login ──
  // Real OAuth needs Supabase provider config. This sim lets users pick a
  // display name; a generated email + random password are created in Supabase
  // Auth so the session is real (JWT, RLS, etc.) — only the email is fake.
  // Requires: Supabase → Authentication → Settings → "Confirm email" OFF.
  //
  // The generated fake identity (email + password) is remembered in
  // localStorage per provider, so clicking "Continue with Google" again
  // later logs back into the SAME simulated account instead of creating a
  // brand new one every time (which is what a real OAuth provider would do
  // too — same provider, same device, same account).
  var providerLabels = {Google:'Google', Apple:'Apple', Facebook:'Facebook'};
  var label = providerLabels[provider] || provider;
  var storageKey = 'oneprime_sim_identity_' + provider.toLowerCase();

  // ── Try to resume a previously-created simulated identity first ──
  var savedRaw = localStorage.getItem(storageKey);
  if (savedRaw) {
    var saved = null;
    try { saved = JSON.parse(savedRaw); } catch(e) {}
    if (saved && saved.email && saved.password) {
      try {
        var signInRes = await db.auth.signInWithPassword({ email: saved.email, password: saved.password });
        if (!signInRes.error) {
          var pr = await db.from('users').select('*').eq('id', signInRes.data.user.id).single();
          if (!pr.error && pr.data) {
            await loadData();
            loginUser(rowToUser(pr.data));
            return;
          }
        }
      } catch(e) { /* fall through to re-create below */ }
      // Saved identity no longer works (deleted from Supabase, etc.) —
      // forget it so we don't keep retrying a dead account.
      localStorage.removeItem(storageKey);
    }
  }

  // ── No saved identity (or it went stale) — ask for a display name and
  // create a fresh simulated account ──
  // Reuse or build the inline name-input UI inside the auth modal
  var loginDiv = document.getElementById('authLogin');
  if (!loginDiv) return;

  // If sim form already open, remove it first
  var existing = document.getElementById('socialSimForm');
  if (existing) existing.remove();

  var simDiv = document.createElement('div');
  simDiv.id = 'socialSimForm';
  simDiv.style.cssText = 'margin-top:1rem;padding:1rem;background:rgba(255,255,255,0.05);border-radius:8px;border:1px solid rgba(255,255,255,0.1);';
  simDiv.innerHTML =
    '<div style="font-size:.78rem;color:rgba(255,255,255,0.5);margin-bottom:.6rem;">以 '+label+' 身份继续 — 请输入您的显示名称</div>' +
    '<input id="socialSimName" class="auth-input" type="text" placeholder="您的姓名" style="margin-bottom:.6rem;" />' +
    '<div style="display:flex;gap:.5rem;">' +
      '<button class="auth-btn" id="socialSimConfirm" style="flex:1;padding:10px;">确认</button>' +
      '<button style="flex-shrink:0;padding:10px 14px;background:none;border:1px solid rgba(255,255,255,0.15);' +
        'border-radius:8px;color:rgba(255,255,255,0.4);cursor:pointer;" onclick="document.getElementById(\'socialSimForm\').remove()">取消</button>' +
    '</div>';
  loginDiv.appendChild(simDiv);

  var nameInput = document.getElementById('socialSimName');
  var confirmBtn = document.getElementById('socialSimConfirm');
  nameInput.focus();

  // Submit on Enter
  nameInput.addEventListener('keydown', function(e){ if(e.key==='Enter') confirmBtn.click(); });

  confirmBtn.addEventListener('click', async function(){
    var name = (nameInput.value || '').trim();
    if (!name) { nameInput.focus(); return; }

    confirmBtn.disabled = true;
    confirmBtn.textContent = '请稍候…';

    // Generate a unique fake email — clearly a simulation address
    var fakeEmail = provider.toLowerCase() + '_' + Date.now() + '@sim.oneprime.au';
    // Random password — user never needs to type it, session is JWT-based
    var fakePwd = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);

    try {
      var su = await db.auth.signUp({ email: fakeEmail, password: fakePwd });
      if (su.error) { toast(su.error.message); confirmBtn.disabled=false; confirmBtn.textContent='确认'; return; }
      var authUser = su.data.user;
      if (!authUser) { toast('注册失败，请重试'); confirmBtn.disabled=false; confirmBtn.textContent='确认'; return; }

      var pendingRef = sessionStorage.getItem('oneprime_pending_ref');
      if (pendingRef && String(pendingRef)===String(authUser.id)) pendingRef = null;

      const newUser = {
        id: authUser.id,
        name: name,
        email: fakeEmail,
        provider: provider,
        role: 'customer',
        membership: null,
        referredBy: pendingRef || null,
        active: true,
        createdAt: new Date().toISOString()
      };
      await dbSaveUser(newUser);
      sessionStorage.removeItem('oneprime_pending_ref');

      // Remember this identity so the NEXT click of "Continue with
      // <provider>" resumes the same account instead of creating another.
      localStorage.setItem(storageKey, JSON.stringify({ email: fakeEmail, password: fakePwd }));

      simDiv.remove();
      await loadData();
      loginUser(newUser, false, !newUser.membership);
    } catch(e) {
      toast('登录失败：' + e.message);
      confirmBtn.disabled = false;
      confirmBtn.textContent = '确认';
    }
  });
}

async function emailLogin(){
  const email=document.getElementById('loginEmail').value.trim();
  const pwd=document.getElementById('loginPwd').value;
  if(!email||!pwd){toast('请填写邮箱和密码');return;}
  var btn=document.querySelector('#authLogin .auth-btn');
  if(btn){btn.disabled=true;btn.textContent='登录中…';}
  try{
    var res=await db.auth.signInWithPassword({email:email,password:pwd});
    if(res.error){toast('邮箱或密码错误');return;}
    var pr=await db.from('users').select('*').eq('id',res.data.user.id).single();
    if(pr.error||!pr.data){toast('用户信息加载失败，请重试');return;}
    await loadData();
    loginUser(rowToUser(pr.data));
  }catch(e){toast('登录失败：'+e.message);
  }finally{if(btn){btn.disabled=false;btn.textContent='登录';}}
}

async function emailRegister(){
  const name=document.getElementById('regName').value.trim();
  const email=document.getElementById('regEmail').value.trim();
  const pwd=document.getElementById('regPwd').value;
  if(!name||!email||!pwd){toast('请填写所有字段');return;}
  if(pwd.length<6){toast('密码至少6位');return;}
  var btn=document.querySelector('#authRegister .auth-btn');
  if(btn){btn.disabled=true;btn.textContent='注册中…';}
  try{
    var su=await db.auth.signUp({email:email,password:pwd});
    if(su.error){toast(su.error.message);return;}
    var authUser=su.data.user;
    if(!authUser){toast('注册失败，请重试');return;}
    var pendingRef=sessionStorage.getItem('oneprime_pending_ref');
    if(pendingRef&&String(pendingRef)===String(authUser.id)) pendingRef=null;
    const newUser={
      id:authUser.id, name:name, email:email, provider:'email',
      role:'customer', membership:null, referredBy:pendingRef||null,
      active:true, createdAt:new Date().toISOString()
    };
    await dbSaveUser(newUser);
    sessionStorage.removeItem('oneprime_pending_ref');
    await loadData();
    loginUser(newUser,false,!newUser.membership);
  }catch(e){toast('注册失败：'+e.message);
  }finally{if(btn){btn.disabled=false;btn.textContent='注册';}}
}

function adminLogin(){
  window.location.href='admin.html'; // admin auth verified on admin.html load
}

function loginUser(u,isAdmin,isNewRegistration){
  state.currentUser=u;
  state.isAdmin=isAdmin||u.role==='admin';
  // Supabase Auth SDK persists the JWT automatically — no saveSession() needed.
  closeAuthModal();
  // Standalone login page: send back to return URL
  if(window.location.pathname.endsWith('login.html')){
    var p=new URLSearchParams(window.location.search);
    window.location.href=p.get('return')||'index.html';
    return;
  }
  if(state.isAdmin){
    // Redirect to admin page
    window.location.href = 'admin.html';
  } else if(state.pendingCheckout){
    // The person was a guest trying to check out — now that they're
    // logged in, send them straight to checkout instead of the
    // membership page or shop home, so they don't lose their place.
    state.pendingCheckout = false;
    if(document.getElementById('page-checkout')){
      renderCheckout();
      showPage('checkout');
    } else {
      showShopScreen();
    }
  } else if(isNewRegistration && !u.membership){
    // New sign-ups go straight to picking a membership tier (paid annual
    // tiers based purely on the member's own spend/payment — see
    // membership.html). Existing users who skipped this before just land
    // on the shop as usual.
    window.location.href = 'membership.html';
  } else {
    showShopScreen();
  }
}

function openAuthModal(){
  switchAuthMode('login');
  document.getElementById('authScreen').style.display='flex';
  document.getElementById('authScreen').classList.add('active');
}

function closeAuthModal(){
  document.getElementById('authScreen').style.display='none';
  document.getElementById('authScreen').classList.remove('active');
}

function toggleUserDropdown(){
  const dd=document.getElementById('userDropdown');
  dd.style.display=dd.style.display==='none'?'block':'none';
}

// close dropdown on outside click
document.addEventListener('click',function(e){
  const ud=document.getElementById('userDropdown');
  const hu=document.getElementById('headerUser');
  if(ud&&hu&&!hu.contains(e.target))ud.style.display='none';
});

async function logout(){
  await db.auth.signOut();
  state.currentUser=null;state.isAdmin=false;state.cart=[];
  // headerGuest/headerUser/cart UI only exist on pages that reuse the shop
  // header (index.html, membership.html); guard so this also runs safely
  // if ever invoked from admin.html, which has none of this markup.
  const shopScreen=document.getElementById('shopScreen');
  if(!shopScreen){
    // We're on a page without the shop UI (e.g. admin.html) — just leave.
    window.location.href='index.html';
    return;
  }
  if(document.getElementById('cartItems'))updateCart();
  shopScreen.classList.add('active');
  document.getElementById('headerGuest').style.display='';
  document.getElementById('headerUser').style.display='none';
  const ml=document.getElementById('mobileLoginLink');
  const mlo=document.getElementById('mobileLogoutLink');
  if(ml)ml.style.display='';
  if(mlo)mlo.style.display='none';
  // renderHomePage()/showPage() need the full shop SPA markup (only on
  // index.html) — membership.html reuses the header but has none of the
  // page-home/page-category/page-checkout sections.
  if(document.getElementById('homeProductGrid')){
    renderHomePage();
    showPage('home');
  }
  closeAuthModal();
  // On membership.html, reflect the logged-out state in its own UI too.
  if(typeof refreshMembershipPage==='function')refreshMembershipPage();
}

function switchAuthMode(mode){
  document.getElementById('authLogin').classList.toggle('hidden',mode!=='login');
  document.getElementById('authRegister').classList.toggle('hidden',mode!=='register');
}

// ===== SCREENS =====
function showShopScreen(){
  const shopScreen=document.getElementById('shopScreen');
  if(shopScreen)shopScreen.classList.add('active');
  const u=state.currentUser;
  if(u){
    document.getElementById('headerGuest').style.display='none';
    document.getElementById('headerUser').style.display='';
    document.getElementById('userNameDisplay').textContent=u.name;
    document.getElementById('userAvatar').textContent=u.name[0].toUpperCase();
    document.getElementById('dropUserEmail').textContent=u.email||u.name;
    const ml=document.getElementById('mobileLoginLink');
    const mlo=document.getElementById('mobileLogoutLink');
    if(ml)ml.style.display='none';
    if(mlo)mlo.style.display='';
  }
  // renderHomePage()/showPage()/updateCategoryCounts() touch elements
  // (#homeProductGrid, #page-home, #page-category, #page-checkout) that
  // only exist on index.html's full shop SPA markup — guard so this
  // function is also safe to call from simpler standalone pages like
  // membership.html that reuse the same header/login UI.
  if(document.getElementById('homeProductGrid')){
    renderHomePage();
    showPage('home');
    updateCategoryCounts();
  }
  if(typeof refreshMembershipPage==='function')refreshMembershipPage();
}

// ===== PAGES =====
function showPage(page){
  ['home','category','checkout'].forEach(function(p){
    document.getElementById('page-'+p).classList.toggle('hidden',p!==page);
  });
  document.querySelectorAll('.sh-nav a').forEach(function(a){
    a.classList.toggle('active',a.dataset.page===page);
  });
}

function showCategory(catKey){
  state.currentCategory=catKey;
  const cat=CATS[catKey];
  document.getElementById('catLabel').textContent=cat.icon+' '+cat.en;
  document.getElementById('catTitle').innerHTML='<em style="color:var(--gold);font-style:normal;">'+cat.icon+'</em> '+cat.label;
  document.getElementById('catSub').textContent=cat.sub;
  document.getElementById('catProductTitle').textContent=cat.label+' · 全部商品';
  document.getElementById('catSort').value='default';
  renderCategoryProducts(catKey,'default');
  showPage('category');
  document.querySelectorAll('.sh-nav a').forEach(function(a){a.classList.toggle('active',a.dataset.page===catKey);});
}

function sortProducts(){
  renderCategoryProducts(state.currentCategory,document.getElementById('catSort').value);
}

function renderCategoryProducts(catKey,sort){
  let prods=state.products.filter(function(p){return p.cat===catKey&&p.active;});
  if(sort==='price-asc')prods.sort(function(a,b){return a.price-b.price;});
  if(sort==='price-desc')prods.sort(function(a,b){return b.price-a.price;});
  renderProductGrid(document.getElementById('catProductGrid'),prods);
}

// ===== HOME =====
function renderHomePage(){
  filterHome('all',document.querySelector('#homeFilter .active'));
}

function filterHome(cat,btn){
  state.currentFilter=cat;
  document.querySelectorAll('#homeFilter .filter-btn').forEach(function(b){b.classList.remove('active');});
  if(btn)btn.classList.add('active');
  var prods = cat==='all' ? state.products.filter(function(p){return p.active;}) : state.products.filter(function(p){return p.cat===cat&&p.active;});
  renderProductGrid(document.getElementById('homeProductGrid'),prods);
}

function updateCategoryCounts(){
  Object.keys(CATS).forEach(function(k){
    const c=state.products.filter(function(p){return p.cat===k&&p.active;}).length;
    const el=document.getElementById('cat-count-'+k);
    if(el)el.textContent=c+' 款';
  });
}

// ===== PRODUCT GRID =====
function renderProductGrid(container,prods){
  if(!prods.length){
    container.innerHTML='<div class="empty-state" style="grid-column:1/-1"><div class="ei">📦</div><h3>暂无商品</h3><p>该分类下暂无上架商品</p></div>';
    return;
  }
  container.innerHTML=prods.map(function(p){
    const qty=getCartQty(p.id);
    const pb=getPriceBreakdown(p.price,state.currentUser);
    // Card view stays simple: 建议零售价 + the price the user actually
    // pays right now (at minimum the 普通会员价 floor). Full breakdown
    // (普通会员参考价 + 比上一档又省多少) lives in the product modal to
    // avoid crowding this card.
    const priceHtml = pb.currentPrice<pb.retailPrice
      ? '<span class="prod-price">¥'+pb.currentPrice+'</span><span class="prod-price-orig">¥'+pb.retailPrice+'</span>'+(pb.currentTier?'<span class="member-price-tag">'+pb.currentTier.label+'价</span>':'')
      : '<span class="prod-price">¥'+pb.retailPrice+'</span>'+(p.origPrice ? '<span class="prod-price-orig">¥'+p.origPrice+'</span>' : '');
    return '<div class="prod-card" onclick="openProduct('+p.id+')">'+
      (p.img ? '<img class="prod-img" src="'+p.img+'" alt="'+p.name+'">' : '<div class="prod-img-placeholder">'+(CATS[p.cat]?CATS[p.cat].icon:'📦')+'</div>')+
      '<div class="prod-body">'+
        '<div class="prod-cat">'+(CATS[p.cat]?CATS[p.cat].label:p.cat)+'</div>'+
        '<div class="prod-name">'+p.name+'</div>'+
        '<div class="prod-desc">'+p.desc+'</div>'+
        '<div class="prod-foot">'+
          '<div>'+priceHtml+'</div>'+
          '<div class="prod-qty-ctrl" onclick="event.stopPropagation()">'+
            '<button onclick="cardDecrement('+p.id+')">−</button>'+
            '<input class="prod-qty-num" id="card-qty-'+p.id+'" type="number" min="0" step="1" value="'+(qty||0)+'" onclick="event.stopPropagation()" onchange="setCardQty('+p.id+',this.value)">'+
            '<button onclick="cardIncrement('+p.id+')">+</button>'+
          '</div>'+
        '</div>'+
      '</div>'+
    '</div>';
  }).join('');
}

function getCartQty(id){
  const item=state.cart.find(function(x){return x.id===id;});
  return item?item.qty:0;
}

function cardIncrement(id){
  addToCart(id,true);
  document.querySelectorAll('#card-qty-'+id).forEach(function(el){el.value=getCartQty(id);});
}

function cardDecrement(id){
  const item=state.cart.find(function(x){return x.id===id;});
  if(!item)return;
  if(item.qty<=1)removeFromCart(id);
  else{item.qty--;updateCart();}
  document.querySelectorAll('#card-qty-'+id).forEach(function(el){el.value=getCartQty(id);});
}

// Lets shoppers type an exact quantity directly into the product-card
// stepper (e.g. jump straight from 1 to 19) instead of only being able to
// click +/- one at a time.
function setCardQty(id,val){
  var n=parseInt(val,10);
  if(isNaN(n)||n<0)n=0;
  if(n===0){
    removeFromCart(id);
    document.querySelectorAll('#card-qty-'+id).forEach(function(el){el.value=0;});
    return;
  }
  const p=state.products.find(function(x){return x.id===id;});
  if(!p)return;
  const pb=getPriceBreakdown(p.price,state.currentUser);
  const existing=state.cart.find(function(x){return x.id===id;});
  if(existing){
    existing.qty=n;
  } else {
    state.cart.push({id:id,name:p.name,price:pb.currentPrice,origPrice:p.origPrice||p.price,img:p.img,cat:p.cat,qty:n});
  }
  updateCart();
  document.querySelectorAll('#card-qty-'+id).forEach(function(el){el.value=n;});
}

// ===== PRODUCT MODAL =====
let modalQty=1;
let modalProductId=null;

function openProduct(id){
  const p=state.products.find(function(x){return x.id===id;});if(!p)return;
  modalProductId=id;
  modalQty=1;
  const pb=getPriceBreakdown(p.price,state.currentUser);

  // Build the price breakdown block. Always show 建议零售价 (struck
  // through, illustrative MSRP only) and the 普通会员参考价/实付价 as the
  // real floor — even for users who haven't paid for any membership yet,
  // so they can see what joining would get them. Only when the user
  // actually holds a paid tier above 普通会员 do we add a further "当前
  // 等级价" line plus exactly how much that saves versus the previous
  // tier AND versus 建议零售价.
  let priceBreakdownHtml = '';
  if(pb.hasPaidTierAboveNormal){
    var savingsVsRetail = p.origPrice ? Math.round((p.origPrice-pb.currentPrice)*100)/100 : null;
    priceBreakdownHtml =
      '<div class="modal-price-row">'+
        '<span class="modal-price">¥'+pb.currentPrice+'</span>'+
        (p.origPrice ? '<span class="modal-orig">¥'+p.origPrice+'</span>' : '')+
        '<span class="badge badge-gold">'+pb.currentTier.label+'专享价</span>'+
      '</div>'+
      '<div class="price-tier-breakdown">'+
        (p.origPrice ? '<div class="ptb-row"><span class="ptb-label">建议零售价</span><span class="ptb-value ptb-strike">¥'+p.origPrice+'</span></div>' : '')+
        '<div class="ptb-row"><span class="ptb-label">普通会员参考价</span><span class="ptb-value">¥'+pb.normalPrice+'</span></div>'+
        '<div class="ptb-row ptb-current"><span class="ptb-label">'+pb.currentTier.label+'价（您当前等级）</span><span class="ptb-value">¥'+pb.currentPrice+'</span></div>'+
        (pb.savingsVsPrevious>0.001 ? '<div class="ptb-savings">🎉 比'+pb.previousTier.label+'又省 ¥'+pb.savingsVsPrevious.toFixed(2)+'</div>' : '')+
        (savingsVsRetail!==null && savingsVsRetail>0.001 ? '<div class="ptb-savings">💰 比建议零售价省 ¥'+savingsVsRetail.toFixed(2)+'</div>' : '')+
      '</div>';
  } else {
    // User holds no paid membership above 普通会员 (or is only browsing
    // as a guest) — they're still charged 普通会员价 (pb.currentPrice) at
    // minimum, with 建议零售价 shown only as a struck-through reference.
    priceBreakdownHtml =
      '<div class="modal-price-row">'+
        '<span class="modal-price">¥'+pb.currentPrice+'</span>'+
        (p.origPrice ? '<span class="modal-orig">¥'+p.origPrice+'</span>' : '')+
        (p.origPrice ? '<span class="badge badge-gold">省¥'+(p.origPrice-pb.currentPrice).toFixed(2).replace(/\.00$/,'')+'</span>' : '')+
      '</div>';
  }

  document.getElementById('modalContent').innerHTML=
    (p.img ? '<img class="modal-img" src="'+p.img+'" alt="'+p.name+'">' : '<div class="modal-img-ph">'+(CATS[p.cat]?CATS[p.cat].icon:'📦')+'</div>')+
    '<div class="modal-body">'+
      '<div class="modal-cat">'+(CATS[p.cat]?CATS[p.cat].icon:'')+' '+(CATS[p.cat]?CATS[p.cat].label:'')+' · '+(p.nameEn||'')+'</div>'+
      '<div class="modal-name">'+p.name+'</div>'+
      '<div class="modal-desc">'+p.desc+'</div>'+
      priceBreakdownHtml+
      '<div class="qty-row">'+
        '<div class="qty-ctrl">'+
          '<button onclick="changeModalQty(-1)">−</button>'+
          '<input id="modalQtyDisplay" type="number" min="1" step="1" value="1" onchange="setModalQty(this.value)">'+
          '<button onclick="changeModalQty(1)">+</button>'+
        '</div>'+
        '<button class="modal-add-btn" onclick="addToCartFromModal('+p.id+')">加入购物车</button>'+
      '</div>'+
      (!state.currentUser || !state.currentUser.membership ? '<div class="member-upsell-hint">💎 加入会员最高享8折优惠 · <a onclick="window.location.href=\'membership.html\'">了解会员权益</a></div>' : '')+
      '<div style="font-size:.72rem;color:var(--text-muted);">库存：'+p.stock+'件 · 假一赔千 · 官方授权</div>'+
    '</div>';
  const ov=document.getElementById('prodModal');
  ov.classList.add('open');
  document.body.style.overflow='hidden';
}

function changeModalQty(d){
  modalQty=Math.max(1,modalQty+d);
  document.getElementById('modalQtyDisplay').value=modalQty;
}

// Lets shoppers type an exact quantity into the product modal's stepper
// directly (e.g. straight from 1 to 19) instead of only +/- one at a time.
function setModalQty(val){
  var n=parseInt(val,10);
  if(isNaN(n)||n<1)n=1;
  modalQty=n;
  document.getElementById('modalQtyDisplay').value=n;
}

function addToCartFromModal(id){
  const p=state.products.find(function(x){return x.id===id;});if(!p)return;
  const pb=getPriceBreakdown(p.price,state.currentUser);
  const existing=state.cart.find(function(x){return x.id===id;});
  if(existing) existing.qty+=modalQty;
  else state.cart.push({id:id,name:p.name,price:pb.currentPrice,origPrice:p.origPrice||p.price,img:p.img,cat:p.cat,qty:modalQty});
  updateCart();
  toast('已加入购物车 ×'+modalQty);
  closeProdModalDirect();
}

function closeProdModal(e){if(e.target===document.getElementById('prodModal'))closeProdModalDirect();}

function closeProdModalDirect(){
  document.getElementById('prodModal').classList.remove('open');
  document.body.style.overflow='';
}

// ===== CART =====
// origPrice on a cart line is the product's 建议零售价 (p.origPrice) when
// set, falling back to p.price otherwise — this is what per-item and
// total savings are measured against (see updateCart()).
function addToCart(id,silent){
  const p=state.products.find(function(x){return x.id===id;});if(!p)return;
  const pb=getPriceBreakdown(p.price,state.currentUser);
  const existing=state.cart.find(function(x){return x.id===id;});
  if(existing)existing.qty++;
  else state.cart.push({id:id,name:p.name,price:pb.currentPrice,origPrice:p.origPrice||p.price,img:p.img,cat:p.cat,qty:1});
  updateCart();
  if(!silent)toast('✓ 已加入购物车');
}

function removeFromCart(id){
  state.cart=state.cart.filter(function(x){return x.id!==id;});
  updateCart();
}

function changeCartQty(id,d){
  const item=state.cart.find(function(x){return x.id===id;});
  if(!item)return;
  item.qty=Math.max(1,item.qty+d);
  if(item.qty<1)removeFromCart(id);
  updateCart();
}

// Lets shoppers type an exact quantity directly into a cart line item
// (e.g. straight from 1 to 19) instead of only +/- one click at a time.
function setCartQtyExact(id,val){
  var n=parseInt(val,10);
  if(isNaN(n)||n<1){removeFromCart(id);return;}
  const item=state.cart.find(function(x){return x.id===id;});
  if(!item)return;
  item.qty=n;
  updateCart();
}

function updateCart(){
  const total=state.cart.reduce(function(s,i){return s+i.price*i.qty;},0);
  const origTotal=state.cart.reduce(function(s,i){return s+(i.origPrice||i.price)*i.qty;},0);
  const count=state.cart.reduce(function(s,i){return s+i.qty;},0);
  const countEl=document.getElementById('cartCount');
  if(countEl)countEl.textContent=count;
  const itemsEl=document.getElementById('cartItems');
  const footEl=document.getElementById('cartFoot');
  if(!itemsEl)return;
  if(!state.cart.length){
    itemsEl.innerHTML='<div class="cart-empty"><div style="font-size:2.5rem;margin-bottom:.75rem;">🛒</div><p>购物车是空的</p></div>';
    footEl.innerHTML='';return;
  }
  itemsEl.innerHTML=state.cart.map(function(i){
    var lineSavings = ((i.origPrice||i.price)-i.price)*i.qty;
    return '<div class="cart-item">'+
      (i.img ? '<img class="cart-item-img" src="'+i.img+'" alt="'+i.name+'">' : '<div class="cart-item-img-ph">'+(CATS[i.cat]?CATS[i.cat].icon:'📦')+'</div>')+
      '<div class="cart-item-info">'+
        '<div class="cart-item-name">'+i.name+'</div>'+
        '<div class="cart-item-price">¥'+i.price+(i.origPrice&&i.origPrice>i.price?' <span class="ci-orig">¥'+i.origPrice+'</span>':'')+(lineSavings>0.001?' <span class="ci-savings">省¥'+lineSavings.toFixed(2)+'</span>':'')+'</div>'+
        '<div class="cart-item-controls">'+
          '<div class="ci-qty">'+
            '<button onclick="changeCartQty('+i.id+',-1)">−</button>'+
            '<input type="number" min="1" step="1" value="'+i.qty+'" onchange="setCartQtyExact('+i.id+',this.value)">'+
            '<button onclick="changeCartQty('+i.id+',1)">+</button>'+
          '</div>'+
          '<button class="ci-remove" onclick="removeFromCart('+i.id+')">删除</button>'+
        '</div>'+
      '</div>'+
    '</div>';
  }).join('');
  const savings = origTotal-total;
  footEl.innerHTML=
    renderNextTierHint()+
    '<div class="cart-total-row"><span class="cart-total-label">合计 ('+count+'件)</span><span class="cart-total-price">¥'+total.toFixed(2)+(savings>0.001?' <span class="cart-total-savings">共省¥'+savings.toFixed(2)+'</span>':'')+'</span></div>'+
    '<button class="checkout-btn" onclick="goCheckout()">去结算</button>';
}

// Shared "还差¥X升级到下一档" hint used on both the cart drawer and the
// checkout page (and mirrored on membership.html), per explicit
// instruction. Only shows for logged-in users who haven't already
// qualified for the next tier by spend (that case is handled by the
// existing "可补差价升级" messaging on the membership page instead).
function renderNextTierHint(){
  if(!state.currentUser) return '';
  const info = getAmountToNextTier(state.currentUser);
  if(!info) return '';
  return '<div class="next-tier-hint">📈 距离 <strong>'+info.tier.label+'</strong>（累计消费满 ¥'+info.tier.spendThreshold.toLocaleString()+'）还差 <strong>¥'+info.remaining.toFixed(2)+'</strong> · <a onclick="window.location.href=\'membership.html\'">查看会员权益</a></div>';
}

function toggleCart(){
  document.getElementById('cartDrawer').classList.toggle('open');
  document.getElementById('cartOverlay').classList.toggle('open');
}

// Checkout now requires being logged in first — a guest who clicks 去结算
// is sent straight to the login modal, and is automatically carried
// through to the checkout page the moment they log in or register (see
// the pendingCheckout handling inside loginUser()). This also matches the
// pricing rule that any actual purchase is made at minimum at 普通会员价,
// which requires an account.
function goCheckout(){
  if(!state.currentUser){
    toggleCart();
    state.pendingCheckout = true;
    toast('请先登录后再结算');
    openAuthModal();
    return;
  }
  toggleCart();
  renderCheckout();
  showPage('checkout');
}

function renderCheckout(){
  const ckItems=document.getElementById('ckItems');
  const ckTotal=document.getElementById('ckTotal');
  if(!ckItems)return;
  const total=state.cart.reduce(function(s,i){return s+i.price*i.qty;},0);
  const origTotal=state.cart.reduce(function(s,i){return s+(i.origPrice||i.price)*i.qty;},0);
  ckItems.innerHTML=state.cart.map(function(i){
    var lineSavings = ((i.origPrice||i.price)-i.price)*i.qty;
    return '<div class="os-item"><span class="os-item-name">'+i.name+' ×'+i.qty+(lineSavings>0.001?' <span class="ci-savings">省¥'+lineSavings.toFixed(2)+'</span>':'')+'</span><span class="os-item-price">¥'+(i.price*i.qty).toFixed(2)+'</span></div>';
  }).join('');
  const savings = origTotal-total;
  if(savings>0.001){
    ckItems.innerHTML += '<div class="os-item os-savings"><span class="os-item-name">'+getUserMembershipLabel(state.currentUser)+'折扣优惠</span><span class="os-item-price">−¥'+savings.toFixed(2)+'</span></div>';
  }
  ckTotal.innerHTML='¥'+total.toFixed(2)+(savings>0.001?' <span class="cart-total-savings">共省¥'+savings.toFixed(2)+'</span>':'');
  const ckHintEl=document.getElementById('ckNextTierHint');
  if(ckHintEl)ckHintEl.innerHTML=renderNextTierHint();
  const u=state.currentUser;
  if(u){
    const n=document.getElementById('ck-name');
    if(n&&!n.value)n.value=u.name||'';
  }
}

async function placeOrder(){
  if(!state.currentUser){
    state.pendingCheckout = true;
    toast('请先登录后再下单');
    openAuthModal();
    return;
  }
  const name=document.getElementById('ck-name').value.trim();
  const phone=document.getElementById('ck-phone').value.trim();
  const city=document.getElementById('ck-city').value.trim();
  const addr=document.getElementById('ck-addr').value.trim();
  if(!name||!phone||!city||!addr){toast('请填写完整收货信息');return;}
  if(!state.cart.length){toast('购物车为空');return;}
  const total=state.cart.reduce(function(s,i){return s+i.price*i.qty;},0);
  const order={
    id:'ORD'+Date.now(),
    userId:state.currentUser?state.currentUser.id:null,
    userName:name,
    items:state.cart.map(function(i){return {name:i.name,qty:i.qty,price:i.price};}),
    total:total,
    status:'processing',
    address:city+' '+addr,
    phone:phone,
    createdAt:new Date().toISOString(),
  };
  await dbSaveOrder(order);
  await loadData();
  // Record tiered referral commission (fire-and-forget)
  recordReferralCommission(order).catch(function(e){ console.warn('Commission failed:', e); });
  state.cart=[];
  updateCart();
  toast('🎉 订单提交成功！我们将尽快处理您的订单');
  showPage('home');
}

// ===== REFERRAL COMMISSION RECORDING =====
// Rate is determined by referrer's membership tier, read from Supabase settings.
async function recordReferralCommission(order){
  var u=state.currentUser;
  if(!u||!u.referredBy) return;
  var referrerTier='normal';
  try{
    var rr=await db.from('users').select('membership').eq('id',String(u.referredBy)).single();
    if(rr.data&&rr.data.membership) referrerTier=rr.data.membership;
  }catch(e){}
  var rate = await getCommissionRateForTier(referrerTier);
  if(rate<=0) return;
  await dbSaveCommission({
    id:'COM'+Date.now(),
    referrerId:String(u.referredBy),
    referredUserId:String(u.id),
    orderId:order.id,
    orderTotal:order.total,
    commissionRate:rate,
    commissionAmount:Math.round(order.total*rate*100)/100,
    createdAt:new Date().toISOString(),
  });
}

// ===== MEMBERSHIP UPGRADE/PAYMENT (SIMULATED) =====
// This entire site has no real payment processor connected — order
// checkout is simulated, and so is membership payment. Nothing here
// charges a real card. Advancement is strictly: (a) pay the fee difference
// outright, or (b) personal cumulative spend unlocks the *option* to pay
// the difference — never a free automatic upgrade, and never tied to
// referring/recruiting other people.
function getUpgradeCost(targetTierKey){
  var tiers = loadMembershipTiers();
  var target = tiers[targetTierKey];
  if(!target) return 0;
  var current = state.currentUser && state.currentUser.membership ? tiers[state.currentUser.membership] : null;
  var alreadyPaid = current ? current.fee : 0;
  return Math.max(0, target.fee - alreadyPaid);
}

async function purchaseMembership(targetTierKey){
  if(!state.currentUser){ toast('请先登录'); openAuthModal(); return; }
  var tiers = loadMembershipTiers();
  var target = tiers[targetTierKey];
  if(!target){ toast('会员等级不存在'); return; }

  var current = state.currentUser.membership ? tiers[state.currentUser.membership] : null;
  if(current && current.order >= target.order){
    toast('您已是'+current.label+'或更高等级');
    return;
  }

  var cost = getUpgradeCost(targetTierKey);
  if(!confirm('（模拟支付）确认支付 ¥'+cost+' '+(current?'补差价升级':'开通')+'为'+target.label+'吗？\n本站未接入真实支付，这里仅模拟扣款流程。')) return;

  var updatedUser = Object.assign({}, state.currentUser, {
    membership: targetTierKey,
    membershipSince: new Date().toISOString()
  });
  try{
    await dbSaveUser(updatedUser);
  }catch(e){
    toast('开通失败：'+e.message);
    return;
  }
  state.currentUser = updatedUser;
  await loadData();
  toast('🎉 已开通'+target.label+'（模拟支付成功）');
  // Immediately reflect the new tier everywhere relevant — without this,
  // the membership page kept showing the OLD tier/status until a manual
  // page reload, even though the purchase had actually succeeded.
  if(typeof refreshMembershipPage==='function')refreshMembershipPage();
  if(document.getElementById('homeProductGrid'))renderHomePage();
  if(document.getElementById('cartItems'))updateCart();
}

// ===== MOBILE NAV =====
function toggleMobileNav(){
  document.getElementById('mobileNav').classList.toggle('open');
}

// ===== INIT =====
(async function(){
  // 1. Stash ?ref= referral param before anything else
  checkRefParam();

  // 2. Restore Supabase Auth session (reads cached JWT, no network wait)
  var restoredUser = await restoreSession();
  if(restoredUser){
    state.currentUser = restoredUser;
    state.isAdmin = restoredUser.role==='admin';
  }

  // 3. Paint header shell immediately
  if(document.getElementById('shopScreen')){
    document.getElementById('shopScreen').classList.add('active');
    if(restoredUser){
      var hg=document.getElementById('headerGuest');
      var hu=document.getElementById('headerUser');
      if(hg) hg.style.display='none';
      if(hu) hu.style.display='';
      var nd=document.getElementById('userNameDisplay');
      var av=document.getElementById('userAvatar');
      var de=document.getElementById('dropUserEmail');
      var ml0=document.getElementById('mobileLoginLink');
      var mlo0=document.getElementById('mobileLogoutLink');
      if(nd) nd.textContent=restoredUser.name;
      if(av) av.textContent=restoredUser.name[0].toUpperCase();
      if(de) de.textContent=restoredUser.email||restoredUser.name;
      if(ml0) ml0.style.display='none';
      if(mlo0) mlo0.style.display='';
    }
  }

  // 4. Fetch data then render — category counts only appear after load
  await Promise.all([initData(), loadMembershipTiersFromDB()]);
  if(document.getElementById('homeProductGrid')){
    renderHomePage();
    updateCategoryCounts();
    // Hash deep-linking: index.html#wine → show wine category
    if(window.location.hash){
      var cat=window.location.hash.replace('#','');
      if(CATS[cat]) showCategory(cat);
    }
  }
  if(document.getElementById('cartItems')) updateCart();
  if(typeof refreshMembershipPage==='function') refreshMembershipPage();
  _fireDataReady();
})();
