/*
 * Albinet - site behaviour (no libraries).
 *  1. Language toggle (Albanian default, English from assets/js/i18n.js)
 *  2. Mobile menu
 *  3. Footer year
 *  4. Contact form (sends to contact.php without reloading the page)
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'albinet-lang';
  var DEFAULT_LANG = 'sq';
  var SUPPORTED = ['sq', 'en'];
  var root = document.documentElement;
  var dict = window.ALBINET_I18N || {};
  var currentLang = DEFAULT_LANG;

  /* ---------------- 1. Language ---------------- */

  function readStoredLang() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }
  function storeLang(lang) {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* private mode: ignore */ }
  }

  // The Albanian text lives in the HTML. The first time we switch, we remember
  // it on the element so we can switch back without reloading.
  function applyLang(lang) {
    var table = lang === DEFAULT_LANG ? null : (dict[lang] || null);

    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      // Translated elements hold plain text only, so textContent is enough (and XSS-safe).
      if (el._i18nDefault === undefined) el._i18nDefault = el.textContent;
      var key = el.getAttribute('data-i18n');
      var value = table && Object.prototype.hasOwnProperty.call(table, key) ? table[key] : el._i18nDefault;
      if (el.textContent !== value) el.textContent = value;
    }

    var attrNodes = document.querySelectorAll('[data-i18n-attr]');
    for (var j = 0; j < attrNodes.length; j++) {
      var node = attrNodes[j];
      if (!node._i18nAttrDefault) node._i18nAttrDefault = {};
      var pairs = node.getAttribute('data-i18n-attr').split(';');
      for (var k = 0; k < pairs.length; k++) {
        var parts = pairs[k].split(':');
        var attr = (parts[0] || '').trim();
        var attrKey = (parts[1] || '').trim();
        if (!attr || !attrKey) continue;
        if (!(attr in node._i18nAttrDefault)) node._i18nAttrDefault[attr] = node.getAttribute(attr);
        var attrValue = table && Object.prototype.hasOwnProperty.call(table, attrKey) ? table[attrKey] : node._i18nAttrDefault[attr];
        if (attrValue !== null && attrValue !== undefined) node.setAttribute(attr, attrValue);
      }
    }

    root.setAttribute('lang', lang);
    var langInputs = document.querySelectorAll('input[name="lang"]');
    for (var m = 0; m < langInputs.length; m++) langInputs[m].value = lang;
    currentLang = lang;
    root.classList.remove('i18n-pending');
  }

  function initLang() {
    var fromUrl = null;
    try { fromUrl = new URLSearchParams(window.location.search).get('lang'); } catch (e) { /* old browser */ }
    var lang = SUPPORTED.indexOf(fromUrl) !== -1 ? fromUrl : readStoredLang();
    if (SUPPORTED.indexOf(lang) === -1) lang = DEFAULT_LANG;
    if (fromUrl && SUPPORTED.indexOf(fromUrl) !== -1) storeLang(fromUrl);

    if (lang !== DEFAULT_LANG) applyLang(lang);
    else root.classList.remove('i18n-pending');

    var toggles = document.querySelectorAll('[data-lang-toggle]');
    for (var i = 0; i < toggles.length; i++) {
      toggles[i].addEventListener('click', function () {
        var next = currentLang === 'sq' ? 'en' : 'sq';
        storeLang(next);
        applyLang(next);
        // Drop ?lang= from the address so it doesn't override the new choice.
        if (window.history && window.history.replaceState && /[?&]lang=/.test(window.location.search)) {
          var url = window.location.pathname + window.location.search.replace(/([?&])lang=[^&]*&?/, '$1').replace(/[?&]$/, '') + window.location.hash;
          window.history.replaceState(null, '', url);
        }
      });
    }
  }

  /* ---------------- 2. Mobile menu ---------------- */

  function initMenu() {
    var button = document.querySelector('.menu-toggle');
    var nav = document.getElementById('site-nav');
    if (!button || !nav) return;

    function setOpen(open) {
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
      nav.classList.toggle('is-open', open);
      document.body.classList.toggle('menu-open', open);
    }
    function isOpen() { return button.getAttribute('aria-expanded') === 'true'; }

    button.addEventListener('click', function () { setOpen(!isOpen()); });
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.key === 'Esc') && isOpen()) { setOpen(false); button.focus(); }
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a')) setOpen(false);
    });
    if (window.matchMedia) {
      var mq = window.matchMedia('(min-width: 960px)');
      var onChange = function (ev) { if (ev.matches) setOpen(false); };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  }

  /* ---------------- 3. Year ---------------- */

  function initYear() {
    var year = String(new Date().getFullYear());
    var els = document.querySelectorAll('[data-year]');
    for (var i = 0; i < els.length; i++) els[i].textContent = year;
  }

  /* ---------------- 4. Contact form ---------------- */

  var PHONE_RE = /^[0-9+()\s.\-\/]{6,40}$/;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function initForm() {
    var form = document.getElementById('contact-form');
    if (!form) return;
    var statusBox = form.querySelector('.form-status');
    var submit = form.querySelector('button[type="submit"]');
    var label = submit.querySelector('.btn-label');
    var busy = submit.querySelector('.btn-busy');

    function showStatus(type) {
      var items = statusBox.querySelectorAll('[data-status]');
      for (var i = 0; i < items.length; i++) items[i].hidden = items[i].getAttribute('data-status') !== type;
      statusBox.className = 'form-status ' + (type === 'success' ? 'is-success' : 'is-error');
      statusBox.hidden = false;
      statusBox.focus({ preventScroll: true });
      statusBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function setBusy(isBusy) {
      submit.disabled = isBusy;
      label.hidden = isBusy;
      busy.hidden = !isBusy;
    }

    function validate() {
      var firstBad = null;
      function check(field, ok) {
        field.setAttribute('aria-invalid', ok ? 'false' : 'true');
        if (!ok && !firstBad) firstBad = field;
      }
      var name = form.elements.name;
      var phone = form.elements.phone;
      var email = form.elements.email;
      var message = form.elements.message;
      check(name, name.value.trim().length >= 2);
      check(phone, PHONE_RE.test(phone.value.trim()));
      check(email, email.value.trim() === '' || EMAIL_RE.test(email.value.trim()));
      check(message, message.value.trim().length >= 5);
      return firstBad;
    }

    // Clear the red border as soon as the person edits a field.
    form.addEventListener('input', function (e) {
      if (e.target.getAttribute && e.target.getAttribute('aria-invalid') === 'true') e.target.setAttribute('aria-invalid', 'false');
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var bad = validate();
      if (bad) { showStatus('validation'); bad.focus(); return; }

      if (!window.fetch || !window.FormData) { form.submit(); return; } // very old browser: normal POST

      setBusy(true);
      fetch(form.getAttribute('action'), {
        method: 'POST',
        body: new FormData(form),
        headers: { 'Accept': 'application/json', 'X-Requested-With': 'fetch' },
        credentials: 'same-origin'
      })
        .then(function (res) {
          return res.json().catch(function () { return { ok: false, error: 'server' }; });
        })
        .then(function (data) {
          if (data && data.ok) {
            form.reset();
            showStatus('success');
          } else {
            var err = data && data.error;
            showStatus(err === 'rate' ? 'rate' : err === 'validation' ? 'validation' : 'error');
          }
        })
        .catch(function () { showStatus('error'); })
        .then(function () { setBusy(false); });
    });

    // Without JavaScript the form posts normally and contact.php redirects
    // back here with ?sent=1 or ?error=..., so show the matching message.
    var params;
    try { params = new URLSearchParams(window.location.search); } catch (e2) { params = null; }
    if (params) {
      if (params.get('sent') === '1') showStatus('success');
      else if (params.get('error')) {
        var code = params.get('error');
        showStatus(code === 'rate' ? 'rate' : code === 'validation' ? 'validation' : 'error');
      }
    }
  }

  function init() {
    initLang();
    initMenu();
    initYear();
    initForm();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
