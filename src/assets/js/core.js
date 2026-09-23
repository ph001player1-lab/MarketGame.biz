/* Общие данные и помощники для остальных скриптов сайта.

   Всё, что нужно браузеру — цены, штаты, расписание, адрес приёма заявок, —
   лежит в самой странице блоком <script id="mg-data">. Его собирает
   src/_data/client.js из тех же файлов, что и шаблоны, поэтому цифры
   на странице и в скриптах не могут разойтись.

   Выбор посетителя («кто вы», штат, рынки) хранится в localStorage
   под ключом mg.profile — только в его браузере, на сервер не уходит. */

(function () {
  'use strict';

  var node = document.getElementById('mg-data');
  var D = {};
  try { D = node ? JSON.parse(node.textContent) : {}; } catch (e) { D = {}; }

  var byAbbr = {};
  (D.states || []).forEach(function (s) { byAbbr[s.abbr] = s; });

  var KEY = 'mg.profile';

  function readProfile() {
    try {
      var p = JSON.parse(localStorage.getItem(KEY));
      return p && typeof p === 'object' ? p : null;
    } catch (e) { return null; }
  }

  function saveProfile(p) {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* приватный режим */ }
  }

  // --- часовые пояса -----------------------------------------------------
  // Браузер не знает, в каком штате человек, но знает его часовой пояс.
  // По поясу почти всегда видно, США это или нет, а для нескольких штатов
  // пояс свой собственный — там штат определяется сразу.

  var GROUP = {};
  function zones(group, list) { list.forEach(function (z) { GROUP[z] = group; }); }
  zones('ET', ['America/New_York', 'America/Detroit', 'America/Kentucky/Louisville',
    'America/Kentucky/Monticello', 'America/Louisville', 'America/Indiana/Indianapolis',
    'America/Indiana/Vincennes', 'America/Indiana/Winamac', 'America/Indiana/Marengo',
    'America/Indiana/Petersburg', 'America/Indiana/Vevay', 'America/Indianapolis',
    'America/Fort_Wayne', 'US/Eastern', 'US/Michigan', 'US/East-Indiana']);
  zones('CT', ['America/Chicago', 'America/Indiana/Tell_City', 'America/Indiana/Knox',
    'America/Knox_IN', 'America/Menominee', 'America/North_Dakota/Center',
    'America/North_Dakota/New_Salem', 'America/North_Dakota/Beulah', 'US/Central',
    'US/Indiana-Starke']);
  zones('MT', ['America/Denver', 'America/Boise', 'America/Phoenix', 'US/Mountain', 'US/Arizona']);
  zones('PT', ['America/Los_Angeles', 'US/Pacific']);
  zones('AK', ['America/Anchorage', 'America/Juneau', 'America/Sitka', 'America/Metlakatla',
    'America/Yakutat', 'America/Nome', 'America/Adak', 'US/Alaska', 'US/Aleutian']);
  zones('HI', ['Pacific/Honolulu', 'US/Hawaii']);

  // Территории США: страна та же, но в наших 51 штатах их нет
  var US_OTHER = ['America/Puerto_Rico', 'America/St_Thomas', 'Pacific/Guam',
    'Pacific/Saipan', 'Pacific/Pago_Pago'];

  function stateByZone(tz) {
    if (/^(America\/Phoenix|US\/Arizona)$/.test(tz)) return 'AZ';
    if (/^(Pacific\/Honolulu|US\/Hawaii)$/.test(tz)) return 'HI';
    if (GROUP[tz] === 'AK') return 'AK';
    if (tz === 'America/Boise') return 'ID';
    if (/^(America\/Detroit|America\/Menominee|US\/Michigan)$/.test(tz)) return 'MI';
    if (/^America\/Indiana\//.test(tz) ||
        /^(America\/Indianapolis|America\/Fort_Wayne|America\/Knox_IN|US\/East-Indiana|US\/Indiana-Starke)$/.test(tz)) return 'IN';
    if (/^America\/Kentucky\//.test(tz) || tz === 'America/Louisville') return 'KY';
    if (/^America\/North_Dakota\//.test(tz)) return 'ND';
    return null;
  }

  function detect() {
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { tz = ''; }
    var group = GROUP[tz] || null;
    return {
      tz: tz,
      known: !!tz,
      us: !!group || US_OTHER.indexOf(tz) !== -1,
      group: group,
      state: stateByZone(tz)
    };
  }

  // --- форматирование ------------------------------------------------------

  var usd = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0
  });

  function money(n) {
    var v = Math.round(Number(n) || 0);
    return (v < 0 ? '−' : '') + usd.format(Math.abs(v));
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.MG = {
    data: D,
    state: function (abbr) { return byAbbr[abbr] || null; },
    profile: readProfile,
    saveProfile: saveProfile,
    detect: detect,
    money: money,
    esc: esc
  };
})();
