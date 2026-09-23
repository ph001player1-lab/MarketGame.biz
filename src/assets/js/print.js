/* Документы для печати и сохранения в PDF: /print/brief/, /print/prospectus/,
   /print/bank/.

   Поля на панели сверху (название палаты, спонсор, штат, контакт)
   подставляются в документ сразу при вводе и сохраняются в адресе
   страницы — такую ссылку можно переслать коллеге. Кнопка «Save as PDF»
   открывает окно печати браузера, где нужно выбрать «Сохранить как PDF». */

(function () {
  'use strict';

  var node = document.getElementById('mg-data');
  var D = {};
  try { D = JSON.parse(node.textContent); } catch (e) { D = {}; }

  var byAbbr = {};
  (D.states || []).forEach(function (s) { byAbbr[s.abbr] = s; });

  var params = new URLSearchParams(location.search);
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('mg.profile')); } catch (e) { saved = null; }

  var values = {};
  var inputs = document.querySelectorAll('[data-input]');
  Array.prototype.forEach.call(inputs, function (el) {
    var key = el.getAttribute('data-input');
    var v = params.get(key) || '';
    if (key === 'state') v = (v || (saved && saved.state) || '').toUpperCase();
    values[key] = v;
    el.value = v;
    el.addEventListener('input', function () { values[key] = el.value.trim(); update(); remember(); });
    el.addEventListener('change', function () { values[key] = el.value.trim(); update(); remember(); });
  });

  function zoneOf(s) {
    if (s.tz === 'America/Phoenix') return 'Mountain Time (no daylight saving)';
    return ((D.zones || {})[s.group] || '') + ' Time';
  }

  function money(n) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  }

  function derived() {
    var s = byAbbr[values.state];
    var d = {};
    Object.keys(values).forEach(function (k) { d[k] = values[k]; });
    if (s) {
      d.stateName = s.name;
      d.stateSlug = s.slug;
      d.zone = zoneOf(s);
      d.founding = s.f ? 'Taken' : 'Open — pilot for ' + money((D.pricing || {}).foundingPilot || 750);
      d.bank = s.b === 'open' ? 'Open' : (s.bn || 'In place');
      d.active = String(s.a || 0);
    }
    // Строка про цену Founding Chamber нужна, пока место в штате не занято
    // (или штат не выбран)
    d['founding-open'] = !s || !s.f ? 'yes' : '';
    return d;
  }

  function update() {
    var d = derived();
    Array.prototype.forEach.call(document.querySelectorAll('[data-fill]'), function (el) {
      var v = d[el.getAttribute('data-fill')];
      el.textContent = v || el.getAttribute('data-empty') || '';
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-show-if]'), function (el) {
      el.hidden = !d[el.getAttribute('data-show-if')];
    });
  }

  function remember() {
    var q = new URLSearchParams();
    Object.keys(values).forEach(function (k) { if (values[k]) q.set(k, values[k]); });
    var qs = q.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
  }

  var save = document.querySelector('[data-save]');
  if (save) save.addEventListener('click', function () { window.print(); });

  update();
})();
