// Выгрузка базы палат и банков-партнёров из таблицы продаж на сайт.
//
// Источник — два листа Google-таблицы продаж, опубликованные как CSV
// (Файл → Поделиться → Опубликовать в интернете → нужный лист → CSV).
// На эти листы выводятся ТОЛЬКО открытые поля: контакты, цены и заметки
// менеджеров на сайт попадать не должны.
//
// Адреса листов задаются переменными окружения (в GitHub — секреты):
//   CHAMBERS_CSV_URL — лист с палатами
//   BANKS_CSV_URL    — лист с банками-партнёрами
// Вместо адреса можно указать путь к локальному CSV-файлу — удобно для проверки.
//
// Результат — src/_data/chambers.json и src/_data/banks.json. Файл
// перезаписывается, только если данные изменились; тогда в GITHUB_OUTPUT
// пишется changed=true, и сайт пересобирается.
//
// Колонки листа палат (заголовки по-английски или по-русски, регистр не важен):
//   State / Штат            — двухбуквенный код: TX, OH, DC
//   Chamber / Палата        — название
//   City / Город
//   Website / Сайт
//   Status / Статус         — Signed / Подписан, остальное считается свободной
//   Contract date / Дата договора — для выбора Founding Chamber (самый ранний договор)
//   Public / Публиковать    — Yes / Да: палата согласна на упоминание статуса
//   Sponsor / Спонсор       — банк или спонсор, если платит он
//   Sponsor public / Публиковать спонсора — Yes / Да
//
// Колонки листа банков:
//   State / Штат, Bank / Банк, Scope / Территория (State или Metro / Штат или Метро),
//   Metro / Метро, Exclusive / Эксклюзив (Yes/Да), Active / Активен (Yes/Да),
//   Public / Публиковать (Yes/Да)

import fs from 'node:fs';

const DATA = new URL('../src/_data/', import.meta.url);
const states = JSON.parse(fs.readFileSync(new URL('states.json', DATA), 'utf8'));
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

/** Строки CSV → объекты с нашими именами полей. */
function records(text) {
  const [head = [], ...rows] = parseCsv(text.replace(/^﻿/, ''));
  const index = {};
  head.forEach((h, i) => {
    const key = String(h).trim().toLowerCase();
    for (const [field, names] of Object.entries(ALIASES)) {
      if (names.includes(key) && !(field in index)) index[field] = i;
    }
  });
  return rows.map((r) => {
    const o = {};
    for (const [field, i] of Object.entries(index)) o[field] = String(r[i] ?? '').trim();
    return o;
  });
}

async function load(source) {
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source, { redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${source.slice(0, 60)}…`);
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
    const abbr = r.state.toUpperCase();
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
    const abbr = r.state.toUpperCase();
    if (!KNOWN.has(abbr) || !r.bank || !yes(r.active)) continue;
    const s = (result[abbr] ||= { status: 'partner', name: null, metros: [] });
    const name = yes(r.public) ? r.bank : null;
    const metro = /metro|метро/i.test(r.scope);
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
function write(file, states) {
  const target = new URL(file, DATA);
  const old = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : {};
  if (JSON.stringify(old.states || {}) === JSON.stringify(states)) {
    console.log(`${file}: без изменений`);
    return false;
  }
  fs.writeFileSync(target, JSON.stringify({ updated: new Date().toISOString(), states }, null, 2) + '\n');
  console.log(`${file}: обновлён, штатов с данными — ${Object.keys(states).length}`);
  return true;
}

let changed = false;
const { CHAMBERS_CSV_URL, BANKS_CSV_URL } = process.env;

if (CHAMBERS_CSV_URL) {
  changed = write('chambers.json', buildChambers(records(await load(CHAMBERS_CSV_URL)))) || changed;
} else {
  console.log('CHAMBERS_CSV_URL не задан — список палат не обновляем');
}

if (BANKS_CSV_URL) {
  changed = write('banks.json', buildBanks(records(await load(BANKS_CSV_URL)))) || changed;
} else {
  console.log('BANKS_CSV_URL не задан — банки не обновляем');
}

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
}
