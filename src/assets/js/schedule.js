/* Открытые игры: одна в месяц в каждом штате, по местному времени штата.

   Расписание не хранится готовым списком, а вычисляется от сегодняшней даты
   по правилам из src/_data/states.json (поле game: какая неделя месяца,
   день недели и время). Поэтому оно не устаревает само по себе.

   Время привязано к поясу штата, а не к UTC: при переходе на летнее время
   игра остаётся в те же 19:00 по местному.

   Отменить игру — строка в src/_data/schedule.json → exceptions:
     "2026-12-24"      — в этот день не проводится ничего;
     "2026-12-24 TX"   — отменена только игра в Техасе.

   Работа с поясами — та же, что в schedule.js на marketgame.club. */

(function () {
  'use strict';

  var MG = window.MG;
  if (!MG) return;

  var hosts = document.querySelectorAll('[data-open-games]');
  if (!hosts.length) return;

  var D = MG.data;
  var S = D.schedule || {};
  var FORMAT = (D.pricing && D.pricing.formats && D.pricing.formats[S.format]) || { name: 'Open game' };
  var HOURS = Number(S.hours) || 2.5;
  var HORIZON = Number(S.horizonDays) || 100;
  var SKIP = S.exceptions || [];

  // --- часовые пояса ---------------------------------------------------------

  /** Смещение часового пояса в миллисекундах в конкретный момент времени. */
  function zoneOffset(ts, tz) {
    var p = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(new Date(ts)).forEach(function (x) { p[x.type] = x.value; });
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ts;
  }

  /** Момент времени для местного времени в поясе. Два приближения — на случай,
      когда поправка сама переносит момент через границу перевода часов. */
  function zonedInstant(y, m, d, hh, mm, tz) {
    var target = Date.UTC(y, m, d, hh, mm);
    var ts = target;
    for (var i = 0; i < 2; i++) ts = target - zoneOffset(ts, tz);
    return new Date(ts);
  }

  /** Календарная дата в поясе — {y, m, d}. */
  function dateIn(ts, tz) {
    var p = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date(ts)).forEach(function (x) { p[x.type] = x.value; });
    return { y: +p.year, m: +p.month - 1, d: +p.day };
  }

  function iso(y, m, d) {
    return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  // --- список игр ------------------------------------------------------------

  function gamesFor(state, now) {
    var rule = state.game;
    if (!rule) return [];
    var out = [];
    // идём по календарю штата: «второй вторник» считается по его месяцу
    var start = dateIn(now.getTime(), state.tz);
    var cursor = new Date(Date.UTC(start.y, start.m, start.d));
    var hm = String(rule.time || '19:00').split(':');

    for (var i = 0; i <= HORIZON; i++) {
      var y = cursor.getUTCFullYear(), m = cursor.getUTCMonth(), d = cursor.getUTCDate();
      if (cursor.getUTCDay() === rule.weekday && Math.ceil(d / 7) === rule.nth) {
        var day = iso(y, m, d);
        var at = zonedInstant(y, m, d, +hm[0], +hm[1], state.tz);
        var cancelled = SKIP.indexOf(day) !== -1 || SKIP.indexOf(day + ' ' + state.abbr) !== -1;
        if (at > now && !cancelled) {
          out.push({ state: state, at: at, ends: new Date(at.getTime() + HOURS * 3600000), day: day });
        }
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return out;
  }

  // --- отрисовка ---------------------------------------------------------------

  var myZone = '';
  try { myZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { myZone = ''; }
  var rel = typeof Intl.RelativeTimeFormat === 'function'
    ? new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' }) : null;

  function fmt(tz, opts) {
    var o = { timeZone: tz };
    Object.keys(opts).forEach(function (k) { o[k] = opts[k]; });
    return new Intl.DateTimeFormat('en-US', o);
  }

  function daysUntil(at, now) {
    var a = new Date(at), b = new Date(now);
    a.setHours(0, 0, 0, 0); b.setHours(0, 0, 0, 0);
    return Math.round((a - b) / 86400000);
  }

  function joinUrl(g) {
    var base = (D.game && D.game.url) || 'https://marketgame.club/en/';
    // Форма на marketgame.club сохраняет эти метки в заявке — менеджер увидит
    // штат и дату игры, на которую человек записывается
    return base + '?utm_source=marketgame.biz&utm_medium=open_game' +
      '&utm_campaign=' + encodeURIComponent(g.state.abbr) +
      '&utm_content=' + encodeURIComponent(g.day);
  }

  function card(g, now, first, showState) {
    var tz = g.state.tz;
    var day = fmt(tz, { weekday: 'long', month: 'long', day: 'numeric' }).format(g.at);
    var start = fmt(tz, { hour: 'numeric', minute: '2-digit' }).format(g.at);
    var end = fmt(tz, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(g.ends);
    var dleft = daysUntil(g.at, now);
    var when = rel && dleft <= 14 ? rel.format(dleft, 'day') : '';

    // Время посетителя — только если его пояс не совпадает с поясом штата
    var mine = '';
    if (myZone && zoneOffset(g.at.getTime(), myZone) !== zoneOffset(g.at.getTime(), tz)) {
      mine = fmt(myZone, { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
        .format(g.at);
    }

    var title = (showState ? g.state.name + ' · ' : '') + FORMAT.name + ' format';

    return '' +
      '<article class="game' + (first ? ' game--next' : '') + '">' +
        '<div class="game__when">' +
          '<span class="game__date">' + MG.esc(day) + '</span>' +
          (when ? '<span class="game__rel">' + MG.esc(when) + '</span>' : '') +
        '</div>' +
        '<div class="game__what">' +
          (first ? '<span class="game__flag">Next open game</span>' : '') +
          '<h3>' + MG.esc(title) + '</h3>' +
          '<p class="game__time">' + MG.esc(start) + ' – ' + MG.esc(end) + '</p>' +
          (mine ? '<p class="game__mine">Your time: ' + MG.esc(mine) + '</p>' : '') +
        '</div>' +
        '<div class="game__go"><a class="btn" href="' + MG.esc(joinUrl(g)) + '">Join</a></div>' +
      '</article>';
  }

  function render(host) {
    var which = host.getAttribute('data-open-games');
    var limit = Number(host.getAttribute('data-limit')) || 3;
    var now = new Date();
    var list = [];

    if (which === 'all') {
      (D.states || []).forEach(function (s) { list = list.concat(gamesFor(s, now)); });
    } else {
      var s = MG.state(which);
      if (s) list = gamesFor(s, now);
    }
    list.sort(function (a, b) { return a.at - b.at; });
    list = list.slice(0, limit);

    if (!list.length) {
      host.innerHTML = '<p class="games__empty">No open games in the next few weeks. Request a demo game instead — we will set it up at a time that suits you.</p>';
      return;
    }
    host.innerHTML = list.map(function (g, i) { return card(g, now, i === 0, which === 'all'); }).join('');
  }

  Array.prototype.forEach.call(hosts, render);
  // страницу могут оставить открытой надолго — пересчитываем раз в полчаса
  setInterval(function () { Array.prototype.forEach.call(hosts, render); }, 30 * 60 * 1000);
})();
