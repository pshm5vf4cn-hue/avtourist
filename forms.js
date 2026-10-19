/* ======================================================================
   forms.js — ДТП ЗАКОН: общий модуль форм заявок.
   1) Нормализация и валидация телефона (РФ + СНГ + международный режим),
      с автоопределением страны по введённому коду.
   2) Отправка заявок POST JSON в /api/lead.php → сделка в amoCRM.
      UTM/yclid — из cookie first/last touch (модуль в main.js).
   3) Подключение всех форм .lead-form на странице (виджет переиспользуем:
      форма + рядом .form-success / .form-error).
   Подключается на страницах с формами ПОСЛЕ main.js:
     <script src="/main.js"></script>
     <script src="/forms.js"></script>
   ====================================================================== */
(function () {
  "use strict";

  // ===================== Отправка заявки в amoCRM =====================
  var LEAD_ENDPOINT = "/api/lead.php";

  // Анти-бот подпись — соль должна совпадать с 'bot_salt' в api/config.php.
  var BOT_SALT = "dtpzakon_4b7e2c9a1f";
  var FORM_TS = Date.now();

  function botSignature(ts) {
    var s = ts + ":" + navigator.userAgent + ":" + BOT_SALT;
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  function getTouches() {
    return (window.DTP && window.DTP.getTouches) ? window.DTP.getTouches() : { first: {}, last: {} };
  }

  // Низкоуровневая отправка: POST JSON в /api/lead.php. Возвращает Promise<boolean>.
  // data — «плоский» объект полей формы {subject, name, phone, topic, message, company_site, ...}.
  function submitLead(data) {
    var t = getTouches();
    var payload = {
      fields: {
        name: String(data.name || ""),
        phone: String(data.phone || ""),
        topic: String(data.topic || data.tema || ""),
        message: String(data.message || ""),
        // honeypot: скрытое поле url — боты его заполняют, люди не видят
        _hp: String(data.company_site || data.url || "")
      },
      form: String(data.subject || "konsultaciya").slice(0, 50),
      page: window.location.pathname,
      first_touch: t.first,
      last_touch: t.last,
      ts: FORM_TS,
      sig: botSignature(FORM_TS)
    };
    return fetch(LEAD_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); }).then(function (j) {
      // Цель Метрики form_submit — единая точка для всех форм: сервер подтвердил заявку.
      if (j && j.ok) {
        try { if (window.ym) ym("COUNTER_ID", "reachGoal", "form_submit"); } catch (e) {}
      }
      return !!(j && j.ok);
    }).catch(function () { return false; });
  }

  // Высокоуровневая отправка, используется формами.
  function send(data) {
    return submitLead(data);
  }

  // ===================== Телефон =====================
  // len — допустимые длины НАЦИОНАЛЬНОГО номера (без кода страны).
  var COUNTRIES = [
    { iso: "RU", dial: "7",   flag: "🇷🇺", name: "Россия",       len: [10], ex: "912 345-67-89" },
    { iso: "KZ", dial: "7",   flag: "🇰🇿", name: "Казахстан",    len: [10], ex: "701 234-56-78" },
    { iso: "UZ", dial: "998", flag: "🇺🇿", name: "Узбекистан",   len: [9],  ex: "90 123-45-67" },
    { iso: "TJ", dial: "992", flag: "🇹🇯", name: "Таджикистан",  len: [9],  ex: "90 123-45-67" },
    { iso: "KG", dial: "996", flag: "🇰🇬", name: "Киргизия",     len: [9],  ex: "700 123-456" },
    { iso: "AM", dial: "374", flag: "🇦🇲", name: "Армения",      len: [8],  ex: "77 123-456" },
    { iso: "AZ", dial: "994", flag: "🇦🇿", name: "Азербайджан",  len: [9],  ex: "40 123-45-67" },
    { iso: "BY", dial: "375", flag: "🇧🇾", name: "Беларусь",     len: [9],  ex: "29 123-45-67" },
    { iso: "UA", dial: "380", flag: "🇺🇦", name: "Украина",      len: [9],  ex: "50 123-45-67" },
    { iso: "MD", dial: "373", flag: "🇲🇩", name: "Молдова",      len: [8],  ex: "60 123-456" },
    { iso: "GE", dial: "995", flag: "🇬🇪", name: "Грузия",       len: [9],  ex: "555 12-34-56" },
    { iso: "TM", dial: "993", flag: "🇹🇲", name: "Туркменистан", len: [8],  ex: "65 123-456" },
    // Международный режим: пользователь вводит код страны + номер, проверяем по E.164.
    { iso: "XX", dial: "",    flag: "🌍",             name: "Другая страна", len: null, ex: "код страны и номер" }
  ];

  function byIso(iso) {
    for (var i = 0; i < COUNTRIES.length; i++) if (COUNTRIES[i].iso === iso) return COUNTRIES[i];
    return COUNTRIES[0];
  }
  function maxLen(c) { return c.len ? Math.max.apply(null, c.len) : 0; }

  // Достаём национальный номер (цифры без кода страны) под выбранную страну.
  function nationalDigits(c, raw) {
    var d = String(raw || "").replace(/\D/g, "");
    if (c.iso === "XX") return d; // тут d уже включает код страны
    // убрать ведущий код страны, если ввели его вместе с номером
    if (c.dial && d.indexOf(c.dial) === 0 && d.length > maxLen(c)) d = d.slice(c.dial.length);
    // российский/казахский междугородний «8»
    if ((c.iso === "RU" || c.iso === "KZ") && d.length === 11 && d.charAt(0) === "8") d = d.slice(1);
    return d;
  }

  // Определить страну по номеру, начинающемуся с «+».
  function detectByPlus(raw) {
    var digits = String(raw || "").replace(/\D/g, "");
    var best = null;
    for (var i = 0; i < COUNTRIES.length; i++) {
      var c = COUNTRIES[i];
      if (c.iso === "XX" || !c.dial) continue;
      if (digits.indexOf(c.dial) === 0 && (!best || c.dial.length > best.dial.length)) best = c;
    }
    return best || byIso("XX");
  }

  function isValid(c, natl) {
    if (!natl) return false;
    if (c.iso === "XX") return natl.length >= 8 && natl.length <= 15; // общий E.164
    return c.len.indexOf(natl.length) !== -1;
  }

  function e164(c, natl) {
    if (!natl) return "";
    return c.iso === "XX" ? "+" + natl : "+" + c.dial + natl;
  }

  function buildSelect() {
    var sel = document.createElement("select");
    sel.className = "phone-cc";
    sel.setAttribute("aria-label", "Код страны");
    COUNTRIES.forEach(function (c, i) {
      var o = document.createElement("option");
      o.value = String(i);
      o.textContent = c.flag + " " + (c.dial ? "+" + c.dial : c.name);
      o.title = c.name;
      sel.appendChild(o);
    });
    return sel;
  }

  // Превращает обычный <input type="tel"> в поле с выбором страны и валидацией.
  function enhancePhone(input, opts) {
    if (!input || input.__phone) return input.__phone; // уже улучшено
    opts = opts || {};
    var initial = (opts.value != null ? opts.value : input.value) || "";

    var wrap = document.createElement("div");
    wrap.className = "phone-field";
    var sel = buildSelect();
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(sel);
    wrap.appendChild(input);

    var err = document.createElement("small");
    err.className = "phone-error";
    err.textContent = "Проверьте номер телефона";
    wrap.parentNode.insertBefore(err, wrap.nextSibling);

    var current = byIso("RU");

    function setCountry(iso) {
      current = byIso(iso);
      for (var i = 0; i < COUNTRIES.length; i++) if (COUNTRIES[i] === current) { sel.value = String(i); break; }
      input.placeholder = "Например: " + current.ex;
    }

    function compute() { return nationalDigits(current, input.value); }
    function fire() {
      var natl = compute();
      if (typeof opts.onChange === "function") opts.onChange(e164(current, natl), isValid(current, natl));
    }
    function showError(show) {
      err.style.display = show ? "block" : "none";
      wrap.classList.toggle("invalid", !!show);
    }

    function onInput() {
      if (/^\s*\+/.test(input.value)) setCountry(detectByPlus(input.value).iso);
      showError(false);
      fire();
    }
    function onBlur() {
      var natl = compute();
      if (natl) input.value = natl; // оставляем чистые цифры нац. номера
      showError(natl ? !isValid(current, natl) : false);
      fire();
    }

    sel.addEventListener("change", function () {
      current = COUNTRIES[+sel.value] || current;
      input.placeholder = "Например: " + current.ex;
      showError(false);
      fire();
    });
    input.addEventListener("input", onInput);
    input.addEventListener("blur", onBlur);

    var api = {
      country: function () { return current; },
      digits: compute,
      e164: function () { return e164(current, compute()); },
      valid: function () { var n = compute(); return isValid(current, n); },
      validate: function () { var n = compute(); var ok = isValid(current, n); showError(n ? !ok : true); return ok; }
    };
    input.__phone = api;

    // начальное значение (восстановление / автоопределение)
    if (initial) {
      input.value = initial;
      if (/^\s*\+/.test(initial)) setCountry(detectByPlus(initial).iso);
      else setCountry("RU");
      input.value = compute();
    } else {
      setCountry("RU");
    }
    fire();
    return api;
  }

  // ===================== Подключение форм .lead-form =====================
  // Разметка виджета (переиспользуемая):
  //   <form class="lead-form"> … name/phone/topic … </form>
  //   <div class="form-success" hidden>…</div>
  //   <div class="form-error" hidden>…</div>
  function wireForm(form) {
    if (!form || form.__wired) return;
    form.__wired = true;

    var phoneInput = form.querySelector('input[type="tel"], input[name="phone"]');
    var phoneApi = phoneInput ? enhancePhone(phoneInput) : null;

    // Honeypot: скрытое поле, видно только ботам
    var hp = document.createElement("input");
    hp.type = "text";
    hp.name = "url";
    hp.autocomplete = "off";
    hp.tabIndex = -1;
    hp.setAttribute("aria-hidden", "true");
    hp.style.position = "absolute";
    hp.style.left = "-9999px";
    form.appendChild(hp);

    var box = form.parentElement;
    var success = box ? box.querySelector(".form-success") : null;
    var error = box ? box.querySelector(".form-error") : null;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (phoneApi && !phoneApi.validate()) return;
      var name = form.querySelector('input[name="name"]');
      var topic = form.querySelector('select[name="topic"], input[name="topic"]');
      var message = form.querySelector('textarea[name="message"], input[name="message"]');
      var btn = form.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = "Отправляем…"; }

      send({
        subject: form.getAttribute("data-form") || document.title,
        name: name ? name.value : "",
        phone: phoneApi ? phoneApi.e164() : (phoneInput ? phoneInput.value : ""),
        topic: topic ? topic.value : "",
        message: message ? message.value : "",
        url: hp.value
      }).then(function (ok) {
        form.hidden = true;
        var target = ok ? success : error;
        if (!ok && !error && success) target = success; // нет блока ошибки — показываем успех с дублем на почте
        if (target) target.hidden = false;
        if (!ok && error) {
          var retry = error.querySelector("button");
          if (retry) retry.addEventListener("click", function () {
            error.hidden = true;
            form.hidden = false;
            if (btn) { btn.disabled = false; btn.textContent = "Перезвоните мне"; }
          }, { once: true });
        }
      });
    });
  }

  function initForms() {
    document.querySelectorAll("form.lead-form").forEach(wireForm);
  }
  if (document.readyState !== "loading") initForms();
  else document.addEventListener("DOMContentLoaded", initForms);

  window.Forms = {
    send: send,             // высокоуровневая отправка заявки
    submitLead: submitLead, // низкоуровневая отправка
    enhancePhone: enhancePhone,
    wireForm: wireForm      // ручное подключение динамически добавленной формы
  };
})();
