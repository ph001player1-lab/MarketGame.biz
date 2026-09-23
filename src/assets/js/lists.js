/* Списки на страницах.

   - Страница штата: поиск по списку палат (data-chlist).
   - Страница для банков: выбор штатов присутствия банка (data-avail).
     Выбранные штаты уходят в форму заявки через data-lead-states. */

(function () {
  'use strict';

  Array.prototype.forEach.call(document.querySelectorAll('[data-chlist]'), function (list) {
    var input = list.querySelector('[data-chlist-search]');
    var items = list.querySelectorAll('.ch');
    var count = list.querySelector('[data-chlist-count]');
    var none = list.querySelector('[data-chlist-none]');
    var total = items.length;
    if (!input) return;

    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      var shown = 0;
      Array.prototype.forEach.call(items, function (li) {
        var hit = !q || (li.getAttribute('data-find') || '').indexOf(q) !== -1;
        li.hidden = !hit;
        if (hit) shown++;
      });
      if (count) count.textContent = q ? shown + ' of ' + total + ' chambers' : total + ' chambers';
      if (none) none.hidden = shown !== 0;
    });
  });

  var avail = document.querySelector('[data-avail]');
  if (avail) {
    var boxes = avail.querySelectorAll('input[type="checkbox"]');
    var sum = avail.querySelector('[data-avail-sum]');
    var go = avail.querySelector('[data-avail-go]');
    var profile = window.MG ? window.MG.profile() : null;

    // Штат, который посетитель уже выбирал, отмечаем сразу
    if (profile && profile.state) {
      Array.prototype.forEach.call(boxes, function (b) { if (b.value === profile.state) b.checked = true; });
    }

    var update = function () {
      var chosen = Array.prototype.filter.call(boxes, function (b) { return b.checked; });
      var open = chosen.filter(function (b) { return b.getAttribute('data-open') === '1'; }).length;
      if (sum) {
        sum.textContent = chosen.length
          ? chosen.length + (chosen.length === 1 ? ' state' : ' states') + ' selected · banking partner spot open in ' + open
          : 'No states selected.';
      }
      if (go) {
        go.setAttribute('data-lead-states', chosen.map(function (b) { return b.getAttribute('data-name'); }).join(', '));
      }
    };

    Array.prototype.forEach.call(boxes, function (b) { b.addEventListener('change', update); });
    update();
  }
})();
