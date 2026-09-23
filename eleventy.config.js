// Сборка сайта. Из одного шаблона и таблицы штатов получается 51 страница
// штата плюс общие страницы. Руками страницы штатов никто не пишет:
// правка шаблона src/state.njk меняет их все сразу.

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0
});
const num = new Intl.NumberFormat('en-US');

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDINALS = ['', 'first', 'second', 'third', 'fourth'];

export default function (cfg) {
  cfg.addPassthroughCopy({ 'src/assets': 'assets' });
  cfg.addPassthroughCopy({ 'src/static': '/' });

  // $1,500 — цены на сайте всегда без центов
  cfg.addFilter('usd', (n) => usd.format(Number(n) || 0));
  cfg.addFilter('num', (n) => num.format(Number(n) || 0));

  // JSON внутри <script>: «<» экранируем, иначе строка «</script>»
  // в данных закрыла бы тег раньше времени
  cfg.addFilter('jsonScript', (value) =>
    JSON.stringify(value).replace(/</g, '\\u003c'));

  // «second Tuesday of every month, 7:00 PM» — правило открытой игры словами,
  // для тех, у кого не работает JavaScript, и для поисковиков
  cfg.addFilter('gameRule', (game) => {
    const [h, m] = String(game.time).split(':').map(Number);
    const hour12 = ((h + 11) % 12) + 1;
    const ampm = h < 12 ? 'AM' : 'PM';
    const nth = ORDINALS[game.nth];
    return `${nth.charAt(0).toUpperCase()}${nth.slice(1)} ${WEEKDAYS[game.weekday]} of every month, ` +
           `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
  });

  // 2.5 → «2.5 hours», 2 → «2 hours»
  cfg.addFilter('hours', (h) => `${h} hour${Number(h) === 1 ? '' : 's'}`);
}

export const config = {
  dir: {
    input: 'src',
    includes: '_includes',
    data: '_data',
    output: '_site'
  },
  templateFormats: ['njk'],
  htmlTemplateEngine: 'njk'
};
