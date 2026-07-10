/**
 * OnePrime · components.js
 * Injects shared UI (header, auth modal, cart drawer, mobile nav) into
 * every non-admin page. Each page only needs four mount divs:
 *   <div id="auth-modal-mount"></div>
 *   <div id="cart-mount"></div>
 *   <div id="header-mount"></div>
 *   <div id="mobile-nav-mount"></div>
 *
 * This file runs synchronously when loaded so elements exist before
 * script.js's async init reads them.
 */
(function () {
  'use strict';

  // Detect which page we're on from the URL pathname
  var path = window.location.pathname;
  var page = path.includes('membership') ? 'membership'
           : path.includes('referral')   ? 'referral'
           : path.includes('account')    ? 'account'
           : path.includes('login')      ? 'login'
           : 'home';

  // ─── Nav helper ───────────────────────────────────────────────
  function navA(href, label, key, extraStyle) {
    var isActive = page === key;
    var style = extraStyle || (isActive ? 'color:var(--gold);' : '');
    return '<li><a href="' + href + '"' +
      (style ? ' style="' + style + '"' : '') +
      (isActive ? ' class="active"' : '') +
      '>' + label + '</a></li>';
  }

  // Category links need different behavior depending on where they're
  // rendered: on the home page itself, clicking should switch category
  // in-place (call showCategory() — no reload, matches index.html's own
  // SPA behavior). From any other page (membership/referral/account/login),
  // there's no category-switching UI loaded, so it has to be a real
  // navigation back to index.html first.
  function navCat(catKey, label) {
    if (page === 'home') {
      return '<li><a onclick="showCategory(\'' + catKey + '\')" data-page="' + catKey + '">' + label + '</a></li>';
    }
    return '<li><a href="index.html#' + catKey + '">' + label + '</a></li>';
  }

  // ─── Auth Modal ───────────────────────────────────────────────
  var authMount = document.getElementById('auth-modal-mount');
  if (authMount) {
    authMount.innerHTML =
      '<div class="screen" id="authScreen" style="position:fixed;inset:0;z-index:500;' +
      'background:rgba(10,6,4,0.88);backdrop-filter:blur(8px);display:none;' +
      'align-items:center;justify-content:center;padding:1rem;min-height:0;">' +
      '<div class="auth-box" style="position:relative;">' +
        '<button class="auth-modal-close" onclick="closeAuthModal()">✕</button>' +
        '<div class="auth-logo">OnePrime</div>' +
        '<div class="auth-logo-sub">恒旺国际 · 品质生活商城</div>' +

        '<!-- LOGIN -->' +
        '<div id="authLogin">' +
          '<div class="auth-title">Welcome back</div>' +
          '<div class="auth-sub">登录您的账户继续购物</div>' +
          // Social buttons (placeholder — OAuth needs Supabase config)
          '<button class="social-btn" onclick="socialLogin(\'Google\')">' +
            '<svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.859-3.048.859-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/><path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 6.294C4.672 4.167 6.656 3.58 9 3.58z"/></svg>' +
            'Continue with Google' +
          '</button>' +
          '<button class="social-btn" onclick="socialLogin(\'Apple\')">' +
            '<svg width="18" height="18" viewBox="0 0 18 18" fill="white"><path d="M14.048 9.368c-.02-1.98 1.622-2.944 1.694-2.99-.924-1.35-2.36-1.535-2.87-1.552-1.22-.124-2.384.72-3.002.72-.618 0-1.573-.704-2.587-.684-1.327.02-2.558.773-3.24 1.96-1.387 2.4-.354 5.962 1 7.908.667.956 1.462 2.032 2.503 1.994 1.007-.04 1.386-.648 2.603-.648 1.217 0 1.558.648 2.616.628 1.083-.02 1.766-.977 2.428-1.937.768-1.107 1.082-2.19 1.1-2.244-.024-.01-2.1-.806-2.123-3.155zm-1.99-5.797c.553-.67.927-1.596.824-2.521-.796.033-1.76.53-2.33 1.199-.51.59-.959 1.53-.84 2.435.89.069 1.793-.453 2.346-1.113z"/></svg>' +
            'Continue with Apple' +
          '</button>' +
          '<div class="auth-divider">或使用邮箱</div>' +
          '<input class="auth-input" type="email" id="loginEmail" placeholder="邮箱地址" />' +
          '<input class="auth-input" type="password" id="loginPwd" placeholder="密码" />' +
          '<button class="auth-btn" onclick="emailLogin()">登录</button>' +
          '<div class="auth-toggle">还没有账户？<a onclick="switchAuthMode(\'register\')">立即注册</a></div>' +
          '<div class="auth-admin-link" onclick="adminLogin()">⚙ 管理员后台入口</div>' +
        '</div>' +

        '<!-- REGISTER -->' +
        '<div id="authRegister" class="hidden">' +
          '<div class="auth-title">创建账户</div>' +
          '<div class="auth-sub">注册获得专属会员权益</div>' +
          '<input class="auth-input" type="text"     id="regName"  placeholder="姓名" />' +
          '<input class="auth-input" type="email"    id="regEmail" placeholder="邮箱地址" />' +
          '<input class="auth-input" type="password" id="regPwd"   placeholder="密码（至少6位）" />' +
          '<button class="auth-btn" onclick="emailRegister()">注册</button>' +
          '<div class="auth-toggle">已有账户？<a onclick="switchAuthMode(\'login\')">返回登录</a></div>' +
        '</div>' +
      '</div>' +
      '</div>';
  }

  // ─── Cart Drawer ──────────────────────────────────────────────
  var cartMount = document.getElementById('cart-mount');
  if (cartMount) {
    cartMount.innerHTML =
      '<div class="cart-overlay" id="cartOverlay" onclick="toggleCart()"></div>' +
      '<div class="cart-drawer" id="cartDrawer">' +
        '<div class="cart-head"><h3>购物车</h3>' +
          '<button class="cart-close" onclick="toggleCart()">✕</button></div>' +
        '<div class="cart-items" id="cartItems"></div>' +
        '<div class="cart-foot" id="cartFoot"></div>' +
      '</div>';
  }

  // ─── Header ───────────────────────────────────────────────────
  var headerMount = document.getElementById('header-mount');
  if (headerMount) {
    headerMount.innerHTML =
      '<header class="shop-header">' +
        '<a class="sh-logo" href="index.html">OnePrime<span>恒旺国际</span></a>' +
        '<ul class="sh-nav">' +
          navA('index.html',      '首页',         'home') +
          navCat('wine',   '🍷 红酒') +
          navCat('health', '💊 大健康') +
          navCat('beauty', '✨ 美妆护肤') +
          navCat('food',   '🌿 功能性食品') +
          navA('membership.html', '💎 会员权益',   'membership', page==='membership'?'color:var(--gold);':'') +
          navA('referral.html',   '🤝 推荐好友',   'referral',   page==='referral'  ?'color:var(--gold);':'') +
        '</ul>' +
        '<div class="sh-right">' +
          '<button class="cart-btn" onclick="toggleCart()">' +
            '<svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">' +
              '<path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>' +
              '<line x1="3" y1="6" x2="21" y2="6"/>' +
              '<path d="M16 10a4 4 0 01-8 0"/>' +
            '</svg>' +
            '<span class="cart-count" id="cartCount">0</span>' +
          '</button>' +
          '<div id="headerGuest">' +
            '<button class="nav-login-btn" onclick="openAuthModal()">登录 / 注册</button>' +
          '</div>' +
          '<div id="headerUser" style="display:none;position:relative;">' +
            '<div class="sh-user" onclick="toggleUserDropdown()">' +
              '<div class="sh-avatar" id="userAvatar">U</div>' +
              '<span id="userNameDisplay" style="color:rgba(255,255,255,0.6);font-size:.78rem;"></span>' +
              '<span style="color:rgba(255,255,255,0.3);font-size:.65rem;margin-left:.2rem;">▾</span>' +
            '</div>' +
            '<div id="userDropdown" style="display:none;position:absolute;top:calc(100%+8px);right:0;' +
                'background:var(--deep);border:1px solid rgba(201,168,76,0.2);border-radius:8px;' +
                'min-width:160px;overflow:hidden;z-index:100;">' +
              '<div style="padding:.6rem 1rem;font-size:.78rem;color:rgba(255,255,255,0.35);' +
                  'border-bottom:1px solid rgba(255,255,255,0.06);" id="dropUserEmail"></div>' +
              '<a href="account.html" style="display:block;padding:.7rem 1rem;color:rgba(255,255,255,0.6);' +
                  'font-size:.82rem;text-decoration:none;"' +
                  ' onmouseover="this.style.color=\'var(--gold)\'" onmouseout="this.style.color=\'rgba(255,255,255,0.6)\'">👤 我的账户</a>' +
              '<a href="referral.html" style="display:block;padding:.7rem 1rem;color:rgba(255,255,255,0.6);' +
                  'font-size:.82rem;text-decoration:none;"' +
                  ' onmouseover="this.style.color=\'var(--gold)\'" onmouseout="this.style.color=\'rgba(255,255,255,0.6)\'">🤝 推荐好友</a>' +
              '<button onclick="logout()" style="width:100%;text-align:left;padding:.7rem 1rem;' +
                  'background:none;border:none;color:rgba(255,255,255,0.6);font-size:.82rem;cursor:pointer;"' +
                  ' onmouseover="this.style.color=\'var(--gold)\'" onmouseout="this.style.color=\'rgba(255,255,255,0.6)\'">退出登录</button>' +
            '</div>' +
          '</div>' +
          '<button class="ham-btn" onclick="toggleMobileNav()">' +
            '<span></span><span></span><span></span>' +
          '</button>' +
        '</div>' +
      '</header>';
  }

  // ─── Mobile Nav ───────────────────────────────────────────────
  var mobileNavMount = document.getElementById('mobile-nav-mount');
  if (mobileNavMount) {
    // Same reasoning as navCat() above: only call showCategory() directly
    // when already on the home page; otherwise navigate to index.html first.
    function mobileNavCat(catKey, label) {
      if (page === 'home') {
        return '<a onclick="showCategory(\'' + catKey + '\');toggleMobileNav()">' + label + '</a>';
      }
      return '<a href="index.html#' + catKey + '">' + label + '</a>';
    }
    mobileNavMount.innerHTML =
      '<div class="mobile-nav" id="mobileNav">' +
        '<button class="mobile-nav-close" onclick="toggleMobileNav()">✕</button>' +
        '<a href="index.html">首页</a>' +
        mobileNavCat('wine',   '🍷 红酒') +
        mobileNavCat('health', '💊 大健康') +
        mobileNavCat('beauty', '✨ 美妆护肤') +
        mobileNavCat('food',   '🌿 功能性食品') +
        '<a href="membership.html"' + (page==='membership' ? ' style="color:var(--gold);"' : '') + '>💎 会员权益</a>' +
        '<a href="referral.html"'  + (page==='referral'   ? ' style="color:var(--gold);"' : '') + '>🤝 推荐好友</a>' +
        '<a href="account.html"'   + (page==='account'    ? ' style="color:var(--gold);"' : '') + '>👤 我的账户</a>' +
        '<a onclick="toggleCart();toggleMobileNav()" style="cursor:pointer;">🛒 购物车</a>' +
        '<a id="mobileLoginLink" onclick="openAuthModal();toggleMobileNav()" ' +
            'style="color:rgba(255,255,255,0.5);font-size:.9rem;">登录 / 注册</a>' +
        '<a id="mobileLogoutLink" onclick="logout();toggleMobileNav()" ' +
            'style="display:none;color:rgba(255,255,255,0.4);font-size:.85rem;">退出登录</a>' +
      '</div>';
  }

})();
