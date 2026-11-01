/** Hora e data no fuso de Brasília */
function nowParts(date = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short'
  }).formatToParts(date);
  const g = t => (f.find(p => p.type === t) || {}).value;
  const hour = g('hour') === '24' ? '00' : g('hour');
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[g('weekday')];
  return { date: `${g('year')}-${g('month')}-${g('day')}`, hhmm: `${hour}:${g('minute')}`, minutes: parseInt(hour, 10) * 60 + parseInt(g('minute'), 10), weekday: wd };
}

function hhmmToMinutes(s) {
  const m = String(s || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

module.exports = { nowParts, hhmmToMinutes };
