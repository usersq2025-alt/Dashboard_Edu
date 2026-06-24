/* ===================================================================
   مشروع الطفولة المكسورة — app.js
   يجلب البيانات من Apps Script (أو ملف data.json كوضع تجريبي)
   ويبني كل الصفحات والرسوم والخريطة.
   =================================================================== */

/* ===== ضع رابط Web App الخاص بـ Apps Script هنا ===== */
const API_URL = "PUT_YOUR_APPS_SCRIPT_URL_HERE";
/* مثال: https://script.google.com/macros/s/AKfycbx..../exec
   إذا بقي الرابط الافتراضي، ستُحمَّل البيانات تلقائياً من data/data.json (وضع تجريبي) */

const FALLBACK_JSON = "data/data.json";
const PER_PAGE = 12;
const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

let DB = { children: [], stats: [], logistics: [], months: MONTHS };
let CHARTS = {};
let MAP = null, MARKERS = null;
let childPage = 1;

/* -------------------------------------------------- helpers */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = n => (Number(n) || 0).toLocaleString('en-US');
const usd = n => '$' + fmt(Math.round(Number(n) || 0));
const isMale = c => String(c.gender).includes('ذكر');

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2600);
}

/* عدد التبرعات الفعلية (✓) للطفل خلال السنة */
function paidMonths(child) {
  if (!child.months) return 0;
  return MONTHS.reduce((a, m) => a + (String(child.months[m]).trim() === '✓' ? 1 : 0), 0);
}
const isSponsored = c => paidMonths(c) > 0; // كفالة نشطة = تبرّع واحد على الأقل

/* -------------------------------------------------- data loading */
async function loadData() {
  const usingApi = API_URL && !API_URL.startsWith('PUT_YOUR');
  const url = usingApi ? API_URL : FALLBACK_JSON;
  try {
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    DB.children  = json.children  || [];
    DB.stats     = json.stats     || [];
    DB.logistics = json.logistics || [];
    DB.months    = json.months    || MONTHS;

    const badge = $('#srcBadge');
    if (usingApi) { badge.textContent = 'متصل مباشرة'; badge.classList.add('live'); }
    else          { badge.textContent = 'وضع تجريبي'; }
  } catch (err) {
    console.error('فشل تحميل البيانات:', err);
    toast('تعذّر تحميل البيانات — تأكد من رابط Apps Script');
    // محاولة احتياطية على الملف المحلي
    if (usingApi) {
      try { const r = await fetch(FALLBACK_JSON); DB = { ...DB, ...(await r.json()) }; }
      catch (_) {}
    }
  }
}

/* -------------------------------------------------- KPI builders */
function kpiCard(tone, icon, value, label) {
  return `<div class="kpi tone-${tone}">
    <div class="ic"><i class="fa-solid ${icon}"></i></div>
    <div class="val" data-count="${value}">0</div>
    <div class="lbl">${label}</div>
  </div>`;
}

function buildDashboardKpis() {
  const ch = DB.children;
  const males   = ch.filter(isMale).length;
  const females = ch.length - males;
  const active  = ch.filter(isSponsored).length;
  const inactive = ch.length - active;
  const totalSponsor = ch.reduce((a, c) => a + (Number(c.total_usd) || 0), 0);
  const totalTransport = DB.logistics.reduce((a, l) => a + (Number(l.transport) || 0), 0)
                       || DB.stats.reduce((a, s) => a + (Number(s.transport_usd) || 0), 0);
  const totalVisits = DB.logistics.reduce((a, l) => a + (Number(l.visits) || 0), 0);
  const efficiency = totalVisits ? Math.round((active / totalVisits) * 100) : 0;

  $('#kpiGrid').innerHTML =
    kpiCard('blue',   'fa-children',            ch.length,      'إجمالي الأطفال') +
    kpiCard('male',   'fa-mars',                males,          'عدد الذكور') +
    kpiCard('female', 'fa-venus',               females,        'عدد الإناث') +
    kpiCard('green',  'fa-hand-holding-heart',  active,         'الكفالات النشطة') +
    kpiCard('red',    'fa-user-xmark',          inactive,       'أطفال غير مكفولين') +
    kpiCard('blue',   'fa-sack-dollar',         totalSponsor,   'إجمالي قيمة الكفالات ($)') +
    kpiCard('amber',  'fa-bus',                 totalTransport, 'إجمالي تكاليف المواصلات ($)') +
    kpiCard('green',  'fa-person-walking',      totalVisits,    'عدد الزيارات الميدانية') +
    kpiCard('blue',   'fa-gauge-high',          efficiency,     'مؤشر كفاءة الزيارات %');

  animateCounters($('#kpiGrid'));
}

/* عدّادات متحركة */
function animateCounters(scope) {
  $$('.val[data-count]', scope).forEach(el => {
    const target = Number(el.dataset.count) || 0;
    const dur = 900, t0 = performance.now();
    (function step(now) {
      const p = Math.min((now - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  });
}

/* -------------------------------------------------- charts */
function chartColors() {
  const css = getComputedStyle(document.body);
  return {
    text: css.getPropertyValue('--text').trim(),
    grid: css.getPropertyValue('--card-border').trim(),
    male: css.getPropertyValue('--male').trim(),
    female: css.getPropertyValue('--female').trim(),
    primary: css.getPropertyValue('--primary').trim(),
    green: css.getPropertyValue('--green').trim(),
    amber: css.getPropertyValue('--amber').trim(),
    red: css.getPropertyValue('--red').trim(),
  };
}
function baseOpts(c) {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: c.text, font: { family: 'Tajawal', size: 13 } } } },
    scales: {
      x: { ticks: { color: c.text, font: { family: 'Tajawal' } }, grid: { color: c.grid } },
      y: { ticks: { color: c.text, font: { family: 'Tajawal' } }, grid: { color: c.grid }, beginAtZero: true },
    },
  };
}
function destroyCharts() { Object.values(CHARTS).forEach(ch => ch && ch.destroy()); CHARTS = {}; }

function buildCharts() {
  destroyCharts();
  const c = chartColors();
  const ch = DB.children;
  const months = DB.months;

  // 1) Gender pie
  const males = ch.filter(isMale).length, females = ch.length - males;
  CHARTS.gender = new Chart($('#chGender'), {
    type: 'doughnut',
    data: { labels: ['ذكور', 'إناث'], datasets: [{ data: [males, females], backgroundColor: [c.male, c.female], borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '58%',
      plugins: { legend: { position: 'bottom', labels: { color: c.text, font: { family: 'Tajawal', size: 13 } } } } },
  });

  // 2) City bar
  const cityCount = {};
  ch.forEach(x => { cityCount[x.city] = (cityCount[x.city] || 0) + 1; });
  const cities = Object.keys(cityCount).sort((a, b) => cityCount[b] - cityCount[a]);
  CHARTS.city = new Chart($('#chCity'), {
    type: 'bar',
    data: { labels: cities, datasets: [{ label: 'عدد الأطفال', data: cities.map(k => cityCount[k]), backgroundColor: c.primary, borderRadius: 7 }] },
    options: { ...baseOpts(c), plugins: { legend: { display: false } } },
  });

  // 3) Monthly sponsorship line  (from stats sheet)
  const sMonths = DB.stats.map(s => s.month);
  CHARTS.sponsor = new Chart($('#chSponsor'), {
    type: 'line',
    data: { labels: sMonths, datasets: [{ label: 'إجمالي الكفالات $', data: DB.stats.map(s => s.total_usd || 0),
      borderColor: c.green, backgroundColor: c.green + '22', fill: true, tension: .35, pointRadius: 4 }] },
    options: baseOpts(c),
  });

  // 4) Monthly transport line
  const transByMonth = sMonths.map(m => {
    const fromLog = DB.logistics.filter(l => String(l.month).includes(m)).reduce((a, l) => a + (Number(l.transport) || 0), 0);
    const st = DB.stats.find(s => s.month === m);
    return fromLog || (st ? (Number(st.transport_usd) || 0) : 0);
  });
  CHARTS.transport = new Chart($('#chTransport'), {
    type: 'line',
    data: { labels: sMonths, datasets: [{ label: 'مواصلات $', data: transByMonth,
      borderColor: c.amber, backgroundColor: c.amber + '22', fill: true, tension: .35, pointRadius: 4 }] },
    options: baseOpts(c),
  });

  // 5) Visits column (from logistics, grouped by month label)
  const visMonths = MONTHS.slice();
  const visData = visMonths.map(m => DB.logistics.filter(l => String(l.month).includes(m)).reduce((a, l) => a + (Number(l.visits) || 0), 0));
  CHARTS.visits = new Chart($('#chVisits'), {
    type: 'bar',
    data: { labels: visMonths, datasets: [{ label: 'الزيارات الميدانية', data: visData, backgroundColor: c.primary, borderRadius: 6 }] },
    options: { ...baseOpts(c), plugins: { legend: { display: false } } },
  });

  // 6) Efficiency: visits vs active sponsorships
  const activeByMonth = MONTHS.map(m => ch.filter(x => x.months && String(x.months[m]).trim() === '✓').length);
  const visByMonth = MONTHS.map(m => DB.logistics.filter(l => String(l.month).includes(m)).reduce((a, l) => a + (Number(l.visits) || 0), 0));
  CHARTS.efficiency = new Chart($('#chEfficiency'), {
    type: 'bar',
    data: { labels: MONTHS, datasets: [
      { label: 'كفالات نشطة', data: activeByMonth, backgroundColor: c.green, borderRadius: 6, order: 2 },
      { label: 'زيارات', type: 'line', data: visByMonth, borderColor: c.red, backgroundColor: c.red, tension: .3, pointRadius: 3, order: 1 },
    ] },
    options: baseOpts(c),
  });
}

/* -------------------------------------------------- MAP */
function buildMap() {
  if (MAP) { MAP.remove(); MAP = null; }
  MAP = L.map('map', { center: [36.2, 37.16], zoom: 8, scrollWheelZoom: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap', maxZoom: 18,
  }).addTo(MAP);

  MARKERS = L.markerClusterGroup({ maxClusterRadius: 45 });
  const cm = chartColors();
  DB.children.forEach(c => {
    if (c.lat == null || c.lng == null) return;
    const color = isMale(c) ? cm.male : cm.female;
    const icon = L.divIcon({
      className: '', html: `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
      iconSize: [18, 18], iconAnchor: [9, 9],
    });
    const sp = isSponsored(c) ? '✅ مكفول' : '⛔ غير مكفول';
    const popup = `<div class="popup-name">${c.name || '—'}</div>
      <div class="popup-row"><b>رقم الصندوق</b><span>${c.box}</span></div>
      <div class="popup-row"><b>الجنس</b><span>${c.gender}</span></div>
      <div class="popup-row"><b>المدينة</b><span>${c.city}</span></div>
      <div class="popup-row"><b>العمر</b><span>${c.age ?? '—'}</span></div>
      <div class="popup-row"><b>الكفالة</b><span>${sp}</span></div>`;
    L.marker([c.lat, c.lng], { icon }).bindPopup(popup).addTo(MARKERS);
  });
  MAP.addLayer(MARKERS);
  setTimeout(() => MAP.invalidateSize(), 200);
}

/* -------------------------------------------------- CHILDREN CARDS */
function uniqueCities() { return [...new Set(DB.children.map(c => c.city))].sort(); }

function filteredChildren() {
  const q = $('#childSearch').value.trim().toLowerCase();
  const g = $('#filterGender').value;
  const city = $('#filterCity').value;
  const sp = $('#filterSponsor').value;
  return DB.children.filter(c => {
    if (g && c.gender !== g) return false;
    if (city && c.city !== city) return false;
    if (sp === 'on' && !isSponsored(c)) return false;
    if (sp === 'off' && isSponsored(c)) return false;
    if (q) {
      const hay = `${c.name} ${c.box} ${c.city} ${c.fieldWorker}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderChildren() {
  const list = filteredChildren();
  $('#childCount').textContent = `${list.length} طفل`;
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  if (childPage > pages) childPage = 1;
  const slice = list.slice((childPage - 1) * PER_PAGE, childPage * PER_PAGE);

  const grid = $('#childrenGrid');
  if (!slice.length) { grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><i class="fa-solid fa-magnifying-glass"></i>لا توجد نتائج مطابقة</div>`; $('#childrenPager').innerHTML = ''; return; }

  grid.innerHTML = slice.map(c => {
    const male = isMale(c);
    const sponsored = isSponsored(c);
    const initial = (c.name || '؟').trim().charAt(0);
    return `<div class="child-card ${male ? '' : 'f'}">
      <div class="cc-top">
        <div class="avatar">${initial}</div>
        <div class="cc-box">#${c.box}</div>
      </div>
      <div class="cc-body">
        <div class="cc-name">${c.name || '—'}</div>
        <div class="cc-sub"><i class="fa-solid fa-location-dot"></i> ${c.city || '—'}</div>
        <div class="cc-meta">
          <div class="m"><i class="fa-solid ${male ? 'fa-mars' : 'fa-venus'}"></i> ${c.gender}</div>
          <div class="m"><i class="fa-solid fa-cake-candles"></i> ${c.age ?? '—'} سنة</div>
          <div class="m"><i class="fa-solid fa-graduation-cap"></i> ${c.stage || '—'}</div>
          <div class="m"><i class="fa-solid fa-user-tie"></i> ${c.fieldWorker || '—'}</div>
        </div>
        <div class="cc-foot">
          <span class="pill ${sponsored ? 'on' : 'off'}">${sponsored ? 'مكفول' : 'غير مكفول'}</span>
          <small style="color:var(--text-mute)">${paidMonths(c)} شهر تبرّع</small>
        </div>
      </div>
    </div>`;
  }).join('');

  // pager
  let pg = '';
  pg += `<button ${childPage === 1 ? 'disabled' : ''} data-go="${childPage - 1}"><i class="fa-solid fa-angle-right"></i></button>`;
  for (let i = 1; i <= pages; i++) {
    if (pages > 7 && Math.abs(i - childPage) > 2 && i !== 1 && i !== pages) {
      if (i === 2 || i === pages - 1) pg += `<button disabled>…</button>`;
      continue;
    }
    pg += `<button class="${i === childPage ? 'active' : ''}" data-go="${i}">${i}</button>`;
  }
  pg += `<button ${childPage === pages ? 'disabled' : ''} data-go="${childPage + 1}"><i class="fa-solid fa-angle-left"></i></button>`;
  $('#childrenPager').innerHTML = pg;
  $$('#childrenPager button[data-go]').forEach(b => b.onclick = () => { childPage = Number(b.dataset.go); renderChildren(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
}

function initChildFilters() {
  const sel = $('#filterCity');
  sel.innerHTML = '<option value="">كل المدن</option>' + uniqueCities().map(c => `<option>${c}</option>`).join('');
  ['#childSearch', '#filterGender', '#filterCity', '#filterSponsor'].forEach(s =>
    $(s).addEventListener('input', () => { childPage = 1; renderChildren(); }));
}

/* -------------------------------------------------- LOGISTICS */
function buildLogistics() {
  const log = DB.logistics;
  const totalT = log.reduce((a, l) => a + (Number(l.transport) || 0), 0);
  const totalV = log.reduce((a, l) => a + (Number(l.visits) || 0), 0);
  const avg = totalV ? (totalT / totalV) : 0;

  $('#logKpis').innerHTML =
    kpiCard('amber', 'fa-sack-dollar', totalT, 'إجمالي المواصلات ($)') +
    kpiCard('blue',  'fa-person-walking', totalV, 'إجمالي الزيارات') +
    kpiCard('green', 'fa-calculator', avg.toFixed(2), 'متوسط تكلفة الزيارة ($)');
  animateCounters($('#logKpis'));

  // table
  const tb = $('#logTable tbody');
  if (!log.length) {
    tb.innerHTML = `<tr><td colspan="7" class="empty"><i class="fa-solid fa-inbox"></i>السجل اللوجستي فارغ — أضف الصفوف في Google Sheet</td></tr>`;
    $('#logTable tfoot').innerHTML = '';
  } else {
    tb.innerHTML = log.map(l => `<tr>
      <td>${l.month || '—'}</td><td>${l.worker || '—'}</td><td>${l.region || '—'}</td>
      <td>${usd(l.transport)}</td><td>${fmt(l.visits)}</td>
      <td>${usd(l.cost_per || (l.visits ? l.transport / l.visits : 0))}</td>
      <td>${l.notes || ''}</td></tr>`).join('');
    $('#logTable tfoot').innerHTML = `<tr><td colspan="3">الإجمالي</td>
      <td>${usd(totalT)}</td><td>${fmt(totalV)}</td><td>${usd(avg)}</td><td></td></tr>`;
  }

  // charts
  const c = chartColors();
  if (CHARTS.logT) CHARTS.logT.destroy();
  if (CHARTS.logV) CHARTS.logV.destroy();
  const labels = log.map(l => l.month);
  CHARTS.logT = new Chart($('#chLogTransport'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'مواصلات $', data: log.map(l => l.transport || 0), backgroundColor: c.amber, borderRadius: 6 }] },
    options: { ...baseOpts(c), plugins: { legend: { display: false } } },
  });
  CHARTS.logV = new Chart($('#chLogVisits'), {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'زيارات', data: log.map(l => l.visits || 0), backgroundColor: c.primary, borderRadius: 6 },
      { label: 'تكلفة الزيارة $', type: 'line', data: log.map(l => l.cost_per || (l.visits ? l.transport / l.visits : 0)), borderColor: c.red, tension: .3, pointRadius: 3 },
    ] },
    options: baseOpts(c),
  });
}

/* -------------------------------------------------- SPONSORSHIP */
function buildSponsorship() {
  const ch = DB.children;
  const active = ch.filter(isSponsored).length;
  const stopped = ch.length - active;
  const total = ch.reduce((a, c) => a + (Number(c.total_usd) || 0), 0);
  const net = ch.reduce((a, c) => a + (Number(c.net_usd) || Number(c.total_usd) || 0), 0);

  $('#sponsorKpis').innerHTML =
    kpiCard('green', 'fa-hand-holding-heart', active,  'كفالات نشطة') +
    kpiCard('red',   'fa-circle-pause',       stopped, 'كفالات متوقفة') +
    kpiCard('blue',  'fa-sack-dollar',        total,   'إجمالي قيمة الكفالات ($)') +
    kpiCard('amber', 'fa-money-bill-trend-up', net,    'صافي الكفالات بعد الحسم ($)');
  animateCounters($('#sponsorKpis'));

  const c = chartColors();
  if (CHARTS.net) CHARTS.net.destroy();
  if (CHARTS.cov) CHARTS.cov.destroy();
  const sMonths = DB.stats.map(s => s.month);
  CHARTS.net = new Chart($('#chNet'), {
    type: 'line',
    data: { labels: sMonths, datasets: [{ label: 'صافي الكفالات $', data: DB.stats.map(s => s.net_usd || s.total_usd || 0),
      borderColor: c.green, backgroundColor: c.green + '22', fill: true, tension: .35, pointRadius: 4 }] },
    options: baseOpts(c),
  });
  CHARTS.cov = new Chart($('#chCoverage'), {
    type: 'bar',
    data: { labels: sMonths, datasets: [{ label: 'نسبة التغطية %', data: DB.stats.map(s => Math.round((Number(s.coverage) || 0) * 100)), backgroundColor: c.primary, borderRadius: 6 }] },
    options: { ...baseOpts(c), plugins: { legend: { display: false } }, scales: { ...baseOpts(c).scales, y: { ...baseOpts(c).scales.y, max: 100 } } },
  });
}

/* -------------------------------------------------- NAVIGATION */
function showPage(name) {
  $$('.page').forEach(p => p.classList.remove('active'));
  $('#page-' + name).classList.add('active');
  $$('.nav-link-btn').forEach(b => b.classList.toggle('active', b.dataset.page === name));
  if (name === 'map') buildMap();
  if (name === 'children') renderChildren();
}

/* -------------------------------------------------- THEME */
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  $('#themeBtn').innerHTML = t === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
  try { localStorage.setItem('ch_theme', t); } catch (_) {}
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  applyTheme(cur === 'dark' ? 'light' : 'dark');
  // rebuild colored visuals
  buildCharts();
  if ($('#page-logistics').classList.contains('active')) buildLogistics();
  if ($('#page-sponsorship').classList.contains('active')) buildSponsorship();
}

/* -------------------------------------------------- EXPORTS */
function exportExcel() {
  const wb = XLSX.utils.book_new();
  const childRows = DB.children.map(c => ({
    'رقم الصندوق': c.box, 'الاسم': c.name, 'الجنس': c.gender, 'المدينة': c.city,
    'العمر': c.age, 'المرحلة': c.stage, 'الميداني': c.fieldWorker,
    'أشهر التبرّع': paidMonths(c), 'إجمالي الكفالة': c.total_usd, 'صافي الكفالة': c.net_usd,
    'الحالة': isSponsored(c) ? 'مكفول' : 'غير مكفول',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(childRows), 'الأطفال');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(DB.stats), 'الإحصائيات');
  if (DB.logistics.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(DB.logistics), 'اللوجستيات');
  XLSX.writeFile(wb, 'الطفولة_المكسورة_تقرير.xlsx');
  toast('تم تصدير ملف Excel');
}

function exportPdf() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text('Broken Childhood - Sponsorship Report', 14, 16);
  doc.setFontSize(10);
  doc.text(new Date().toLocaleDateString('en-GB'), 14, 23);

  const males = DB.children.filter(isMale).length;
  const active = DB.children.filter(isSponsored).length;
  const total = DB.children.reduce((a, c) => a + (Number(c.total_usd) || 0), 0);
  doc.autoTable({
    startY: 30, head: [['Metric', 'Value']],
    body: [
      ['Total children', DB.children.length],
      ['Males', males], ['Females', DB.children.length - males],
      ['Active sponsorships', active],
      ['Total sponsorship USD', '$' + fmt(total)],
    ],
    styles: { halign: 'left' }, headStyles: { fillColor: [47, 109, 246] },
  });
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 8,
    head: [['Box', 'Name', 'Gender', 'City', 'Age', 'Status']],
    body: DB.children.map(c => [c.box, c.name, c.gender, c.city, c.age ?? '', isSponsored(c) ? 'Sponsored' : 'No']),
    styles: { fontSize: 8 }, headStyles: { fillColor: [47, 109, 246] },
  });
  doc.save('broken_childhood_report.pdf');
  toast('تم تصدير ملف PDF');
}

/* -------------------------------------------------- INIT */
async function init() {
  // theme from storage
  let saved = 'light';
  try { saved = localStorage.getItem('ch_theme') || 'light'; } catch (_) {}
  applyTheme(saved);

  await loadData();

  buildDashboardKpis();
  buildCharts();
  initChildFilters();
  buildLogistics();
  buildSponsorship();

  // nav
  $$('.nav-link-btn').forEach(b => b.onclick = () => showPage(b.dataset.page));
  $('#themeBtn').onclick = toggleTheme;
  $('#refreshBtn').onclick = async () => { toast('جارٍ التحديث…'); await loadData(); buildDashboardKpis(); buildCharts(); buildLogistics(); buildSponsorship(); renderChildren(); toast('تم تحديث البيانات'); };
  $('#exportExcel').onclick = exportExcel;
  $('#exportPdf').onclick = exportPdf;

  // hide loader
  setTimeout(() => $('#loader').classList.add('hide'), 350);
}

document.addEventListener('DOMContentLoaded', init);
