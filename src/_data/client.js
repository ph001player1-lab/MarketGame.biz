// Данные, которые нужны скриптам в браузере. Попадают в каждую страницу
// блоком <script id="mg-data" type="application/json"> — одним источником
// с шаблонами, поэтому цены и расписание не могут разойтись.

import fs from 'node:fs';
import stateInfo from './stateInfo.js';

const load = (name) =>
  JSON.parse(fs.readFileSync(new URL(`./${name}.json`, import.meta.url), 'utf8'));

export default function client() {
  const site = load('site');
  const pricing = load('pricing');
  const schedule = load('schedule');
  const zones = load('zones');
  const states = load('states');
  const info = stateInfo();

  return {
    endpoint: site.formEndpoint,
    contact: site.contact,
    game: site.game,
    pricing,
    schedule,
    zones,
    states: states.map((s) => ({
      abbr: s.abbr,
      name: s.name,
      slug: s.slug,
      tz: s.tz,
      group: s.group,
      game: s.game,
      // f — место Founding Chamber занято, b — статус банковского партнёра
      f: info[s.abbr].founding.taken ? 1 : 0,
      b: info[s.abbr].bank.status,
      bn: info[s.abbr].bank.name,
      a: info[s.abbr].active
    }))
  };
}
