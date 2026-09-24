/**
 * Market Game (marketgame.biz) — приём заявок на демо-игру.
 *
 * Что делает:
 *   - принимает заявку с сайта, дописывает строку в Google-таблицу продаж
 *     (свой лист для палат, банков и спонсоров) и присылает уведомление
 *     в закрытую группу Telegram;
 *   - отдаёт сайту два открытых листа — «Сайт — палаты» и «Сайт — банки».
 *     Из них GitHub раз в час обновляет статусы палат на сайте. Наружу уходят
 *     только колонки из SITE_SHEETS ниже, даже если в лист добавить другие.
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
 *   6. Выбрать наверху функцию checkSetup и нажать «Выполнить»: она проверит
 *      ключи, бота и группу и создаст все нужные листы, включая «Сайт — палаты»
 *      и «Сайт — банки».
 *
 * После любой правки этого файла: Развернуть → Управление развёртываниями →
 * карандаш → Версия: новая → Развернуть. Адрес .../exec при этом не меняется.
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

// Открытые листы для сайта. Колонки — ровно те, что уходят наружу.
// Поменяли набор колонок здесь — поменяйте и scripts/sync-sheet.mjs.
var SITE_SHEETS = {
  chambers: {
    name: 'Сайт — палаты',
    headers: ['Штат', 'Палата', 'Город', 'Сайт', 'Статус', 'Дата договора',
              'Публиковать', 'Спонсор', 'Публиковать спонсора'],
    checkboxes: ['Публиковать', 'Публиковать спонсора'],
    lists: { 'Статус': ['Подписан', 'Свободна'] },
    dates: ['Дата договора']
  },
  banks: {
    name: 'Сайт — банки',
    headers: ['Штат', 'Банк', 'Территория', 'Метро', 'Эксклюзив', 'Активен', 'Публиковать'],
    checkboxes: ['Эксклюзив', 'Активен', 'Публиковать'],
    lists: { 'Территория': ['Штат', 'Метро'] },
    dates: []
  }
};

var STATE_CODES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID',
  'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV',
  'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT',
  'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];

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

/**
 * GET-запросы:
 *   .../exec                 — проверка развёртывания (откройте в браузере);
 *   .../exec?sheet=chambers  — лист «Сайт — палаты» в CSV, его читает GitHub;
 *   .../exec?sheet=banks     — лист «Сайт — банки» в CSV.
 */
function doGet(e) {
  var which = e && e.parameter && e.parameter.sheet;
  if (which) {
    if (!SITE_SHEETS[which]) return ok({ status: 'error', message: 'unknown sheet' });
    return siteCsv(which);
  }
  var props = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ok({
    status: 'ok',
    service: 'marketgame-biz-leads',
    hasToken: !!props.getProperty('BOT_TOKEN'),
    hasChatId: !!props.getProperty('CHAT_ID'),
    siteSheets: {
      chambers: !!ss.getSheetByName(SITE_SHEETS.chambers.name),
      banks: !!ss.getSheetByName(SITE_SHEETS.banks.name)
    }
  });
}

/** Открытый лист в CSV — только колонки из SITE_SHEETS, в их порядке. */
function siteCsv(which) {
  var def = SITE_SHEETS[which];
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(def.name);
  if (!sheet) return ok({ status: 'error', message: 'sheet not found: ' + def.name });

  var values = sheet.getDataRange().getValues();
  var head = (values[0] || []).map(function (h) { return String(h).trim(); });
  var index = def.headers.map(function (h) { return head.indexOf(h); });
  var tz = Session.getScriptTimeZone();

  function cell(v) {
    if (v instanceof Date) v = Utilities.formatDate(v, tz, 'yyyy-MM-dd');
    v = String(v === null || v === undefined ? '' : v);
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  var lines = [def.headers.map(cell).join(',')];
  for (var r = 1; r < values.length; r++) {
    var row = index.map(function (i) { return i === -1 ? '' : values[r][i]; });
    if (row.join('').trim() === '' || row.every(function (v) { return v === '' || v === false; })) continue;
    lines.push(row.map(cell).join(','));
  }
  return ContentService.createTextOutput(lines.join('\n')).setMimeType(ContentService.MimeType.CSV);
}

/**
 * Создаёт листы «Сайт — палаты» и «Сайт — банки»: заголовки, выпадающие
 * списки штатов и статусов, галочки «Да/Нет». Существующие листы не трогает.
 * Запускается из checkSetup, можно и отдельно.
 */
function setupSiteSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var made = [];
  Object.keys(SITE_SHEETS).forEach(function (key) {
    var def = SITE_SHEETS[key];
    if (ss.getSheetByName(def.name)) return;
    var sheet = ss.insertSheet(def.name);
    var rows = 999;
    sheet.getRange(1, 1, 1, def.headers.length).setValues([def.headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);

    function col(name) { return def.headers.indexOf(name) + 1; }
    function list(values) {
      return SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build();
    }
    sheet.getRange(2, col('Штат'), rows, 1).setDataValidation(list(STATE_CODES));
    Object.keys(def.lists).forEach(function (name) {
      sheet.getRange(2, col(name), rows, 1).setDataValidation(list(def.lists[name]));
    });
    def.checkboxes.forEach(function (name) { sheet.getRange(2, col(name), rows, 1).insertCheckboxes(); });
    def.dates.forEach(function (name) { sheet.getRange(2, col(name), rows, 1).setNumberFormat('yyyy-mm-dd'); });
    sheet.autoResizeColumns(1, def.headers.length);
    made.push(def.name);
  });
  return made;
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
  var made = setupSiteSheets();
  Object.keys(SITE_SHEETS).forEach(function (k) {
    var name = SITE_SHEETS[k].name;
    say('✓ Лист «' + name + '» ' + (made.indexOf(name) !== -1 ? 'создан' : 'на месте'));
  });
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
