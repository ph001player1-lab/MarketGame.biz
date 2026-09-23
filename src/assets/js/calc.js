/* Калькулятор окупаемости для палаты.

   Считает: выручку от билетов (цены за команду — из pricing.json → formats,
   со скидкой для членов палаты), взнос спонсора и стоимость программы
   (пакет, доплата за Elite, игры сверх пакета, опции). Итог — что остаётся
   палате. Цены берутся из той же таблицы, что и карточки на странице. */

(function () {
  'use strict';

  var MG = window.MG;
  if (!MG) return;

  var root = document.querySelector('[data-calc]');
  if (!root) return;

  var form = root.querySelector('[data-calc-form]');
  var P = MG.data.pricing;
  var FORMATS = ['start', 'growth', 'elite'];
  var money = MG.money;

  var out = {};
  Array.prototype.forEach.call(root.querySelectorAll('[data-out]'), function (el) {
    out[el.getAttribute('data-out')] = el;
  });
  var hint = root.querySelector('[data-calc-hint]');
  var sponsorLabel = root.querySelector('[data-sponsor-label]');
  var presetButtons = root.querySelectorAll('[data-preset]');

  // Примеры из концепции. «year» совпадает со значениями по умолчанию в HTML.
  var YEAR_GAMES = { start: 5, growth: 6, elite: 1 };
  var YEAR_TEAMS = { start: 12, growth: 14, elite: 7 };
  var PRESETS = {
    owners:    { pkg: 'pilot', single: 'growth', teams: { growth: 16 }, share: 0, discount: 0, sponsor: 0 },
    elite:     { pkg: 'pilot', single: 'elite', teams: { elite: 6 }, share: 0, discount: 0, sponsor: 0 },
    beginners: { pkg: 'pilot', single: 'start', teams: { start: 20 }, share: 0, discount: 0, sponsor: 0 },
    year:      { pkg: 'annual', games: YEAR_GAMES, teams: YEAR_TEAMS, share: 60, discount: 20, sponsor: 0 },
    sponsored: { pkg: 'annual', games: YEAR_GAMES, teams: YEAR_TEAMS, share: 60, discount: 20, sponsor: P.packages.annual.price }
  };

  function field(name) { return form.elements[name]; }

  function num(name, min, max) {
    var el = field(name);
    var n = Math.round(parseFloat(el && el.value));
    if (!isFinite(n)) n = 0;
    return Math.min(max, Math.max(min, n));
  }

  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  function applyPreset(key) {
    var p = PRESETS[key];
    if (!p) return;
    field('pkg').value = p.pkg;
    if (p.single) field('single').value = p.single;
    field('founding').checked = false;
    FORMATS.forEach(function (f) {
      if (p.games) field('games_' + f).value = p.games[f] || 0;
      if (p.teams && p.teams[f] != null) field('teams_' + f).value = p.teams[f];
    });
    field('memberShare').value = p.share;
    field('memberDiscount').value = p.discount;
    field('sponsor').value = p.sponsor;
    field('spanish').value = 0;
    field('inPerson').value = 0;
    Array.prototype.forEach.call(presetButtons, function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-preset') === key));
    });
    compute();
  }

  function compute() {
    var pkg = field('pkg').value || 'annual';
    var single = pkg !== 'annual';
    root.setAttribute('data-mode', single ? 'single' : 'annual');
    root.classList.toggle('calc--pilot', pkg === 'pilot');

    // Скидка действует только на команды членов палаты
    var mult = 1 - (num('memberShare', 0, 100) / 100) * (num('memberDiscount', 0, 100) / 100);
    var revenue = 0, cost = 0, games = 0, eliteGames = 0;
    var parts = [];
    var pick = field('single').value || 'growth';

    FORMATS.forEach(function (f) {
      var row = root.querySelector('[data-row="' + f + '"]');
      if (row) row.classList.toggle('calc__row--off', single && f !== pick);
    });

    if (single) {
      var teams = num('teams_' + pick, 0, 20);
      revenue = teams * P.formats[pick].ticket * mult;
      games = 1;
      eliteGames = pick === 'elite' ? 1 : 0;
      var base = pkg === 'pilot'
        ? (field('founding').checked ? P.foundingPilot : P.packages.pilot.price)
        : P.packages.signature.price;
      cost = base;
      parts.push(P.packages[pkg].name + (pkg === 'pilot' && field('founding').checked ? ' (Founding Chamber)' : '') + ' ' + money(base));
      if (hint) hint.textContent = 'One ' + P.formats[pick].name + ' game.';
    } else {
      FORMATS.forEach(function (f) {
        var g = num('games_' + f, 0, 24);
        var t = num('teams_' + f, 0, 20);
        games += g;
        if (f === 'elite') eliteGames = g;
        revenue += g * t * P.formats[f].ticket * mult;
      });
      var included = P.packages.annual.games;
      cost = P.packages.annual.price;
      parts.push(P.packages.annual.name + ' ' + money(cost));
      var extra = Math.max(0, games - included);
      if (extra) {
        cost += extra * P.options.extraGame;
        parts.push(plural(extra, 'extra game') + ' ' + money(extra * P.options.extraGame));
      }
      if (hint) {
        hint.textContent = games === included
          ? included + ' of ' + included + ' games planned.'
          : games < included
            ? games + ' of ' + included + ' games planned — ' + (included - games) + ' left unused.'
            : games + ' games: ' + extra + ' beyond the package at ' + money(P.options.extraGame) + ' each.';
      }
    }

    if (eliteGames) {
      cost += eliteGames * P.options.elite;
      parts.push(plural(eliteGames, 'Elite game') + ' ' + money(eliteGames * P.options.elite));
    }

    var spanish = num('spanish', 0, games);
    var inPerson = num('inPerson', 0, games);
    if (spanish) {
      cost += spanish * P.options.spanish;
      parts.push(plural(spanish, 'Spanish-language game') + ' ' + money(spanish * P.options.spanish));
    }
    if (inPerson) {
      cost += inPerson * P.options.inPerson;
      parts.push(plural(inPerson, 'in-person host') + ' ' + money(inPerson * P.options.inPerson));
    }

    var sponsor = num('sponsor', 0, 10000000);
    var result = revenue + sponsor - cost;
    if (sponsorLabel) sponsorLabel.textContent = single ? 'Sponsor pays, $' : 'Sponsor pays, $ a year';

    out.result.textContent = (result > 0 ? '+' : '') + money(result);
    out.result.classList.toggle('plus', result >= 0);
    out.result.classList.toggle('minus', result < 0);
    out.revenue.textContent = money(revenue);
    out.sponsor.textContent = money(sponsor);
    out.cost.textContent = money(cost);
    out.breakdown.textContent = 'Cost: ' + parts.join(' · ');

    if (result >= 0 && sponsor >= cost) {
      out.verdict.textContent = 'The sponsor covers the program — every ticket dollar is your income.';
    } else if (result >= 0) {
      out.verdict.textContent = 'The program pays for itself.';
    } else {
      out.verdict.textContent = 'Short by ' + money(-result) + ' — a sponsor or your program budget covers the gap.';
    }

    // Сколько команд нужно, чтобы окупить программу без спонсора.
    // Для одной игры — в её формате; для года — одна игра Elite или
    // Growth-команды в каждой игре.
    var need = cost - sponsor;
    if (need <= 0 || mult <= 0) {
      out.breakeven.textContent = '';
    } else if (single) {
      var fmt = P.formats[pick];
      var n = Math.ceil(need / (fmt.ticket * mult));
      out.breakeven.textContent = n <= 20
        ? 'Covering ' + money(need) + ' takes ' + plural(n, fmt.name + ' team') + '.'
        : fmt.name + ' tickets alone can\u2019t cover ' + money(need) + ': it would take ' + n +
          ' teams, and a game holds 20. That is where a sponsor comes in.';
    } else {
      var elite = Math.ceil(need / (P.formats.elite.ticket * mult));
      var growth = Math.ceil(need / (Math.max(games, 1) * P.formats.growth.ticket * mult));
      out.breakeven.textContent = 'Covering ' + money(need) + ' takes ' + plural(elite, 'Elite team') +
        ' in one game' + (growth <= 20 ? ' — or ' + plural(growth, 'Growth team') + ' in every game' : '') + '.';
    }
  }

  Array.prototype.forEach.call(presetButtons, function (b) {
    b.addEventListener('click', function () { applyPreset(b.getAttribute('data-preset')); });
  });

  form.addEventListener('input', function () {
    Array.prototype.forEach.call(presetButtons, function (b) { b.setAttribute('aria-pressed', 'false'); });
    compute();
  });
  form.addEventListener('change', compute);
  form.addEventListener('submit', function (e) { e.preventDefault(); });

  Array.prototype.forEach.call(presetButtons, function (b) {
    b.setAttribute('aria-pressed', String(b.getAttribute('data-preset') === 'year'));
  });
  compute();
})();
