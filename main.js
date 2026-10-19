/* ======================================================================
   main.js — ДТП ЗАКОН: UTM/аналитика (first/last touch) + мобильное меню
   (бургер → панель справа + оверлей + аккордеоны, паттерн miglaw.ru)
   + карусель статей и счётчики подписчиков на главной.
   UTM-метки из URL пишутся в cookie и улетают с заявкой в amoCRM
   (forms.js → /api/lead.php).
   ====================================================================== */
(function () {
  "use strict";

  // Метка текущей страницы (pg-osago-neustoyka и т.п.) — для точных стилей
  // и уникальных иллюстраций шапки без правки каждого HTML
  (function () {
    var parts = location.pathname.split("/").filter(Boolean);
    if (parts.length) document.body.classList.add("pg-" + parts.join("-"));
  })();

  // ==================== UTM first/last touch ====================
  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "yclid", "gclid", "roistat"];
  var COOKIE_FIRST = "dtp_first_touch";
  var COOKIE_LAST = "dtp_last_touch";
  var COOKIE_DAYS = 90;

  function readCookie(name) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function writeCookie(name, value, days) {
    var d = new Date();
    d.setTime(d.getTime() + days * 864e5);
    document.cookie = name + "=" + encodeURIComponent(value) + "; expires=" + d.toUTCString() + "; path=/; SameSite=Lax";
  }
  function collectFromUrl() {
    var params = new URLSearchParams(window.location.search);
    var touch = {};
    UTM_KEYS.forEach(function (k) {
      var v = params.get(k);
      if (v) touch[k] = v;
    });
    if (Object.keys(touch).length && document.referrer) touch.referrer = document.referrer;
    return touch;
  }
  function captureTouches() {
    var cur = collectFromUrl();
    if (!Object.keys(cur).length) return;
    cur.landing = window.location.pathname;
    writeCookie(COOKIE_LAST, JSON.stringify(cur), COOKIE_DAYS);
    if (!readCookie(COOKIE_FIRST)) writeCookie(COOKIE_FIRST, JSON.stringify(cur), COOKIE_DAYS);
  }
  function parse(raw) {
    if (!raw) return {};
    try { return JSON.parse(raw); } catch (e) { return {}; }
  }
  function getTouches() {
    return { first: parse(readCookie(COOKIE_FIRST)), last: parse(readCookie(COOKIE_LAST)) };
  }

  captureTouches();
  window.DTP = { getTouches: getTouches };
})();

// ==================== МОБИЛЬНОЕ МЕНЮ + ДРОПДАУНЫ ====================
(function () {
  var burger = document.querySelector('.burger');
  var nav = document.querySelector('.main-nav');
  var overlay = document.querySelector('.nav-overlay');
  if (!burger || !nav) return;

  var MOBILE = function () { return window.matchMedia('(max-width: 1279px)').matches; };

  function closeMenu() {
    nav.classList.remove('open');
    burger.classList.remove('open');
    burger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('nav-open');
    if (overlay) overlay.classList.remove('show');
    nav.querySelectorAll('.has-dropdown.open').forEach(function (li) { li.classList.remove('open'); });
  }
  function openMenu() {
    nav.classList.add('open');
    burger.classList.add('open');
    burger.setAttribute('aria-expanded', 'true');
    document.body.classList.add('nav-open');
    if (overlay) overlay.classList.add('show');
  }

  burger.addEventListener('click', function () {
    nav.classList.contains('open') ? closeMenu() : openMenu();
  });
  if (overlay) overlay.addEventListener('click', closeMenu);

  // На мобильном: тап по разделу — переключить аккордеон (открыть/закрыть), без перехода.
  // Сам раздел доступен по первой ссылке внутри списка.
  nav.querySelectorAll('.has-dropdown > a').forEach(function (link) {
    link.addEventListener('click', function (e) {
      if (MOBILE()) {
        e.preventDefault();
        var li = link.parentElement;
        var isOpen = li.classList.contains('open');
        nav.querySelectorAll('.has-dropdown.open').forEach(function (o) { if (o !== li) o.classList.remove('open'); });
        li.classList.toggle('open', !isOpen);
      }
    });
  });

  // Клик по обычной ссылке — закрыть меню
  nav.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () {
      if (MOBILE() && link.parentElement.classList.contains('has-dropdown')) return;
      if (MOBILE()) closeMenu();
    });
  });

  // Esc закрывает меню
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
  window.addEventListener('resize', function () { if (!MOBILE()) closeMenu(); });
})();

// ==================== ПОДСВЕТКА ТЕКУЩЕГО РАЗДЕЛА ====================
(function () {
  var path = window.location.pathname;
  document.querySelectorAll('.main-nav > ul > li > a').forEach(function (link) {
    var href = link.getAttribute('href') || '';
    if (href === '/') return;
    if (path.indexOf(href) === 0) link.classList.add('active');
  });
})();

// ==================== КАРУСЕЛЬ СТАТЕЙ НА ГЛАВНОЙ ====================
(function () {
  var carousel = document.querySelector('.news-carousel');
  if (!carousel) return;
  var track = carousel.querySelector('.nc-track');
  var prev = carousel.querySelector('.nc-prev');
  var next = carousel.querySelector('.nc-next');
  if (!track) return;
  function step() {
    var card = track.querySelector('.nc-card');
    var w = card ? card.getBoundingClientRect().width : 300;
    return w + 18; // ширина карточки + gap
  }
  if (prev) prev.addEventListener('click', function () { track.scrollBy({ left: -step() * 2, behavior: 'smooth' }); });
  if (next) next.addEventListener('click', function () { track.scrollBy({ left: step() * 2, behavior: 'smooth' }); });
})();

// ==================== СЧЁТЧИК ПОДПИСЧИКОВ (count-up) ====================
(function () {
  var nums = document.querySelectorAll('.subs-num[data-count]');
  if (!nums.length) return;
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function animate(el) {
    var target = parseInt(el.getAttribute('data-count'), 10) || 0;
    var dur = 1600, start = null;
    function tick(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      el.textContent = fmt(Math.floor(eased * target));
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = fmt(target);
    }
    requestAnimationFrame(tick);
  }
  if (!('IntersectionObserver' in window)) { nums.forEach(animate); return; }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { animate(e.target); io.unobserve(e.target); }
    });
  }, { threshold: 0.4 });
  nums.forEach(function (n) { io.observe(n); });
})();

// ==================== БЛОК «ЭТО ВАЖНО КАЖДОМУ» (статьи) ====================
(function () {
  var lead = document.querySelector('article.article p.lead');
  if (!lead || document.querySelector('.for-everyone')) return;
  var box = document.createElement('aside');
  box.className = 'for-everyone';
  box.innerHTML =
    '<b>Эта информация важна каждому.</b>' +
    '<span>Не важно, кто вы — опытный водитель, молодой родитель, пенсионер, пешеход или владелец бизнеса. Правила после ДТП одинаковы для всех, и закон на вашей стороне. Объясняем простым языком, без юридических терминов: что делать, какие сроки и как получить полную сумму.</span>' +
    '<div class="for-everyone-cats">' +
    '<i>Водителям</i><i>Семьям с детьми</i><i>Пенсионерам</i><i>Пешеходам и пассажирам</i><i>Владельцам бизнеса</i>' +
    '</div>';
  lead.insertAdjacentElement('afterend', box);
  var st = document.createElement('style');
  st.textContent =
    '.for-everyone{display:block;margin:20px 0 28px;padding:20px 24px;background:#F4F0DE;border:1px solid #E6E2CC;border-left:4px solid #348856;border-radius:12px}' +
    '.for-everyone b{display:block;font-size:18px;color:#16301F;margin-bottom:8px}' +
    '.for-everyone span{display:block;font-size:15px;line-height:1.6;color:#51685B}' +
    '.for-everyone-cats{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}' +
    '.for-everyone-cats i{font-style:normal;font-size:13px;font-weight:600;color:#134026;background:#FFFEF9;border:1px solid #CFC9A9;border-radius:999px;padding:6px 14px}';
  document.head.appendChild(st);
})();

// Карусель новостей на главной (стрелки прокрутки)
document.addEventListener('click', function (e) {
  var btn = e.target.closest('.nc-btn');
  if (!btn) return;
  var track = btn.closest('.news-carousel').querySelector('.nc-track');
  if (!track) return;
  var cardEl = track.querySelector('.nc-card');
  var step = cardEl ? cardEl.offsetWidth + 18 : 320;
  track.scrollBy({ left: btn.classList.contains('nc-prev') ? -step : step, behavior: 'smooth' });
});
