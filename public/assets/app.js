/* FJ ZONE app: service worker + install prompt (Android one-tap, iPhone instructions) */
(function () {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
  }
  var ar = (document.documentElement.lang || '').indexOf('ar') === 0;
  var SHARE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
  var T = ar ? {
    t: 'ثبّت تطبيق FJ ZONE', s: 'تسوّق أسرع من شاشتك الرئيسية', b: 'تثبيت',
    ios: 'اضغط ' + SHARE + ' «مشاركة» ثم «إضافة إلى الشاشة الرئيسية»',
    inapp: 'افتح هذه الصفحة في Safari لتثبيت التطبيق', x: 'إغلاق',
    andro: 'من قائمة المتصفح ⋮ اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»', done: 'التطبيق مثبّت على جهازك ✓'
  } : {
    t: 'Get the FJ ZONE app', s: 'Shop faster from your home screen', b: 'Install',
    ios: 'Tap ' + SHARE + ' Share, then “Add to Home Screen”',
    inapp: 'Open this page in Safari to install the app', x: 'Close',
    andro: 'Open the browser menu ⋮ and tap “Install app” or “Add to Home screen”', done: 'The app is installed on this device ✓'
  };
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  var ua = navigator.userAgent || '';
  var isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var inApp = /Instagram|FBAN|FBAV|Line\/|TikTok|Snapchat/.test(ua);
  var deferred = null;
  var dismissedAt = 0; try { dismissedAt = +localStorage.getItem('fjz-app-x') || 0; } catch (e) {}
  var allowed = function () { return !standalone && Date.now() - dismissedAt > 7 * 864e5 && window.innerWidth < 900; };

  function css() {
    if (document.getElementById('fjzAppCss')) return;
    var s = document.createElement('style'); s.id = 'fjzAppCss';
    s.textContent = '#fjzApp{position:fixed;left:10px;right:10px;bottom:10px;z-index:9999;background:#121110;color:#EFEBE1;border:1.5px solid #F2B705;border-radius:12px;padding:12px;display:flex;align-items:center;gap:12px;box-shadow:0 10px 30px rgba(0,0,0,.35);font:14px/1.35 Archivo,system-ui,sans-serif;animation:fjzUp .35s ease}' +
      '#fjzApp img{width:48px;height:48px;border-radius:10px;flex:0 0 auto}#fjzApp b{display:block;font-size:15px}#fjzApp small{color:#cfc9bb;display:block;margin-top:2px}' +
      '#fjzApp .go{margin-inline-start:auto;flex:0 0 auto;background:#F2B705;color:#121110;border:0;border-radius:8px;padding:10px 14px;font-weight:800;font-size:14px;cursor:pointer}' +
      '#fjzApp .x{background:transparent;border:0;color:#a9a396;font-size:22px;line-height:1;cursor:pointer;padding:0 4px;flex:0 0 auto}' +
      '[dir=rtl] #fjzApp{font-family:Cairo,Archivo,sans-serif}@keyframes fjzUp{from{transform:translateY(120%)}to{transform:none}}';
    document.head.appendChild(s);
  }
  function close() { var b = document.getElementById('fjzApp'); if (b) b.remove(); try { localStorage.setItem('fjz-app-x', Date.now()); } catch (e) {} }
  function banner(mode) {
    if (!allowed() || document.getElementById('fjzApp')) return;
    css();
    var b = document.createElement('div'); b.id = 'fjzApp'; b.setAttribute('role', 'dialog'); b.setAttribute('aria-label', T.t);
    var sub = mode === 'ios' ? (inApp ? T.inapp : T.ios) : T.s;
    b.innerHTML = '<img src="/icons/icon-192.png" alt=""><div><b>' + T.t + '</b><small>' + sub + '</small></div>' +
      (mode === 'android' ? '<button class="go" type="button">' + T.b + '</button>' : '') +
      '<button class="x" type="button" aria-label="' + T.x + '">×</button>';
    document.body.appendChild(b);
    b.querySelector('.x').onclick = close;
    var g = b.querySelector('.go'); if (g) g.onclick = install;
  }
  function install() {
    if (deferred) {
      deferred.prompt();
      deferred.userChoice.then(function () { deferred = null; var b = document.getElementById('fjzApp'); if (b) b.remove(); });
      return true;
    }
    return false;
  }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; banner('android'); updateAppPage(); });
  window.addEventListener('appinstalled', function () { var b = document.getElementById('fjzApp'); if (b) b.remove(); updateAppPage(true); });
  if (isIOS && !standalone) setTimeout(function () { banner('ios'); }, 2500);

  /* the /app/ page: one button that does the right thing on each phone */
  function updateAppPage(installed) {
    var btn = document.getElementById('fjzInstallBtn'), msg = document.getElementById('fjzInstallMsg');
    if (!btn || !msg) return;
    if (standalone || installed) { btn.hidden = true; msg.textContent = T.done; return; }
    btn.hidden = false;
    btn.onclick = function () {
      if (install()) return;
      msg.innerHTML = isIOS ? (inApp ? T.inapp : T.ios) : T.andro;
    };
  }
  document.addEventListener('DOMContentLoaded', function () { updateAppPage(); });
})();
