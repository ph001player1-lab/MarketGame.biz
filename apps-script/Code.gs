/**
 * Market Game (marketgame.biz) — приём заявок на демо-игру.
 *
 * Что делает: принимает заявку с сайта, дописывает строку в Google-таблицу
 * продаж (свой лист для палат, банков и спонсоров) и присылает уведомление
 * в закрытую группу Telegram.
 *
 * Как поставить — подробная инструкция в README, раздел «Заявки». Коротко:
 *   1. В таблице продаж: Расширения → Apps Script.
 *   2. Вставить этот файл целиком вместо содержимого Code.gs.
 *   3. Настройки проекта → Свойства скрипта, добавить два свойства:
 *        BOT_TOKEN  — токен бота от @BotFather
 *        CHAT_ID    — id закрытой группы (с минусом, напр. -1001234567890)
 *      Можно взять того же бота и ту же группу, что у marketgame.club.
 *   4. Развернуть → Новое развёртывание → Веб-приложение,
 *      «Запуск от имени: я», «Доступ: все».
 *   5. Адрес вида .../exec вписать в src/_data/site.json → formEndpoint.
 *
 * ЕСЛИ ЧТО-ТО НЕ РАБОТАЕТ: выберите наверху функцию checkSetup и нажмите
 * «Выполнить» — она проверит ключи, бота, группу и листы.
 *
 * ВАЖНО: токен живёт в свойствах скрипта и на сайт не попадает.
 * Никогда не вписывайте его прямо в этот файл.
 */

var SHEETS = {
  chamber: 'Заявки — палаты',
  bank: 'Заявки — банки',
  sponsor: 'Заявки — спонсоры'
};

var TYPE_LABEL = { chamber: 'Палата', bank: 'Банк', sponsor: 'Спонсор' };

// Колонки каждого листа: [заголовок, поле заявки]
var COLUMNS = {
  chamber: [
    ['Дата', 'date'], ['Имя', 'name'], ['Должность', 'title'], ['Палата', 'org'],
    ['Email', 'email'], ['Телефон', 'phone'], ['Штат', 'state'], ['Членов', 'members'],
    ['Кто платит', 'payer'], ['Рынки участников', 'scopes'], ['Пометка', 'note'],
    ['Сообщение', 'message'], ['Страница', 'page'], ['Источник', 'referrer'], ['UTM', 'utm'],
    ['Статус', 'status']
  ],
  bank: [
    ['Дата', 'date'], ['Имя', 'name'], ['Должность', 'title'], ['Банк', 'org'],
    ['Email', 'email'], ['Телефон', 'phone'], ['Штаты', 'states'], ['Интерес', 'interest'],
    ['Свои ведущие', 'hosts'], ['Пометка', 'note'], ['Сообщение', 'message'],
    ['Страница', 'page'], ['Источник', 'referrer'], ['UTM', 'utm'], ['Статус', 'status']
  ],
  sponsor: [
    ['Дата', 'date'], ['Имя', 'name'], ['Должность', 'title'], ['Организация', 'org'],
    ['Отрасль', 'industry'], ['Email', 'email'], ['Телефон', 'phone'], ['Штаты', 'states'],
    ['Интерес', 'interest'], ['Пометка', 'note'], ['Сообщение', 'message'],
    ['Страница', 'page'], ['Источник', 'referrer'], ['UTM', 'utm'], ['Статус', 'status']
  ]
};

/** Форма шлёт POST. */
function doPost(e) {
  try {
    var data = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // Ловушка от ботов: поле скрыто в вёрстке, человек его не заполнит.
    if (data.website) return ok({ status: 'ok' });

    // Слишком быстрая отправка — почти наверняка робот.
    if (typeof data.elapsed === 'number' && data.elapsed < 2500) return ok({ status: 'ok' });

    var type = COLUMNS[data.type] ? data.type : 'chamber';
    var row = {
      date: new Date(),
      type: type,
      name: clean(data.name, 100),
      title: clean(data.title, 100),
      org: clean(data.org, 160),
      email: clean(data.email, 120),
      phone: clean(data.phone, 40),
      state: clean(data.state, 10),
      members: clean(data.members, 40),
      payer: clean(data.payer, 60),
      scopes: clean(data.scopes, 60),
      states: clean(data.states, 300),
      interest: clean(data.interest, 60),
      hosts: clean(data.hosts, 10),
      industry: clean(data.industry, 100),
      note: clean(data.note, 200),
      message: clean(data.message, 2000),
      page: clean(data.page, 300),
      referrer: clean(data.referrer, 300),
      utm: clean(data.utm, 300),
      status: 'Новая'
    };

    if (!row.name || !row.org || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(row.email)) {
      return ok({ status: 'error', message: 'not enough contact data' });
    }

    appendLead(row);
    notifyTelegram(row);
    return ok({ status: 'ok' });
  } catch (err) {
    console.error(err);
    return ok({ status: 'error', message: 'internal' });
  }
}

/** Проверка развёртывания: откройте адрес /exec в браузере. */
function doGet() {
  var props = PropertiesService.getScriptProperties();
  return ok({
    status: 'ok',
    service: 'marketgame-biz-leads',
    hasToken: !!props.getProperty('BOT_TOKEN'),
    hasChatId: !!props.getProperty('CHAT_ID')
  });
}

function appendLead(row) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = getSheet(row.type);
    sheet.appendRow(COLUMNS[row.type].map(function (c) { return row[c[1]] || ''; }));
  } finally {
    lock.releaseLock();
  }
}

function getSheet(type) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = SHEETS[type];
  var headers = COLUMNS[type].map(function (c) { return c[0]; });
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else if (sheet.getLastColumn() < headers.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  }
  return sheet;
}

/** Отправка в Telegram. Никогда не бросает исключение: заявка уже в таблице. */
function sendToTelegram(text) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('BOT_TOKEN');
  var chatId = props.getProperty('CHAT_ID');
  if (!token) return { ok: false, error: 'В свойствах скрипта не задан BOT_TOKEN' };
  if (!chatId) return { ok: false, error: 'В свойствах скрипта не задан CHAT_ID' };

  try {
    var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML', disable_web_page_preview: true }),
      muteHttpExceptions: true
    });
    var body = {};
    try { body = JSON.parse(res.getContentText()); } catch (e) {}
    if (body.ok) return { ok: true };
    var reason = body.description || ('HTTP ' + res.getResponseCode());
    console.error('Telegram отказал: ' + reason);
    return { ok: false, error: reason };
  } catch (err) {
    console.error('Не удалось обратиться к Telegram: ' + err);
    return { ok: false, error: String(err) };
  }
}

function notifyTelegram(row) {
  var lines = [
    '<b>marketgame.biz · заявка на демо · ' + TYPE_LABEL[row.type] + '</b>',
    row.note ? '<b>' + esc(row.note) + '</b>' : '',
    '',
    esc(row.name) + (row.title ? ', ' + esc(row.title) : ''),
    esc(row.org),
    'Email: ' + esc(row.email),
    row.phone ? 'Телефон: ' + esc(row.phone) : '',
    row.state ? 'Штат: ' + esc(row.state) : '',
    row.states ? 'Штаты: ' + esc(row.states) : '',
    row.members ? 'Членов: ' + esc(row.members) : '',
    row.payer ? 'Кто платит: ' + esc(row.payer) : '',
    row.scopes ? 'Рынки: ' + esc(row.scopes) : '',
    row.interest ? 'Интерес: ' + esc(row.interest) : '',
    row.hosts ? 'Хотят своих ведущих' : '',
    row.industry ? 'Отрасль: ' + esc(row.industry) : '',
    row.message ? '\n' + esc(row.message) : '',
    row.utm ? '\nМетки: ' + esc(row.utm) : ''
  ].filter(function (l) { return l !== ''; });
  return sendToTelegram(lines.join('\n'));
}

function clean(value, max) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function esc(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function ok(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * ГЛАВНАЯ ФУНКЦИЯ ДЛЯ НАСТРОЙКИ. Выберите её наверху и нажмите «Выполнить».
 */
function checkSetup() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('BOT_TOKEN');
  var chatId = props.getProperty('CHAT_ID');
  var out = [];
  function say(line) { out.push(line); console.log(line); }
  function stop(line) { say('✗ ' + line); throw new Error('\n\n' + out.join('\n') + '\n'); }

  say('--- Проверка настройки ---');
  if (!token) stop('Не задан BOT_TOKEN: Настройки проекта → Свойства скрипта.');
  say('✓ BOT_TOKEN задан');
  if (!chatId) stop('Не задан CHAT_ID: там же добавьте id группы.');
  say('✓ CHAT_ID задан: ' + chatId);

  var sent = sendToTelegram('<b>Проверка настройки marketgame.biz</b>\n\nЕсли вы это читаете — приём заявок настроен верно.');
  if (!sent.ok) stop('Бот не смог написать в группу: ' + sent.error);
  say('✓ Сообщение отправлено — проверьте группу');

  Object.keys(SHEETS).forEach(function (t) { say('✓ Лист «' + getSheet(t).getName() + '» готов'); });
  say('');
  say('ВСЁ ГОТОВО. Осталось развернуть: Развернуть → Управление развёртываниями →');
  say('карандаш → Версия: новая → Развернуть.');
  return out.join('\n');
}

/** Имитирует заявку палаты: строка в таблицу и сообщение в группу. */
function testLead() {
  var row = {
    date: new Date(), type: 'chamber', name: 'Test Lead', title: 'President', org: 'Test Chamber',
    email: 'test@example.org', phone: '', state: 'TX', members: '100–299', payer: 'Our chamber',
    scopes: 'state', states: '', interest: '', hosts: '', industry: '', note: 'Проверка из редактора',
    message: '', page: 'editor', referrer: '', utm: '', status: 'Тест'
  };
  appendLead(row);
  var sent = notifyTelegram(row);
  if (!sent.ok) throw new Error('Строка записана, но в Telegram не ушло: ' + sent.error);
  return 'Готово: строка в таблице и сообщение в группе.';
}
