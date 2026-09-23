/* Первый экран и всё, что зависит от выбора посетителя.

   - Форма «кто вы / где работают ваши участники» (data-selector):
     запоминает выбор и ведёт на страницу штата, Nationwide или International.
   - Карта штатов (data-map): подсвечивает часовой пояс посетителя и
     запоминает штат, по которому он кликнул.
   - Страница штата: раскрывает модули Nationwide и International,
     если посетитель их отметил.
   - Шапка: плашка с выбранным штатом.
   - <body data-who>: банку и спонсору блок для банков поднимается выше. */

(function () {
  'use strict';

  var MG = window.MG;
  if (!MG) return;

  var body = document.body;
  var page = body.getAttribute('data-page');
  var pageState = body.getAttribute('data-state') || '';
  var detected = MG.detect();
  var profile = MG.profile();

  var WHERE = {
    chamber: 'Where do your members do business?',
    bank: 'Where do you want to reach business owners?',
    sponsor: 'Where do you want to reach business owners?'
  };
  var ZONE = { ET: 'Eastern', CT: 'Central', MT: 'Mountain', PT: 'Pacific', AK: 'Alaska', HI: 'Hawaii' };

  function who() {
    return (profile && profile.who) || (page === 'banks' ? 'bank' : 'chamber');
  }

  function remember(changes) {
    var p = profile || { who: who(), scopes: [], state: '' };
    Object.keys(changes).forEach(function (k) { p[k] = changes[k]; });
    profile = p;
    MG.saveProfile(p);
  }

  function addScope(scope) {
    var scopes = (profile && profile.scopes ? profile.scopes : []).slice();
    if (scopes.indexOf(scope) === -1) scopes.push(scope);
    return scopes;
  }

  function destination(scopes, abbr) {
    var s = MG.state(abbr);
    if (scopes.indexOf('state') !== -1 && s) return '/' + s.slug + '/';
    if (scopes.indexOf('us') !== -1) return '/nationwide/';
    if (scopes.indexOf('intl') !== -1) return '/international/';
    return '/';
  }

  body.setAttribute('data-who', who());

  // --- форма первого экрана ------------------------------------------------

  function initSelector(form) {
    var whoInputs = form.querySelectorAll('input[name="who"]');
    var scopeInputs = form.querySelectorAll('input[name="scope"]');
    var select = form.querySelector('select[name="state"]');
    var whereLabel = form.querySelector('[data-where-label]');
    var note = form.querySelector('[data-detect-note]');
    var err = form.querySelector('[data-pick-err]');

    var scopes;
    var abbr = pageState || (profile && profile.state) || detected.state || '';

    if (profile && profile.scopes && profile.scopes.length) {
      scopes = profile.scopes.slice();
      if (pageState && scopes.indexOf('state') === -1) scopes.push('state');
    } else if (page === 'nationwide') {
      scopes = ['us'];
    } else if (page === 'international') {
      scopes = ['intl'];
    } else if (page === 'state') {
      scopes = ['state'];
    } else if (detected.known && !detected.us) {
      scopes = ['intl'];
    } else {
      scopes = ['state'];
    }

    function setWho(value) {
      Array.prototype.forEach.call(whoInputs, function (i) { i.checked = i.value === value; });
      if (whereLabel) whereLabel.textContent = WHERE[value] || WHERE.chamber;
    }

    setWho(who());
    Array.prototype.forEach.call(scopeInputs, function (i) {
      i.checked = scopes.indexOf(i.value) !== -1;
    });
    if (select) select.value = abbr;

    // Подсказка только тем, кто ещё ничего не выбирал: остальным она не нужна
    if (note && !profile && detected.known) {
      var text = '';
      if (!detected.us) {
        text = 'Outside the U.S.? We have selected "Internationally" for you.';
      } else if (detected.state && !pageState) {
        text = 'Looks like you are in ' + MG.state(detected.state).name + '.';
      } else if (detected.group && !pageState) {
        text = 'Looks like you are on ' + ZONE[detected.group] + ' Time — choose your state.';
      }
      if (text) { note.textContent = text; note.hidden = false; }
    }

    Array.prototype.forEach.call(whoInputs, function (i) {
      i.addEventListener('change', function () { setWho(i.value); });
    });

    // Выбрали штат — значит, «в нашем штате» тоже отмечено
    if (select) {
      select.addEventListener('change', function () {
        var box = form.querySelector('input[name="scope"][value="state"]');
        if (box && select.value) box.checked = true;
        if (err) err.hidden = true;
      });
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var chosenWho = (form.querySelector('input[name="who"]:checked') || {}).value || 'chamber';
      var chosen = Array.prototype.filter.call(scopeInputs, function (i) { return i.checked; })
        .map(function (i) { return i.value; });
      var st = select ? select.value : '';

      function fail(message, focus) {
        if (err) { err.textContent = message; err.hidden = false; }
        if (focus) focus.focus();
      }

      if (!chosen.length) return fail('Choose at least one option.', scopeInputs[0]);
      if (chosen.indexOf('state') !== -1 && !st) return fail('Choose your state.', select);

      remember({ who: chosenWho, scopes: chosen, state: st });
      body.setAttribute('data-who', chosenWho);

      var dest = destination(chosen, st);
      if (dest === location.pathname) {
        // Уже на нужной странице: раскрываем выбранные модули без перезагрузки
        applyScopes();
        var next = document.querySelector('.flow');
        if (next) next.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        location.href = dest;
      }
    });
  }

  // --- карта ---------------------------------------------------------------

  function initMap(map) {
    var mine = profile && profile.state;
    var group = !mine && detected.us ? detected.group : null;

    Array.prototype.forEach.call(map.querySelectorAll('.tile'), function (tile) {
      var abbr = tile.getAttribute('data-state');
      if (mine && abbr === mine) tile.classList.add('tile--mine');
      if (group && tile.getAttribute('data-group') === group) tile.classList.add('tile--zone');

      tile.addEventListener('click', function () {
        // Ссылка откроется сама — успеваем только запомнить выбор
        remember({ scopes: addScope('state'), state: abbr });
      });
    });

    var note = document.querySelector('[data-map-note]');
    var legend = document.querySelector('[data-legend-zone]');
    if (group) {
      if (legend) legend.hidden = false;
      if (note) {
        note.textContent = 'Highlighted: states on ' + ZONE[group] + ' Time, like your device.';
        note.hidden = false;
      }
    }
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-scope-link]'), function (link) {
    link.addEventListener('click', function () {
      remember({ scopes: addScope(link.getAttribute('data-scope-link')) });
    });
  });

  // --- модули Nationwide и International на странице штата -----------------

  function applyScopes() {
    var scopes = (profile && profile.scopes) || [];
    Array.prototype.forEach.call(document.querySelectorAll('[data-scope-module]'), function (m) {
      var on = scopes.indexOf(m.getAttribute('data-scope-module')) !== -1;
      m.classList.toggle('scope--on', on);
      if (on) m.open = true;
    });
  }

  // --- плашка в шапке ------------------------------------------------------

  function initChip(chip) {
    if (!profile) return;
    var s = MG.state(profile.state);
    var scopes = profile.scopes || [];
    if (s && scopes.indexOf('state') !== -1) {
      chip.textContent = s.name;
      chip.href = '/' + s.slug + '/';
    } else if (scopes.indexOf('us') !== -1) {
      chip.textContent = 'Across the U.S.';
      chip.href = '/nationwide/';
    } else if (scopes.indexOf('intl') !== -1) {
      chip.textContent = 'International';
      chip.href = '/international/';
    } else {
      return;
    }
    chip.title = 'Your program';
    chip.hidden = false;
  }

  // Посетитель зашёл на страницу штата по прямой ссылке — считаем её его штатом,
  // но только если он ещё ничего не выбирал сам
  if (page === 'state' && pageState && !profile) {
    remember({ who: who(), scopes: ['state'], state: pageState });
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-selector]'), initSelector);
  Array.prototype.forEach.call(document.querySelectorAll('[data-map]'), initMap);
  Array.prototype.forEach.call(document.querySelectorAll('[data-profile-chip]'), initChip);
  applyScopes();
})();
