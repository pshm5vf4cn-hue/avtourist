/* ======================================================================
   widget.js — ДТП ЗАКОН: плавающий виджет «Задайте вопрос юристу».
   Сценарий диалога:
     1) бот спрашивает регион (чипы: Москва / МО / СПб / ЛО / другой);
     2) пользователь пишет свой вопрос;
     3) бот «печатает» ответ посимвольно и предлагает оставить телефон;
     4) форма имя + телефон → window.Forms.submitLead → /api/lead.php (amoCRM).
   Подключать ПОСЛЕ main.js и forms.js.
   ====================================================================== */
(function () {
  "use strict";

  var CSS = [
    "body>.lw-fab{position:fixed !important;right:22px;bottom:22px;z-index:9999;width:64px;height:64px;border-radius:50%;border:3px solid #fff;padding:0;cursor:pointer;background:linear-gradient(135deg,#2f8156,#173b28);box-shadow:0 8px 24px rgba(23,59,40,.35);transition:transform .25s ease}",
    "body>.lw-fab:hover{transform:scale(1.06)}",
    "body>.lw-fab img{width:100%;height:100%;border-radius:50%;display:block}",
    "body>.lw-fab::after{content:'';position:absolute;inset:-6px;border-radius:50%;border:2px solid rgba(47,129,86,.55);animation:lwPulse 2.4s ease-out infinite}",
    "body>.lw-fab.lw-seen::after{display:none}",
    "@keyframes lwPulse{0%{transform:scale(.85);opacity:1}70%{transform:scale(1.25);opacity:0}100%{opacity:0}}",
    "body>.lw-tip{position:fixed !important;right:96px;bottom:34px;z-index:9999;background:#fff;color:#1c2b23;font:600 14px/1.35 inherit;padding:10px 14px;border-radius:14px 14px 4px 14px;box-shadow:0 8px 28px rgba(23,59,40,.22);cursor:pointer;max-width:210px;animation:lwTipIn .4s ease;transition:opacity .3s,transform .3s}",
    "body>.lw-tip.lw-hide{opacity:0;transform:translateY(8px);pointer-events:none}",
    "@keyframes lwTipIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}",
    "body>.lw-panel{position:fixed !important;right:22px;bottom:22px;z-index:10000;width:360px;max-width:calc(100vw - 24px);max-height:min(640px,calc(100vh - 32px));display:flex;flex-direction:column;background:rgba(255,255,255,.97);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(23,59,40,.08);border-radius:20px;box-shadow:0 24px 64px rgba(23,59,40,.30);overflow:hidden;font:15px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;animation:lwPanelIn .3s ease}",
    ".lw-panel[hidden]{display:none}",
    "@keyframes lwPanelIn{from{opacity:0;transform:translateY(16px) scale(.97)}to{opacity:1;transform:none}}",
    ".lw-head{display:flex;align-items:center;gap:12px;padding:13px 16px;background:linear-gradient(135deg,#236146,#173b28);color:#fff;flex:none}",
    ".lw-head img{width:46px;height:46px;border-radius:50%;border:2px solid rgba(255,255,255,.5)}",
    ".lw-who{flex:1;min-width:0}.lw-who b{display:block;font-size:15px}.lw-status{display:flex;align-items:center;gap:6px;font-size:12px;opacity:.85;min-height:15px}",
    ".lw-dot{width:8px;height:8px;border-radius:50%;background:#43d47d;box-shadow:0 0 0 3px rgba(67,212,125,.25);flex:none}",
    ".lw-dot.lw-typing{background:#f5c542;box-shadow:0 0 0 3px rgba(245,197,66,.25);animation:lwBlink 1s ease-in-out infinite}",
    "@keyframes lwBlink{50%{opacity:.4}}",
    ".lw-close{flex:none;width:32px;height:32px;border:0;border-radius:50%;background:rgba(255,255,255,.14);color:#fff;font-size:18px;line-height:1;cursor:pointer}",
    ".lw-close:hover{background:rgba(255,255,255,.28)}",
    ".lw-body{padding:16px;overflow-y:auto;flex:1;display:flex;flex-direction:column}",
    ".lw-msg{max-width:88%;padding:10px 13px;border-radius:14px;font-size:14px;line-height:1.5;margin-bottom:10px;white-space:pre-wrap;word-wrap:break-word}",
    ".lw-msg-in{background:#eef5f0;border-radius:14px 14px 14px 4px;color:#1c2b23;align-self:flex-start}",
    ".lw-msg-out{background:#236146;color:#fff;border-radius:14px 14px 4px 14px;align-self:flex-end}",
    ".lw-chips{display:flex;flex-wrap:wrap;gap:8px;margin:2px 0 12px;align-self:flex-start}",
    ".lw-chips button{border:1px solid rgba(47,129,86,.4);background:#fff;color:#236146;font:600 13px/1 inherit;padding:9px 12px;border-radius:999px;cursor:pointer;transition:background .2s,color .2s}",
    ".lw-chips button:hover{background:#eef5f0}",
    ".lw-chips button:disabled{opacity:.55;cursor:default}",
    ".lw-chips button.lw-on{background:#236146;color:#fff;border-color:#236146}",
    ".lw-qrow{display:flex;gap:8px;margin:2px 0 12px}",
    ".lw-qrow input{flex:1;min-width:0;box-sizing:border-box;border:1px solid #ccd8d0;border-radius:12px;padding:11px 12px;font:14px/1.2 inherit;background:#fff;color:#1c2b23;outline:none;transition:border-color .2s,box-shadow .2s}",
    ".lw-qrow input:focus{border-color:#2f8156;box-shadow:0 0 0 3px rgba(47,129,86,.15)}",
    ".lw-qrow button{flex:none;border:0;border-radius:12px;padding:0 16px;background:linear-gradient(135deg,#2f8156,#1d5c3f);color:#fff;font:700 13.5px/1 inherit;cursor:pointer}",
    ".lw-qrow button:disabled{opacity:.6;cursor:default}",
    ".lw-form label{display:block;font-size:13px;color:#44554c;margin:0 0 6px}",
    ".lw-form input[type=text],.lw-form input[type=tel]{width:100%;box-sizing:border-box;border:1px solid #ccd8d0;border-radius:10px;padding:11px 12px;font:15px/1.2 inherit;background:#fff;color:#1c2b23;margin-bottom:10px;outline:none;transition:border-color .2s,box-shadow .2s}",
    ".lw-form input:focus{border-color:#2f8156;box-shadow:0 0 0 3px rgba(47,129,86,.15)}",
    ".lw-form .phone-field{display:flex;gap:6px}.lw-form .phone-field input{margin-bottom:0}",
    ".lw-form select.phone-cc{border:1px solid #ccd8d0;border-radius:10px;background:#fff;font:14px/1 inherit;padding:0 6px;max-width:118px}",
    ".lw-form .phone-error{display:none;color:#c0392b;font-size:12px;margin:4px 0 8px}",
    ".lw-hp{position:absolute !important;left:-9999px !important;width:1px;height:1px;opacity:0}",
    ".lw-send{width:100%;border:0;border-radius:12px;padding:13px;background:linear-gradient(135deg,#2f8156,#1d5c3f);color:#fff;font:700 15px/1 inherit;cursor:pointer;transition:transform .2s,box-shadow .2s}",
    ".lw-send:hover{transform:translateY(-1px);box-shadow:0 8px 20px rgba(47,129,86,.35)}",
    ".lw-send:disabled{opacity:.6;cursor:default;transform:none;box-shadow:none}",
    ".lw-note{font-size:11.5px;color:#7d8c83;margin:10px 0 0}.lw-note a{color:#236146}",
    ".lw-done,.lw-fail{padding:14px;border-radius:12px;font-size:14px;line-height:1.55;margin-top:4px}",
    ".lw-done{background:#eef5f0;border:1px solid rgba(47,129,86,.25)}",
    ".lw-fail{background:#fdf0ee;border:1px solid rgba(192,57,43,.25)}",
    ".lw-done a,.lw-fail a{color:#236146;font-weight:600;white-space:nowrap}",
    "@media (max-width:520px){.lw-panel{right:12px;left:12px;bottom:12px;width:auto}.lw-tip{right:90px;max-width:180px}.lw-fab{right:16px;bottom:16px;width:58px;height:58px}}"
  ].join("\n");

  function injectStyles() {
    var s = document.createElement("style");
    s.id = "lw-styles";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  var PANEL_HTML =
    '<div class="lw-panel" role="dialog" aria-label="Вопрос дежурному юристу" hidden>' +
      '<div class="lw-head">' +
        '<img src="/img/mascot-lawyer.svg" alt="">' +
        '<div class="lw-who"><b>Дежурный юрист</b>' +
        '<span class="lw-status"><i class="lw-dot"></i><span class="lw-status-text">онлайн</span></span></div>' +
        '<button type="button" class="lw-close" aria-label="Закрыть окно">×</button>' +
      '</div>' +
      '<div class="lw-body">' +
        '<div class="lw-msg lw-msg-in">Здравствуйте! Я дежурный юрист проекта «ДТП ЗАКОН». Отвечу бесплатно. Подскажите, из какого вы региона?</div>' +
        '<div class="lw-chips">' +
          '<button type="button" data-region="Москва">Москва</button>' +
          '<button type="button" data-region="Московская область">Московская область</button>' +
          '<button type="button" data-region="Санкт-Петербург">Санкт-Петербург</button>' +
          '<button type="button" data-region="Ленинградская область">Ленинградская область</button>' +
          '<button type="button" data-region="Другой регион">Другой регион</button>' +
        '</div>' +
        '<div class="lw-qrow" hidden>' +
          '<input type="text" name="question" placeholder="Напишите ваш вопрос…" maxlength="600">' +
          '<button type="button" class="lw-qsend">Отправить</button>' +
        '</div>' +
        '<form class="lw-form" novalidate hidden>' +
          '<label>Куда перезвонить юристу?</label>' +
          '<input type="text" name="name" placeholder="Ваше имя" autocomplete="name" required>' +
          '<input type="tel" name="phone" placeholder="+7 (___) ___-__-__" autocomplete="tel" required>' +
          '<input type="text" name="url" class="lw-hp" tabindex="-1" autocomplete="off" aria-hidden="true">' +
          '<button type="submit" class="lw-send">Жду звонка юриста</button>' +
          '<p class="lw-note">Нажимая кнопку, вы соглашаетесь с <a href="/politika.html" target="_blank" rel="noopener">политикой обработки персональных данных</a></p>' +
        '</form>' +
        '<div class="lw-done" hidden><b>Заявка принята.</b> Юрист свяжется с вами в ближайшее рабочее время. Срочно? Позвоните сами: <a href="tel:88005501313">8&nbsp;800&nbsp;550-13-13</a> — бесплатно.</div>' +
        '<div class="lw-fail" hidden>Не получилось отправить заявку. Позвоните нам: <a href="tel:88005501313">8&nbsp;800&nbsp;550-13-13</a> — консультация бесплатная.</div>' +
      '</div>' +
    '</div>';

  var FAB_HTML =
    '<button type="button" class="lw-fab" aria-label="Задать вопрос юристу">' +
      '<img src="/img/mascot-lawyer.svg" alt="">' +
    '</button>' +
    '<div class="lw-tip lw-hide" role="button" tabindex="0">Задайте вопрос юристу — онлайн</div>';

  function init() {
    if (!window.Forms || !window.Forms.submitLead) return; // без канала отправки не показываем
    if (document.querySelector(".lw-fab")) return;

    injectStyles();
    var wrap = document.createElement("div");
    wrap.innerHTML = FAB_HTML + PANEL_HTML;
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);

    var fab = document.querySelector(".lw-fab");
    var tip = document.querySelector(".lw-tip");
    var panel = document.querySelector(".lw-panel");
    var body = panel.querySelector(".lw-body");
    var closeBtn = panel.querySelector(".lw-close");
    var statusText = panel.querySelector(".lw-status-text");
    var statusDot = panel.querySelector(".lw-dot");
    var chipsBox = panel.querySelector(".lw-chips");
    var chips = chipsBox.querySelectorAll("button");
    var qrow = panel.querySelector(".lw-qrow");
    var qinput = qrow.querySelector("input");
    var qsend = qrow.querySelector(".lw-qsend");
    var form = panel.querySelector(".lw-form");
    var done = panel.querySelector(".lw-done");
    var fail = panel.querySelector(".lw-fail");

    var region = "";
    var question = "";
    var typingTimer = null;

    var phoneApi = window.Forms.enhancePhone(form.querySelector('input[type="tel"]'));

    function scrollBottom() { body.scrollTop = body.scrollHeight; }

    function addMsg(text, cls) {
      var m = document.createElement("div");
      m.className = "lw-msg " + cls;
      m.textContent = text;
      body.insertBefore(m, qrow); // сообщения всегда над полем ввода
      scrollBottom();
      return m;
    }

    function setTyping(on) {
      statusDot.classList.toggle("lw-typing", on);
      statusText.textContent = on ? "печатает…" : "онлайн";
    }

    // Печатающийся ответ бота: посимвольный вывод + статус «печатает…»
    function botReply(text, cb) {
      setTyping(true);
      var m = document.createElement("div");
      m.className = "lw-msg lw-msg-in";
      body.insertBefore(m, qrow);
      var i = 0;
      clearInterval(typingTimer);
      typingTimer = setInterval(function () {
        i += 2;
        m.textContent = text.slice(0, i);
        scrollBottom();
        if (i >= text.length) {
          clearInterval(typingTimer);
          m.textContent = text;
          setTyping(false);
          scrollBottom();
          if (cb) cb();
        }
      }, 18);
    }

    function openPanel() {
      panel.hidden = false;
      fab.classList.add("lw-seen");
      hideTip(true);
      try { sessionStorage.setItem("dtpl_widget_seen", "1"); } catch (e) {}
      scrollBottom();
    }

    function closePanel() {
      panel.hidden = true;
      clearInterval(typingTimer);
      setTyping(false);
    }

    function hideTip(permanent) {
      tip.classList.add("lw-hide");
      if (permanent) { try { sessionStorage.setItem("dtpl_tip_hide", "1"); } catch (e) {} }
    }

    fab.addEventListener("click", function () {
      if (panel.hidden) openPanel(); else closePanel();
    });
    closeBtn.addEventListener("click", closePanel);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !panel.hidden) closePanel();
    });

    // Шаг 1: выбор региона
    chips.forEach(function (b) {
      b.addEventListener("click", function () {
        if (region) return;
        region = b.getAttribute("data-region") || "";
        chips.forEach(function (x) { x.disabled = true; });
        b.classList.add("lw-on");
        addMsg(region, "lw-msg-out");
        botReply("Принято. А теперь опишите вашу ситуацию или вопрос — своими словами, парой предложений.", function () {
          qrow.hidden = false;
          qinput.focus();
          scrollBottom();
        });
      });
    });

    // Шаг 2: вопрос пользователя
    function sendQuestion() {
      var v = qinput.value.trim();
      if (!v) { qinput.focus(); return; }
      if (question) return; // один вопрос — один ответ
      question = v;
      qsend.disabled = true;
      qinput.disabled = true;
      addMsg(v, "lw-msg-out");
      botReply(
        "Спасибо, вопрос понятен. Такие ситуации решаются — юрист изучит детали и подскажет точный план действий по вашему региону. " +
        "Оставьте имя и телефон — перезвоним в рабочее время (пн–пт 10:00–19:00, сб 11:00–17:00) и бесплатно проконсультируем.",
        function () {
          form.hidden = false;
          var nameInput = form.querySelector('input[name="name"]');
          if (nameInput) nameInput.focus();
          scrollBottom();
        }
      );
    }
    qsend.addEventListener("click", sendQuestion);
    qinput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); sendQuestion(); }
    });

    // Шаг 3: контакты → отправка лида
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (phoneApi && !phoneApi.validate()) return;
      var name = form.querySelector('input[name="name"]').value.trim();
      if (!name) { form.querySelector('input[name="name"]').focus(); return; }
      var btn = form.querySelector(".lw-send");
      btn.disabled = true;
      btn.textContent = "Отправляем…";

      window.Forms.submitLead({
        subject: "Виджет — вопрос юристу",
        name: name,
        phone: phoneApi ? phoneApi.e164() : form.querySelector('input[type="tel"]').value,
        topic: "Виджет — " + (region || "регион не указан"),
        message: question || "",
        company_site: form.querySelector('input[name="url"]').value
      }).then(function (ok) {
        form.hidden = true;
        qrow.hidden = true;
        (ok ? done : fail).hidden = false;
        scrollBottom();
      });
    });

    // Плашка-приглашение — один раз за сессию, через 3,5 сек
    var seen = false;
    try { seen = !!sessionStorage.getItem("dtpl_tip_hide"); } catch (e) {}
    if (!seen) {
      setTimeout(function () {
        if (panel.hidden) tip.classList.remove("lw-hide");
      }, 3500);
    }
    tip.addEventListener("click", function () { openPanel(); });
    tip.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPanel(); }
    });
  }

  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
})();
