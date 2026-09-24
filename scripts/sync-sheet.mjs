// Выгрузка базы палат и банков-партнёров из таблицы продаж на сайт.
//
// Источник — два открытых листа таблицы продаж: «Сайт — палаты» и
// «Сайт — банки». Их отдаёт тот же скрипт Google Apps Script, что принимает
// заявки (apps-script/Code.gs): адрес берётся из src/_data/site.json →
// formEndpoint с добавкой ?sheet=chambers или ?sheet=banks. Скрипт отдаёт
// только открытые колонки — контакты, цены и заметки на сайт не попадают.
//
// Для проверки или другого источника адреса можно задать переменными
// окружения CHAMBERS_CSV_URL и BANKS_CSV_URL — вместо адреса годится и путь
// к локальному CSV-файлу.
//
// Результат — src/_data/chambers.json и src/_data/banks.json. Файл
// перезаписывается, только если данные изменились; тогда в GITHUB_OUTPUT
// пишется changed=true, и сайт пересобирается. Если источник недоступен или
// вернул не то, прежние данные остаются, а сборка не падает.
//
// Колонки листа палат (заголовки по-английски или по-русски, регистр не важен):
//   State / Штат            — двухбуквенный код: TX, OH, DC
//   Chamber / Палата        — название
//   City / Город
//   Website / Сайт
//   Status / Статус         — Signed / Подписан, остальное считается свободной
//   Contract date / Дата договора — для выбора Founding Chamber (самый ранний договор)
//   Public / Публиковать    — Yes / Да / галочка: палата согласна на упоминание статуса
//   Sponsor / Спонсор       — банк или спонсор, если платит он
//   Sponsor public / Публиковать спонсора — Yes / Да / галочка
//
// Колонки листа банков:
//   State / Штат, Bank / Банк, Scope / Территория (State или Metro / Штат или Метро),
//   Metro / Метро, Exclusive / Эксклюзив, Active / Активен, Public / Публиковать

import fs from 'node:fs';

const DATA = new URL('../src/_data/', import.meta.url);
const states = JSON.parse(fs.readFileSync(new URL('states.json', DATA), 'utf8'));
const site = JSON.parse(fs.readFileSync(new URL('site.json', DATA), 'utf8'));
const KNOWN = new Set(states.map((s) => s.abbr));

const ALIASES = {
  state: ['state', 'штат'],
  chamber: ['chamber', 'палата', 'name', 'название'],
  city: ['city', 'город'],
  website: ['website', 'сайт', 'url'],
  status: ['status', 'статус'],
  date: ['contract date', 'дата договора', 'date', 'дата'],
  public: ['public', 'публиковать'],
  sponsor: ['sponsor', 'спонсор'],
  sponsorPublic: ['sponsor public', 'публиковать спонсора'],
  bank: ['bank', 'банк'],
  scope: ['scope', 'территория'],
  metro: ['metro', 'метро'],
  exclusive: ['exclusive', 'эксклюзив'],
  active: ['active', 'активен']
};

// «Да» в таблице: слово, галочка (TRUE) или 1
const yes = (v) => /^(yes|y|true|1|да|д|\+)$/i.test(String(v || '').trim());
const signed = (v) => /sign|подпис|active|актив/i.test(String(v || ''));

/** CSV по RFC 4180: кавычки, запятые и переводы строк внутри ячеек. */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

/**
 * Строки CSV → объекты с нашими именами полей. Если в заголовке нет
 * обязательных колонок, это не тот лист (или скрипт ещё старой версии
 * и вернул не CSV) — тогда возвращаем null, и файл на сайте не трогаем.
 */
function records(text, required) {
  // Excel и Google иногда ставят в начало файла невидимую метку BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const [head = [], ...rows] = parseCsv(text);
  const index = {};
  head.forEach((h, i) => {
    const key = String(h).trim().toLowerCase();
    for (const [field, names] of Object.entries(ALIASES)) {
      if (names.includes(key) && !(field in index)) index[field] = i;
    }
  });
  const missing = required.filter((f) => !(f in index));
  if (missing.length) {
    console.warn(`  в ответе нет колонок: ${missing.join(', ')}; начало ответа: ${text.slice(0, 120)}`);
    return null;
  }
  return rows.map((r) => {
    const o = {};
    for (const [field, i] of Object.entries(index)) o[field] = String(r[i] ?? '').trim();
    return o;
  });
}

async function load(source) {
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source, { redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }
  return fs.readFileSync(source, 'utf8');
}

function url(v) {
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

function buildChambers(rows) {
  const out = {};
  for (const r of rows) {
    const abbr = String(r.state || '').toUpperCase();
    if (!KNOWN.has(abbr) || !r.chamber) {
      if (r.chamber || r.state) console.warn(`  пропущена строка: «${r.chamber}» (${r.state})`);
      continue;
    }
    (out[abbr] ||= []).push(r);
  }

  const result = {};
  for (const [abbr, list] of Object.entries(out)) {
    const signedRows = list.filter((r) => signed(r.status))
      .sort((a, b) => (Date.parse(a.date) || Infinity) - (Date.parse(b.date) || Infinity));
    const first = signedRows[0] || null;

    const chambers = list.map((r) => {
      let status = 'available';
      if (signed(r.status)) {
        // Подписала, но не разрешила упоминать статус — показываем без статуса
        status = !yes(r.public) ? 'private' : r === first ? 'founding' : 'active';
      }
      return {
        name: r.chamber,
        city: r.city || null,
        url: url(r.website),
        status,
        sponsor: status !== 'available' && status !== 'private' && r.sponsor && yes(r.sponsorPublic)
          ? r.sponsor : null
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    result[abbr] = {
      founding: {
        taken: Boolean(first),
        name: first && yes(first.public) ? first.chamber : null
      },
      chambers
    };
  }
  return result;
}

function buildBanks(rows) {
  const result = {};
  for (const r of rows) {
    const abbr = String(r.state || '').toUpperCase();
    if (!KNOWN.has(abbr) || !r.bank || !yes(r.active)) continue;
    const s = (result[abbr] ||= { status: 'partner', name: null, metros: [] });
    const name = yes(r.public) ? r.bank : null;
    const metro = /metro|метро/i.test(r.scope || '');
    if (metro) {
      s.metros.push({ metro: r.metro || null, name, exclusive: yes(r.exclusive) });
    } else {
      if (yes(r.exclusive)) s.status = 'exclusive';
      s.name = name || s.name;
    }
  }
  return result;
}

/** Пишет файл, только если данные изменились (дата обновления не в счёт). */
function write(file, data) {
  const target = new URL(file, DATA);
  const old = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : {};
  if (JSON.stringify(old.states || {}) === JSON.stringify(data)) {
    console.log(`${file}: без изменений`);
    return false;
  }
  fs.writeFileSync(target, JSON.stringify({ updated: new Date().toISOString(), states: data }, null, 2) + '\n');
  console.log(`${file}: обновлён, штатов с данными — ${Object.keys(data).length}`);
  return true;
}

/**
 * Один лист: скачать, проверить, собрать JSON. Любая ошибка — сбой сети,
 * старая версия скрипта, нет листа — оставляет на сайте прежние данные.
 */
async function sync(file, source, required, build) {
  if (!source) {
    console.log(`${file}: источник не задан (нет formEndpoint в site.json) — не обновляем`);
    return false;
  }
  try {
    const rows = records(await load(source), required);
    if (!rows) {
      console.warn(`${file}: ответ не похож на нужный лист — прежние данные остаются`);
      return false;
    }
    return write(file, build(rows));
  } catch (err) {
    console.warn(`${file}: не удалось получить данные (${err.message}) — прежние данные остаются`);
    return false;
  }
}

const endpoint = site.formEndpoint || '';
const sources = {
  chambers: process.env.CHAMBERS_CSV_URL || (endpoint && `${endpoint}?sheet=chambers`),
  banks: process.env.BANKS_CSV_URL || (endpoint && `${endpoint}?sheet=banks`)
};

let changed = false;
changed = (await sync('chambers.json', sources.chambers, ['state', 'chamber'], buildChambers)) || changed;
changed = (await sync('banks.json', sources.banks, ['state', 'bank'], buildBanks)) || changed;

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
}
