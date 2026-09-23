/* Заявка на демо-игру — главная цель сайта.

   Одна форма на три случая: палата, банк, спонсор. Поля у них разные,
   переключатель типа стоит вверху формы. Тип по умолчанию — то, что
   посетитель выбрал на первом экране.

   Форму открывает любая кнопка с атрибутом data-lead:
     data-lead=""          — тип из выбора посетителя (или «палата»);
     data-lead="bank"      — сразу форма банка;
     data-lead-org="…"     — подставить название организации;
     data-lead-note="…"    — пометка для менеджера («Founding Chamber claim — Texas»);
     data-lead-states="…"  — штаты для банка или спонсора.

   Отправка — как на marketgame.club: POST в Google Apps Script
   (apps-script/Code.gs), который пишет строку в таблицу и шлёт
   уведомление в Telegram. Адрес — src/_data/site.json → formEndpoint. */

(function () {
  'use strict';

  var MG = window.MG;
  if (!MG) return;

  var D = MG.data;
  var esc = MG.esc;
  var doc = document;
  var dialog, form, statusBox, submitBtn, noteBox, openedAt, lastFocus, currentNote = '';

  var TYPES = {
    chamber: { label: 'A chamber of commerce', org: 'Chamber', orgPh: 'Greater Springfield Chamber of Commerce' },
    bank:    { label: 'A bank or credit union', org: 'Bank or credit union', orgPh: 'First Community Bank' },
    sponsor: { label: 'Another sponsor', org: 'Organization', orgPh: 'Your company' }
  };

  function stateOptions() {
    return '<option value="">Choose a state…</option>' + (D.states || []).map(function (s) {
      return '<option value="' + esc(s.abbr) + '">' + esc(s.name) + '</option>';
    }).join('') + '<option value="INTL">Outside the U.S.</option>';
  }

  function row(id, label, control, hint) {
    return '<div class="lf__row"><label for="' + id + '">' + label + '</label>' + control +
      (hint ? '<span class="lf__hint">' + hint + '</span>' : '') + '</div>';
  }

  function build() {
    dialog = doc.createElement('dialog');
    dialog.className = 'lf';
    dialog.setAttribute('aria-labelledby', 'lfTitle');

    var typeRadios = Object.keys(TYPES).map(function (k) {
      return '<label class="seg__opt"><input type="radio" name="type" value="' + k + '"><span>' +
        esc(TYPES[k].label) + '</span></label>';
    }).join('');

    dialog.innerHTML =
      '<div class="lf__in">' +
        '<button type="button" class="lf__x" aria-label="Close">&times;</button>' +
        '<h2 class="lf__t" id="lfTitle">Request a demo game</h2>' +
        '<p class="lf__sub">Free, 60 minutes, online. A manager will contact you within one business day to agree on a time.</p>' +
        '<p class="lf__note" data-lf-note hidden></p>' +
        '<form class="lf__form" novalidate>' +
          '<fieldset class="lf__type"><legend>I represent</legend><div class="seg seg--sm">' + typeRadios + '</div></fieldset>' +
          '<div class="lf__two">' +
            row('lfName', 'Your name', '<input id="lfName" name="name" type="text" autocomplete="name" required>') +
            row('lfTitle2', 'Job title', '<input id="lfTitle2" name="title" type="text" autocomplete="organization-title">') +
          '</div>' +
          row('lfOrg', '<span data-org-label>Chamber</span>', '<input id="lfOrg" name="org" type="text" autocomplete="organization" required>') +
          '<div class="lf__two">' +
            row('lfEmail', 'Work email', '<input id="lfEmail" name="email" type="email" autocomplete="email" required>') +
            row('lfPhone', 'Phone', '<input id="lfPhone" name="phone" type="tel" autocomplete="tel" placeholder="+1 555 000 0000">') +
          '</div>' +

          '<div data-for="chamber">' +
            '<div class="lf__two">' +
              row('lfState', 'State', '<select id="lfState" name="state">' + stateOptions() + '</select>') +
              row('lfMembers', 'Members', '<select id="lfMembers" name="members"><option value="">—</option><option>Under 100</option><option>100–299</option><option>300–999</option><option>1,000 or more</option></select>') +
            '</div>' +
            row('lfPayer', 'Who would pay for the games?', '<select id="lfPayer" name="payer"><option value="">Not sure yet</option><option>Our chamber</option><option>We are looking for a sponsor</option><option>We already have a sponsor</option></select>') +
            '<fieldset class="lf__row lf__checks"><legend>Our members do business</legend>' +
              '<label class="check"><input type="checkbox" name="scopes" value="state"><span>In our state</span></label>' +
              '<label class="check"><input type="checkbox" name="scopes" value="us"><span>Across the U.S.</span></label>' +
              '<label class="check"><input type="checkbox" name="scopes" value="intl"><span>Internationally</span></label>' +
            '</fieldset>' +
          '</div>' +

          '<div data-for="bank sponsor">' +
            row('lfStates', 'States', '<input id="lfStates" name="states" type="text" placeholder="e.g. Texas, Oklahoma">', 'Where you want to reach business owners.') +
            '<div data-for="sponsor">' + row('lfIndustry', 'Industry', '<input id="lfIndustry" name="industry" type="text">') + '</div>' +
            row('lfInterest', 'Interested in', '<select id="lfInterest" name="interest"><option value="">Not sure yet</option><option>One chamber</option><option>Several chambers</option><option data-for="bank">An exclusive territory</option></select>') +
            '<label class="check lf__row" data-for="bank"><input type="checkbox" name="hosts"><span>We would like our own staff to host games</span></label>' +
          '</div>' +

          row('lfMsg', 'Anything we should know?', '<textarea id="lfMsg" name="message" rows="3"></textarea>') +

          // ловушка для роботов: человек её не видит и не заполняет
          '<div class="lf__trap" aria-hidden="true"><label for="lfWebsite">Website</label>' +
            '<input type="text" id="lfWebsite" name="website" tabindex="-1" autocomplete="off"></div>' +

          '<div class="lf__check"><input type="checkbox" id="lfConsent" name="consent">' +
            '<label for="lfConsent" class="lf__consent">I agree that Market Game may use these details to reply to my request — ' +
            '<a href="/privacy/" target="_blank" rel="noopener">privacy policy</a></label></div>' +

          '<div class="lf__actions"><button type="submit" class="btn">Request a demo game</button></div>' +
          '<p class="lf__status" role="status" aria-live="polite"></p>' +
        '</form>' +
      '</div>';

    doc.body.appendChild(dialog);
    form = dialog.querySelector('form');
    statusBox = dialog.querySelector('.lf__status');
    submitBtn = form.querySelector('button[type="submit"]');
    noteBox = dialog.querySelector('[data-lf-note]');

    dialog.querySelector('.lf__x').addEventListener('click', close);
    dialog.addEventListener('close', function () { if (lastFocus && lastFocus.focus) lastFocus.focus(); });
    // клик по затемнению вокруг формы закрывает её
    dialog.addEventListener('click', function (e) { if (e.target === dialog) close(); });
    Array.prototype.forEach.call(form.querySelectorAll('input[name="type"]'), function (r) {
      r.addEventListener('change', function () { setType(r.value); });
    });
    form.addEventListener('submit', submit);
  }

  function setType(type) {
    if (!TYPES[type]) type = 'chamber';
    Array.prototype.forEach.call(form.querySelectorAll('input[name="type"]'), function (r) {
      r.checked = r.value === type;
    });
    Array.prototype.forEach.call(form.querySelectorAll('[data-for]'), function (el) {
      el.hidden = el.getAttribute('data-for').split(' ').indexOf(type) === -1;
      // Safari не прячет <option hidden>, поэтому такой вариант ещё и выключаем
      if (el.tagName === 'OPTION') el.disabled = el.hidden;
    });
    form.querySelector('[data-org-label]').textContent = TYPES[type].org;
    form.elements.org.placeholder = TYPES[type].orgPh;
  }

  function open(trigger) {
    if (!dialog) build();
    reset();

    var profile = MG.profile() || {};
    var type = trigger.getAttribute('data-lead') || profile.who || 'chamber';
    setType(type);

    var org = trigger.getAttribute('data-lead-org');
    if (org) form.elements.org.value = org;

    currentNote = trigger.getAttribute('data-lead-note') || '';
    noteBox.textContent = currentNote;
    noteBox.hidden = !currentNote;

    var pageState = doc.body.getAttribute('data-state');
    var abbr = pageState || profile.state || '';
    form.elements.state.value = abbr;

    var scopes = profile.scopes || (pageState ? ['state'] : []);
    Array.prototype.forEach.call(form.querySelectorAll('input[name="scopes"]'), function (c) {
      c.checked = scopes.indexOf(c.value) !== -1;
    });

    var states = trigger.getAttribute('data-lead-states');
    var s = MG.state(abbr);
    form.elements.states.value = states || (s ? s.name : '');

    lastFocus = doc.activeElement;
    openedAt = Date.now();
    dialog.showModal();
    form.elements.name.focus();
  }

  function close() { if (dialog && dialog.open) dialog.close(); }

  function reset() {
    form.reset();
    submitBtn.disabled = false;
    submitBtn.textContent = 'Request a demo game';
    setStatus('', '');
    form.classList.remove('lf__form--done');
    var done = dialog.querySelector('.lf__done');
    if (done) done.parentNode.removeChild(done);
    Array.prototype.forEach.call(form.querySelectorAll('.lf__row--bad'), function (r) {
      r.classList.remove('lf__row--bad');
    });
  }

  function setStatus(message, kind, html) {
    statusBox.className = 'lf__status' + (kind ? ' lf__status--' + kind : '');
    if (html) statusBox.innerHTML = html;
    else statusBox.textContent = message;
  }

  function bad(input, message) {
    var r = input.closest('.lf__row');
    if (r) r.classList.add('lf__row--bad');
    setStatus(message, 'bad');
    input.focus();
    return null;
  }

  function validate() {
    Array.prototype.forEach.call(form.querySelectorAll('.lf__row--bad'), function (r) {
      r.classList.remove('lf__row--bad');
    });
    var f = form.elements;
    var type = (form.querySelector('input[name="type"]:checked') || {}).value || 'chamber';
    var email = f.email.value.trim();

    if (!f.name.value.trim()) return bad(f.name, 'Please tell us your name.');
    if (!f.org.value.trim()) return bad(f.org, 'Please tell us your organization.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return bad(f.email, 'Please check your email address.');
    if (!f.consent.checked) { setStatus('Please confirm that we may use your details to reply.', 'bad'); f.consent.focus(); return null; }

    var scopes = Array.prototype.filter.call(form.querySelectorAll('input[name="scopes"]'), function (c) {
      return c.checked;
    }).map(function (c) { return c.value; });

    return {
      type: type,
      name: f.name.value.trim(),
      title: f.title.value.trim(),
      org: f.org.value.trim(),
      email: email,
      phone: f.phone.value.trim(),
      state: type === 'chamber' ? f.state.value : '',
      members: type === 'chamber' ? f.members.value : '',
      payer: type === 'chamber' ? f.payer.value : '',
      scopes: type === 'chamber' ? scopes.join(', ') : '',
      states: type !== 'chamber' ? f.states.value.trim() : '',
      interest: type !== 'chamber' ? f.interest.value : '',
      hosts: type === 'bank' && f.hosts.checked ? 'yes' : '',
      industry: type === 'sponsor' ? f.industry.value.trim() : '',
      message: f.message.value.trim(),
      note: currentNote,
      website: f.website.value,
      elapsed: Date.now() - openedAt,
      page: location.href,
      referrer: doc.referrer,
      utm: location.search.replace(/^\?/, '')
    };
  }

  function fallbackLink() {
    var c = D.contact || {};
    if (c.email) return '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>';
    if (c.whatsapp) return '<a href="' + esc(c.whatsapp) + '" target="_blank" rel="noopener">WhatsApp</a>';
    return '';
  }

  function fail(reason) {
    shown = true;
    var done = dialog.querySelector('.lf__done');
    if (done) done.parentNode.removeChild(done);
    form.classList.remove('lf__form--done');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Request a demo game';
    var link = fallbackLink();
    setStatus('', 'bad', esc(reason) + (link ? ' Please write to us directly: ' + link + '.' : ''));
    if (!dialog.open) dialog.showModal();
  }

  var shown = false;

  function succeed(payload) {
    if (shown) return;
    shown = true;
    form.classList.add('lf__form--done');
    setStatus('', '');
    var box = doc.createElement('div');
    box.className = 'lf__done';
    box.innerHTML = '<h3>Request received</h3>' +
      '<p>A manager will contact you within one business day to agree on a time for your demo game.</p>' +
      '<button type="button" class="btn">Close</button>';
    box.querySelector('button').addEventListener('click', close);
    form.parentNode.insertBefore(box, form.nextSibling);
    box.querySelector('button').focus();

    // Запоминаем, кто пишет: в следующий раз форма откроется с тем же типом
    var p = MG.profile() || { scopes: [], state: '' };
    p.who = payload.type;
    if (payload.state && payload.state !== 'INTL') p.state = payload.state;
    MG.saveProfile(p);
  }

  // Apps Script отвечает медленно, поэтому подтверждение показываем через
  // SHOW_AFTER, а запрос идёт дальше в фоне. Если он всё-таки не дойдёт,
  // подтверждение сменится честной ошибкой.
  var SHOW_AFTER = 1200;

  function submit(event) {
    event.preventDefault();
    var payload = validate();
    if (!payload) return;

    if (!D.endpoint) {
      fail('The request form is not connected yet.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';
    setStatus('', '');
    shown = false;
    var timer = setTimeout(function () { succeed(payload); }, SHOW_AFTER);

    // text/plain — «простой» запрос без предварительного OPTIONS,
    // который Apps Script не умеет обрабатывать
    fetch(D.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      keepalive: true
    })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('http ' + r.status)); })
      .then(function (res) {
        if (!res || res.status !== 'ok') throw new Error('backend');
        clearTimeout(timer);
        succeed(payload);
      })
      .catch(function () {
        clearTimeout(timer);
        fail('Your request did not go through.');
      });
  }

  doc.addEventListener('click', function (event) {
    var trigger = event.target.closest('[data-lead]');
    if (!trigger) return;
    event.preventDefault();
    open(trigger);
  });
})();
