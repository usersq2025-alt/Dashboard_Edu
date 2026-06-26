/* ===================================================================
   مشروع الطفولة المكسورة — app.js (Production)
   كل المؤشرات محسوبة من بيانات Excel الفعلية. لا توجد بيانات وهمية.
   عند غياب بيانات حقيقية (مثل السجل اللوجستي الفارغ) تُعرض حالة فارغة
   صريحة مع إرشاد، بدل اختلاق أرقام.
   =================================================================== */

/* ====== ضع رابط Web App الخاص بـ Apps Script هنا ====== */
const API_URL = "PUT_YOUR_APPS_SCRIPT_URL_HERE";
/* إن بقي الرابط الافتراضي، تُقرأ البيانات من data/data.json (مستخرجة من ملفك). */

const FALLBACK_JSON = "data/data.json";
const PER_PAGE = 12;
const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const MONTH_SHORT = ['ينا','فبر','مار','أبر','ماي','يون','يول','أغس','سبت','أكت','نوف','ديس'];

let DB = { children: [], stats: [], logistics: [], months: MONTHS, currentMonth: '', currentMonthIndex: 0 };
let CH = {};        // chart registry
let MAP = null, CLUSTER = null;
let cPage = 1;

/* ------------------------------------------- helpers */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const n0 = v => (Number(v) || 0);
const fmt = v => n0(v).toLocaleString('en-US');
const usd = v => '$' + fmt(Math.round(n0(v)));
const isMale = c => String(c.gender).includes('ذكر');
const isOrphan = c => String(c.orphan).trim() === 'نعم';

function toast(m){ const t=$('#toast'); t.textContent=m; t.classList.add('show'); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),2600); }

/* مكفول الآن = علامة الشهر الحالي ✓ ؛ متأخّر = غير ✓ في الشهر الحالي */
const paidNow = c => String(c.curMark).trim() === '✓';
const isLate  = c => !paidNow(c);

/* ------------------------------------------- data load */
async function load(){
  const useApi = API_URL && !API_URL.startsWith('PUT_YOUR');
  const url = useApi ? API_URL : FALLBACK_JSON;
  try{
    const res = await fetch(url);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const j = await res.json();
    DB.children  = j.children  || [];
    DB.stats     = j.stats     || [];
    DB.logistics = j.logistics || [];
    DB.months    = j.months    || MONTHS;
    DB.currentMonth = j.currentMonth || lastMarkedMonth();
    DB.currentMonthIndex = (j.currentMonthIndex != null) ? j.currentMonthIndex : MONTHS.indexOf(DB.currentMonth);
    const s=$('#src');
    if(useApi){ s.innerHTML='<i class="fa-solid fa-bolt"></i> متصل مباشرة'; s.classList.add('live'); }
    else { s.innerHTML='<i class="fa-solid fa-database"></i> ملف Excel'; }
  }catch(err){
    console.error(err);
    toast('تعذّر تحميل البيانات — تحقّق من رابط Apps Script');
    if(useApi){ try{ const r=await fetch(FALLBACK_JSON); const j=await r.json(); Object.assign(DB,j);}catch(_){} }
  }
}
function lastMarkedMonth(){
  let idx=0;
  MONTHS.forEach((m,i)=>{ if(DB.children.some(c=>['✓','✗'].includes(String(c.months?.[m]).trim()))) idx=i; });
  return MONTHS[idx];
}

/* ------------------------------------------- shared aggregates */
function agg(){
  const ch=DB.children;
  const males=ch.filter(isMale).length;
  const orphans=ch.filter(isOrphan).length;
  const paid=ch.filter(paidNow).length;
  const late=ch.filter(isLate).length;
  // قيمة الكفالة الفعلية للشهر الحالي: 50$ لكل طفل مكفول (نمط الملف)
  const UNIT = 50;
  const monthValue = paid * UNIT;
  // إجمالي سنوي محصّل = مجموع كل أشهر ✓ × الوحدة
  const yearPaidMarks = ch.reduce((a,c)=>a+n0(c.paidMonths),0);
  const yearValue = yearPaidMarks * UNIT;
  return { total:ch.length, males, females:ch.length-males, orphans, paid, late,
           coverage: ch.length? Math.round(paid/ch.length*100):0, UNIT, monthValue, yearValue, yearPaidMarks };
}

/* ------------------------------------------- KPI card */
function kpi(tone,icon,val,lbl,sub,trend){
  const tr = trend ? `<span class="trend ${trend.dir}">${trend.txt}</span>` : '';
  return `<div class="kpi t-${tone}">
    <div class="top"><div class="ic"><i class="fa-solid ${icon}"></i></div>${tr}</div>
    <div class="val" data-c="${val}">0</div>
    <div class="lbl">${lbl}</div>${sub?`<div class="sub">${sub}</div>`:''}
  </div>`;
}
function countUp(scope){
  $$('.val[data-c]',scope).forEach(el=>{
    const raw=el.dataset.c; const isFloat=/\./.test(raw); const target=Number(raw)||0;
    const t0=performance.now(), dur=850;
    (function step(now){ const p=Math.min((now-t0)/dur,1); const e=1-Math.pow(1-p,3);
      const v=target*e; el.textContent=isFloat? v.toFixed(2): fmt(Math.round(v));
      if(p<1) requestAnimationFrame(step); })(t0);
  });
}

/* ------------------------------------------- chart theme */
function ck(){ const s=getComputedStyle(document.body); const g=k=>s.getPropertyValue(k).trim();
  return {text:g('--text'),grid:g('--line'),brand:g('--brand'),gold:g('--gold'),male:g('--male'),
          female:g('--female'),ok:g('--ok'),bad:g('--bad'),warn:g('--warn')}; }
function opts(c,extra={}){ return {responsive:true,maintainAspectRatio:false,
  plugins:{legend:{labels:{color:c.text,font:{family:'IBM Plex Sans Arabic',size:12},usePointStyle:true,padding:14}}},
  scales:{x:{ticks:{color:c.text,font:{family:'IBM Plex Sans Arabic'}},grid:{color:c.grid,display:false}},
          y:{ticks:{color:c.text,font:{family:'IBM Plex Mono'}},grid:{color:c.grid},beginAtZero:true}},...extra}; }
function kill(){ Object.values(CH).forEach(x=>x&&x.destroy()); CH={}; }

/* =================================================================
   OVERVIEW
================================================================= */
function buildOverview(){
  const a=agg();
  $('#ovMeta').innerHTML = `آخر تحديث: ${new Date().toLocaleDateString('ar-EG')} · المصدر: سجل Excel`;
  $('#ovCurMonth').textContent = `الشهر المرجعي: ${DB.currentMonth}`;

  // alert banner
  if(a.late>0){
    $('#ovAlert').innerHTML = `<div class="alertbar">
      <div class="big mono">${a.late}</div>
      <div class="txt"><b>كفالة متأخّرة تحتاج متابعة</b>
        <p>${a.late} طفلاً غير مكفول في شهر ${DB.currentMonth} من أصل ${a.total}. افتح صفحة التنبيهات للمتابعة.</p></div>
      <button class="btn pri" onclick="go('alerts')"><i class="fa-solid fa-arrow-left"></i> عرض التنبيهات</button>
    </div>`;
  } else $('#ovAlert').innerHTML='';

  $('#ovKpis').innerHTML =
    kpi('brand','fa-children',a.total,'إجمالي الأطفال','مسجّلون في السجل') +
    kpi('ok','fa-hand-holding-heart',a.paid,`مكفولون — ${DB.currentMonth}`,`تغطية ${a.coverage}%`) +
    kpi('bad','fa-user-clock',a.late,'متأخّرون عن الكفالة',`في شهر ${DB.currentMonth}`) +
    kpi('gold','fa-sack-dollar',a.monthValue,'قيمة كفالة الشهر (USD)',`${a.paid} × $${a.UNIT}`) +
    kpi('male','fa-mars',a.males,'ذكور') +
    kpi('female','fa-venus',a.females,'إناث') +
    kpi('warn','fa-heart-crack',a.orphans,'الأيتام',`${Math.round(a.orphans/a.total*100)}% من الأطفال`) +
    kpi('brand','fa-money-bill-trend-up',a.yearValue,'إجمالي محصّل سنوياً (USD)',`${a.yearPaidMarks} شهر تبرّع`);
  countUp($('#ovKpis'));
  buildOverviewCharts();
}
function buildOverviewCharts(){
  kill(); const c=ck();
  // coverage stacked per month
  const paidByM = MONTHS.map(m=>DB.children.filter(x=>String(x.months?.[m]).trim()==='✓').length);
  const crossByM = MONTHS.map(m=>DB.children.filter(x=>String(x.months?.[m]).trim()==='✗').length);
  CH.cov=new Chart($('#chCoverage'),{type:'bar',data:{labels:MONTH_SHORT,datasets:[
    {label:'مكفول',data:paidByM,backgroundColor:c.ok,borderRadius:5,stack:'s'},
    {label:'غير مكفول',data:crossByM,backgroundColor:c.bad+'cc',borderRadius:5,stack:'s'}]},
    options:opts(c,{scales:{x:{stacked:true,grid:{display:false},ticks:{color:c.text}},y:{stacked:true,grid:{color:c.grid},ticks:{color:c.text}}}})});

  // money line from stats
  CH.money=new Chart($('#chMoney'),{type:'line',data:{labels:DB.stats.map(s=>s.month),datasets:[
    {label:'إجمالي الكفالات $',data:DB.stats.map(s=>s.total_usd),borderColor:c.brand,backgroundColor:c.brand+'22',fill:true,tension:.35,pointRadius:3,pointBackgroundColor:c.brand}]},options:opts(c)});

  // city bar
  const cc={}; DB.children.forEach(x=>cc[x.city]=(cc[x.city]||0)+1);
  const cities=Object.keys(cc).sort((a,b)=>cc[b]-cc[a]);
  CH.city=new Chart($('#chCity'),{type:'bar',data:{labels:cities,datasets:[{label:'أطفال',data:cities.map(k=>cc[k]),backgroundColor:c.brand,borderRadius:6}]},
    options:opts(c,{indexAxis:'y',plugins:{legend:{display:false}}})});

  // demo doughnut: male/female/orphan share
  const a=agg();
  CH.demo=new Chart($('#chDemo'),{type:'doughnut',data:{labels:['ذكور','إناث','منهم أيتام'],
    datasets:[{data:[a.males,a.females,a.orphans],backgroundColor:[c.male,c.female,c.gold],borderWidth:0}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'55%',plugins:{legend:{position:'bottom',labels:{color:c.text,font:{family:'IBM Plex Sans Arabic',size:12},usePointStyle:true,padding:14}}}}});
}

/* =================================================================
   ALERTS
================================================================= */
function buildAlerts(){
  const late=DB.children.filter(isLate).sort((a,b)=>b.unpaidStreak-a.unpaidStreak);
  $('#navAlert').textContent=late.length;
  $('#navAlert').style.display = late.length? 'grid':'none';
  const s2=late.filter(c=>c.unpaidStreak>=2).length;
  $('#alMeta').textContent=`الشهر المرجعي: ${DB.currentMonth}`;
  $('#alBanner').innerHTML=`<div class="big mono">${late.length}</div>
    <div class="txt"><b>كفالة متأخّرة في ${DB.currentMonth}</b>
      <p>منهم ${s2} متأخّرون لشهرين متتاليين أو أكثر — أولوية تواصل قصوى.</p></div>`;
  renderAlerts();
  $('#alSearch').oninput=renderAlerts; $('#alStreak').onchange=renderAlerts;
}
function renderAlerts(){
  const q=$('#alSearch').value.trim().toLowerCase(); const f=$('#alStreak').value;
  let list=DB.children.filter(isLate);
  if(f==='2') list=list.filter(c=>c.unpaidStreak>=2);
  if(f==='1') list=list.filter(c=>c.unpaidStreak===1);
  if(q) list=list.filter(c=>`${c.name} ${c.box} ${c.city}`.toLowerCase().includes(q));
  list.sort((a,b)=>b.unpaidStreak-a.unpaidStreak);
  const box=$('#alList');
  if(!list.length){ box.innerHTML=`<div class="empty"><div class="ei"><i class="fa-solid fa-circle-check"></i></div><b>لا توجد كفالات متأخّرة مطابقة</b><p>كل الأطفال ضمن النطاق المحدّد مكفولون.</p></div>`; return; }
  box.innerHTML=list.map(c=>{
    const sc=c.unpaidStreak>=2?'s2':'s1';
    const txt=c.unpaidStreak>=2?`متأخّر ${c.unpaidStreak} أشهر`:'متأخّر شهر';
    return `<div class="arow">
      <div class="tag-box">#${c.box}</div>
      <div class="who"><b>${c.name}</b><span>${c.city} · ${c.fieldWorker||'—'}</span></div>
      <div class="streak ${sc}">${txt}</div>
      <button class="go" onclick="openChild('${c.box}')"><i class="fa-solid fa-chevron-left"></i></button>
    </div>`; }).join('');
}

/* =================================================================
   WORKERS
================================================================= */
function workerStats(){
  const map={};
  DB.children.forEach(c=>{
    const w=c.fieldWorker||'غير محدّد';
    map[w]=map[w]||{name:w,kids:0,paidNow:0,late:0,marks:0,usd:0};
    map[w].kids++; if(paidNow(c)) map[w].paidNow++; else map[w].late++;
    map[w].marks+=n0(c.paidMonths); map[w].usd+=n0(c.paidMonths)*50;
  });
  return Object.values(map).sort((a,b)=>b.kids-a.kids);
}
function buildWorkers(){
  const W=workerStats(); const a=agg();
  const best=[...W].sort((x,y)=>(y.paidNow/y.kids)-(x.paidNow/x.kids))[0];
  $('#wkKpis').innerHTML=
    kpi('brand','fa-user-tie',W.length,'عدد الميدانيين','يغطّون المشروع') +
    kpi('ok','fa-children',(a.total/W.length).toFixed(1),'متوسط الأطفال / ميداني') +
    kpi('gold','fa-trophy',best?best.name:'—','الأعلى تغطية',best?`${Math.round(best.paidNow/best.kids*100)}% مكفول`:'') +
    kpi('warn','fa-user-clock',Math.max(...W.map(w=>w.late)),'أعلى عدد متأخّرين','لدى ميداني واحد');
  countUp($('#wkKpis'));

  const maxKids=Math.max(...W.map(w=>w.kids));
  $('#wkLoad').innerHTML=W.map(w=>`<div class="wbar"><div class="nm">${w.name}</div>
    <div class="track"><div class="fill" style="width:${w.kids/maxKids*100}%"></div></div>
    <div class="v">${w.kids}</div></div>`).join('');
  const maxMarks=Math.max(...W.map(w=>w.marks));
  $('#wkPaid').innerHTML=W.map(w=>`<div class="wbar"><div class="nm">${w.name}</div>
    <div class="track"><div class="fill" style="width:${w.marks/maxMarks*100}%;background:linear-gradient(90deg,var(--gold),#d4a14b)"></div></div>
    <div class="v">${w.marks}</div></div>`).join('');

  $('#wkTable tbody').innerHTML=W.map(w=>{
    const cov=Math.round(w.paidNow/w.kids*100);
    return `<tr><td><b>${w.name}</b></td><td class="num">${w.kids}</td>
      <td class="num">${w.paidNow}</td><td class="num">${w.late}</td>
      <td class="num">${w.marks}</td><td class="num">${usd(w.usd)}</td>
      <td><span class="chip ${cov>=70?'ok':cov>=40?'warn':'bad'}">${cov}%</span></td></tr>`; }).join('');
}

/* =================================================================
   LOGISTICS  (real or honest empty state)
================================================================= */
function buildLogistics(){
  const L=DB.logistics, host=$('#logContent');
  if(!L.length){
    host.innerHTML=`<div class="empty">
      <div class="ei"><i class="fa-solid fa-truck-ramp-box"></i></div>
      <b>السجل اللوجستي فارغ في ملف Excel</b>
      <p>ورقة «السجل اللوجستي» لا تحتوي بعد على صفوف بيانات (تكاليف مواصلات أو زيارات).
      أضف الصفوف في Google Sheet — العناوين: الشهر، الميداني، المنطقة،
      <code>تكلفة المواصلات</code>، <code>عدد الزيارات</code> — وستظهر هنا التحليلات تلقائياً.
      لم تُختلَق أي أرقام تجريبية احتراماً لدقّة البيانات.</p></div>`;
    return;
  }
  const totT=L.reduce((a,l)=>a+n0(l.transport),0);
  const totV=L.reduce((a,l)=>a+n0(l.visits),0);
  const avg=totV?totT/totV:0;
  host.innerHTML=`<div class="kpis" id="logK"></div>
    <div class="slabel">الاتجاهات</div>
    <div class="grid g-2">
      <div class="panel"><h3><i class="fa-solid fa-sack-dollar"></i> تكلفة المواصلات شهرياً</h3><div class="chart"><canvas id="chLT"></canvas></div></div>
      <div class="panel"><h3><i class="fa-solid fa-route"></i> الزيارات وتكلفة الزيارة</h3><div class="chart"><canvas id="chLV"></canvas></div></div>
    </div>
    <div class="slabel">السجل التفصيلي</div>
    <div class="twrap"><table class="t"><thead><tr><th>الشهر</th><th>الميداني</th><th>المنطقة</th>
      <th>المواصلات (USD)</th><th>الزيارات</th><th>تكلفة الزيارة (USD)</th><th>ملاحظات</th></tr></thead>
      <tbody>${L.map(l=>`<tr><td>${l.month}</td><td>${l.worker||'—'}</td><td>${l.region||'—'}</td>
        <td class="num">${usd(l.transport)}</td><td class="num">${fmt(l.visits)}</td>
        <td class="num">${usd(l.cost_per)}</td><td>${l.notes||''}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3">الإجمالي</td><td class="num">${usd(totT)}</td><td class="num">${fmt(totV)}</td><td class="num">${usd(avg)}</td><td></td></tr></tfoot>
    </table></div>`;
  $('#logK').innerHTML=
    kpi('gold','fa-sack-dollar',totT,'إجمالي المواصلات (USD)') +
    kpi('brand','fa-person-walking',totV,'إجمالي الزيارات') +
    kpi('ok','fa-calculator',avg.toFixed(2),'متوسط تكلفة الزيارة (USD)');
  countUp($('#logK'));
  const c=ck();
  CH.lt=new Chart($('#chLT'),{type:'bar',data:{labels:L.map(l=>l.month),datasets:[{label:'مواصلات $',data:L.map(l=>l.transport),backgroundColor:c.gold,borderRadius:6}]},options:opts(c,{plugins:{legend:{display:false}}})});
  CH.lv=new Chart($('#chLV'),{type:'bar',data:{labels:L.map(l=>l.month),datasets:[
    {label:'زيارات',data:L.map(l=>l.visits),backgroundColor:c.brand,borderRadius:6},
    {label:'تكلفة الزيارة $',type:'line',data:L.map(l=>l.cost_per),borderColor:c.bad,tension:.3,pointRadius:3}]},options:opts(c)});
}

/* =================================================================
   EFFICIENCY  (visits vs active sponsorships)
================================================================= */
function buildEfficiency(){
  const host=$('#effContent');
  const hasVisits=DB.logistics.some(l=>n0(l.visits)>0);
  // active per month from real matrix
  const activeByM=MONTHS.map(m=>DB.children.filter(x=>String(x.months?.[m]).trim()==='✓').length);
  if(!hasVisits){
    host.innerHTML=`
      <div class="kpis">
        ${kpi('ok','fa-hand-holding-heart',agg().paid,'كفالات نشطة — '+DB.currentMonth,'')}
        ${kpi('warn','fa-person-walking','—','زيارات مسجّلة','لا بيانات في السجل اللوجستي')}
        ${kpi('bad','fa-gauge','—','مؤشر الكفاءة','يتطلّب بيانات الزيارات')}
      </div>
      <div class="slabel">الكفالات النشطة شهرياً (متاح من البيانات)</div>
      <div class="panel"><h3><i class="fa-solid fa-chart-column"></i> عدد الكفالات النشطة لكل شهر</h3><div class="chart tall"><canvas id="chEffA"></canvas></div></div>
      <div class="empty" style="margin-top:18px">
        <div class="ei"><i class="fa-solid fa-gauge"></i></div>
        <b>تحليل الكفاءة يحتاج بيانات الزيارات</b>
        <p>مؤشر الكفاءة = (الكفالات النشطة ÷ عدد الزيارات) × 100. بما أن ورقة
        «السجل اللوجستي» لا تحتوي عدد زيارات فعلية بعد، عُرض الجزء المتاح فقط
        (الكفالات النشطة). أدخِل الزيارات لتفعيل المؤشر كاملاً.</p></div>`;
    const c=ck();
    CH.effa=new Chart($('#chEffA'),{type:'bar',data:{labels:MONTH_SHORT,datasets:[{label:'كفالات نشطة',data:activeByM,backgroundColor:c.ok,borderRadius:6}]},options:opts(c,{plugins:{legend:{display:false}}})});
    return;
  }
  // full efficiency when visits exist
  const visByM=MONTHS.map(m=>DB.logistics.filter(l=>String(l.month).includes(m)).reduce((a,l)=>a+n0(l.visits),0));
  const totV=visByM.reduce((a,b)=>a+b,0); const totA=agg().paid;
  const eff=totV?Math.round(totA/totV*100):0;
  host.innerHTML=`<div class="kpis">
      ${kpi('ok','fa-hand-holding-heart',totA,'كفالات نشطة')}
      ${kpi('brand','fa-person-walking',totV,'إجمالي الزيارات')}
      ${kpi('gold','fa-gauge',eff,'مؤشر الكفاءة %','نشطة ÷ زيارات')}
    </div>
    <div class="panel" style="margin-top:18px"><h3><i class="fa-solid fa-gauge"></i> الزيارات مقابل الكفالات النشطة</h3><div class="chart tall"><canvas id="chEff"></canvas></div></div>`;
  countUp(host);
  const c=ck();
  CH.eff=new Chart($('#chEff'),{type:'bar',data:{labels:MONTH_SHORT,datasets:[
    {label:'كفالات نشطة',data:activeByM,backgroundColor:c.ok,borderRadius:6},
    {label:'زيارات',type:'line',data:visByM,borderColor:c.bad,tension:.3,pointRadius:3}]},options:opts(c)});
}

/* =================================================================
   MAP
================================================================= */
function buildMap(){
  if(MAP){ MAP.remove(); MAP=null; }
  MAP=L.map('map',{center:[36.2,37.16],zoom:8});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap',maxZoom:18}).addTo(MAP);
  CLUSTER=L.markerClusterGroup({maxClusterRadius:45});
  const c=ck();
  DB.children.forEach(x=>{
    if(x.lat==null||x.lng==null) return;
    const col=isMale(x)?c.male:c.female;
    const icon=L.divIcon({className:'',html:`<div style="width:17px;height:17px;border-radius:50%;background:${col};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,iconSize:[17,17],iconAnchor:[8,8]});
    const st=paidNow(x)?'<span style="color:#1f8a4c">✓ مكفول</span>':'<span style="color:#c0392b">⛔ متأخّر</span>';
    const html=`<div class="pp-name">${x.name}</div>
      <div class="pp-row"><b>الصندوق</b><span>#${x.box}</span></div>
      <div class="pp-row"><b>الجنس</b><span>${x.gender}</span></div>
      <div class="pp-row"><b>المدينة</b><span>${x.city}</span></div>
      <div class="pp-row"><b>العمر</b><span>${x.age??'—'}</span></div>
      <div class="pp-row"><b>الكفالة (${DB.currentMonth})</b><span>${st}</span></div>
      <button class="pp-btn" onclick="openChild('${x.box}')">عرض الملف الكامل</button>`;
    L.marker([x.lat,x.lng],{icon}).bindPopup(html).addTo(CLUSTER);
  });
  MAP.addLayer(CLUSTER);
  setTimeout(()=>MAP.invalidateSize(),200);
}

/* =================================================================
   CHILDREN CARDS
================================================================= */
function initFilters(){
  $('#cCity').innerHTML='<option value="">كل المدن</option>'+[...new Set(DB.children.map(c=>c.city))].sort().map(c=>`<option>${c}</option>`).join('');
  $('#cWorker').innerHTML='<option value="">كل الميدانيين</option>'+[...new Set(DB.children.map(c=>c.fieldWorker))].filter(Boolean).sort().map(w=>`<option>${w}</option>`).join('');
  ['#cSearch','#cGender','#cCity','#cWorker','#cStatus'].forEach(s=>$(s).addEventListener('input',()=>{cPage=1;renderCards();}));
}
function filterChildren(){
  const q=$('#cSearch').value.trim().toLowerCase(),g=$('#cGender').value,city=$('#cCity').value,w=$('#cWorker').value,st=$('#cStatus').value;
  return DB.children.filter(c=>{
    if(g&&c.gender!==g)return false;
    if(city&&c.city!==city)return false;
    if(w&&c.fieldWorker!==w)return false;
    if(st==='ok'&&!paidNow(c))return false;
    if(st==='late'&&!isLate(c))return false;
    if(st==='orphan'&&!isOrphan(c))return false;
    if(q&&!`${c.name} ${c.box} ${c.city} ${c.fieldWorker}`.toLowerCase().includes(q))return false;
    return true;
  });
}
function renderCards(){
  const list=filterChildren();
  $('#cCount').textContent=`${list.length} طفل`;
  const pages=Math.max(1,Math.ceil(list.length/PER_PAGE));
  if(cPage>pages)cPage=1;
  const slice=list.slice((cPage-1)*PER_PAGE,cPage*PER_PAGE);
  const grid=$('#cGrid');
  if(!slice.length){ grid.innerHTML=`<div class="empty" style="grid-column:1/-1"><div class="ei"><i class="fa-solid fa-magnifying-glass"></i></div><b>لا نتائج</b><p>غيّر معايير البحث أو الفلاتر.</p></div>`; $('#cPager').innerHTML=''; return; }
  grid.innerHTML=slice.map(c=>{
    const m=isMale(c);
    const stChip=paidNow(c)?'<span class="chip ok"><i class="fa-solid fa-check"></i> مكفول</span>'
      :(c.unpaidStreak>=2?'<span class="chip bad"><i class="fa-solid fa-clock"></i> متأخّر شهرين+</span>':'<span class="chip warn"><i class="fa-solid fa-clock"></i> متأخّر</span>');
    const strip=MONTHS.slice(0,DB.currentMonthIndex+1).map(mn=>{const v=String(c.months?.[mn]).trim();return `<i class="${v==='✓'?'p':v==='✗'?'x':''}" title="${mn}"></i>`;}).join('');
    return `<div class="card ${m?'m':'f'}" onclick="openChild('${c.box}')">
      <div class="head"><div class="ava">${(c.name||'؟').charAt(0)}</div>
        <div class="hd-t"><b>${c.name}</b><span>${c.city}</span></div></div>
      <div class="body">
        <div class="row"><span>الجنس / العمر</span><b>${c.gender} · ${c.age??'—'}</b></div>
        <div class="row"><span>المرحلة</span><b>${c.stage||'—'}</b></div>
        <div class="row"><span>الميداني</span><b>${c.fieldWorker||'—'}</b></div>
        <div class="row"><span>اليُتم</span><b>${isOrphan(c)?'يتيم':'لا'}</b></div>
        <div class="strip">${strip}</div>
        <div class="foot">${stChip}<span class="dot-tag">#${c.box}</span></div>
      </div></div>`;
  }).join('');
  // pager
  let p=`<button ${cPage===1?'disabled':''} onclick="setCPage(${cPage-1})"><i class="fa-solid fa-angle-right"></i></button>`;
  for(let i=1;i<=pages;i++){
    if(pages>7&&Math.abs(i-cPage)>2&&i!==1&&i!==pages){ if(i===2||i===pages-1)p+=`<button disabled>…</button>`; continue; }
    p+=`<button class="${i===cPage?'active':''}" onclick="setCPage(${i})">${i}</button>`;
  }
  p+=`<button ${cPage===pages?'disabled':''} onclick="setCPage(${cPage+1})"><i class="fa-solid fa-angle-left"></i></button>`;
  $('#cPager').innerHTML=p;
}
window.setCPage=i=>{cPage=i;renderCards();window.scrollTo({top:0,behavior:'smooth'});};

/* =================================================================
   CHILD PROFILE DRAWER
================================================================= */
window.openChild=box=>{
  const c=DB.children.find(x=>String(x.box)===String(box)); if(!c)return;
  const m=isMale(c);
  const monthsCells=MONTHS.map((mn,i)=>{
    const v=String(c.months?.[mn]).trim(); const cls=v==='✓'?'p':v==='✗'?'x':'b';
    const sym=v==='✓'?'✓':v==='✗'?'✗':'—';
    return `<div class="dr-m ${cls}"><small>${MONTH_SHORT[i]}</small>${sym}</div>`;
  }).join('');
  const stChip=paidNow(c)?'<span class="chip ok">مكفول حالياً</span>':`<span class="chip ${c.unpaidStreak>=2?'bad':'warn'}">متأخّر ${c.unpaidStreak} شهر</span>`;
  $('#drawerContent').innerHTML=`
    <div class="dr-head ${m?'':'f'}">
      <button class="close" onclick="closeChild()"><i class="fa-solid fa-xmark"></i></button>
      <div class="ava-lg">${(c.name||'؟').charAt(0)}</div>
      <h2>${c.name}</h2>
      <div class="sub">صندوق #${c.box} · ${c.city} · ${c.gender}</div>
      <div style="margin-top:10px">${stChip}</div>
    </div>
    <div class="dr-body">
      <div class="dr-sec"><h4><i class="fa-solid fa-id-card"></i> الهوية الأساسية</h4>
        <div class="dr-grid">
          ${f('العمر',c.age)}${f('تاريخ الميلاد',c.birthdate)}
          ${f('المدينة',c.city)}${f('حالة اليُتم',c.orphan)}
          ${f('هاتف ولي الأمر',c.guardianPhone)}${f('الحالة النفسية',c.psych)}
        </div></div>
      <div class="dr-sec"><h4><i class="fa-solid fa-graduation-cap"></i> البيانات الأكاديمية</h4>
        <div class="dr-grid">
          ${f('المرحلة',c.stage)}${f('الصف',c.grade)}
          ${f('الانتظام',c.attendance)}${f('العمل السابق',c.prevWork)}
          ${f('سبب الانقطاع',c.dropReason,true)}
        </div></div>
      <div class="dr-sec"><h4><i class="fa-solid fa-user-tie"></i> المتابعة الميدانية</h4>
        <div class="dr-grid">
          ${f('الميداني المسؤول',c.fieldWorker)}${f('تاريخ الزيارة',c.visitDate)}
          ${f('احتياج إضافي',c.extraNeed)}${c.boxLink?`<div class="dr-f full"><div class="k">رابط الصندوق</div><div class="v"><a href="${c.boxLink}" target="_blank">فتح في مولهم <i class="fa-solid fa-arrow-up-right-from-square"></i></a></div></div>`:''}
        </div></div>
      <div class="dr-sec"><h4><i class="fa-solid fa-calendar-check"></i> سجل التبرّعات الشهري (${c.paidMonths} شهر)</h4>
        <div class="dr-months">${monthsCells}</div></div>
      <div class="dr-sec"><h4><i class="fa-solid fa-sack-dollar"></i> الكفالة المالية</h4>
        <div class="dr-grid">
          ${f('أشهر التبرّع',c.paidMonths)}${f('إجمالي الكفالة',usd(c.paidMonths*50))}
          ${f('نسبة الحسم',(c.discount||0)+'%')}${f('صافي الكفالة',usd(c.net_usd||c.paidMonths*50))}
        </div></div>
    </div>`;
  $('#drawer').classList.add('open'); $('#drawerBg').classList.add('open');
};
function f(k,v,full){ return `<div class="dr-f ${full?'full':''}"><div class="k">${k}</div><div class="v">${(v===''||v==null)?'—':v}</div></div>`; }
window.closeChild=()=>{ $('#drawer').classList.remove('open'); $('#drawerBg').classList.remove('open'); };

/* =================================================================
   REPORTS
================================================================= */
function initReports(){
  $('#rpMonth').innerHTML=DB.stats.map(s=>`<option>${s.month}</option>`).join('');
  $('#rpType').onchange=()=>{ $('#rpMonth').style.display=$('#rpType').value==='monthly'?'block':'none'; renderReport(); };
  $('#rpMonth').onchange=renderReport;
  $('#rpMonth').style.display='none';
  renderReport();
}
function renderReport(){
  const type=$('#rpType').value;
  if(type==='annual') $('#rpView').innerHTML=annualReport();
  else $('#rpView').innerHTML=monthlyReport($('#rpMonth').value);
  countUp($('#rpView'));
}
function annualReport(){
  const a=agg();
  const totSpon=DB.stats.reduce((x,s)=>x+n0(s.total_usd),0);
  const rows=DB.stats.map(s=>`<tr><td>${s.month}</td><td class="num">${fmt(s.sponsored)}</td>
    <td class="num">${fmt(s.unsponsored)}</td><td class="num">${Math.round(n0(s.coverage)*100)}%</td>
    <td class="num">${usd(s.total_usd)}</td></tr>`).join('');
  return `<div class="kpis">
      ${kpi('brand','fa-children',a.total,'إجمالي الأطفال')}
      ${kpi('ok','fa-hand-holding-heart',a.yearPaidMarks,'مجموع أشهر التبرّع')}
      ${kpi('gold','fa-sack-dollar',totSpon,'إجمالي الكفالات المسجّلة (USD)')}
      ${kpi('warn','fa-heart-crack',a.orphans,'الأيتام')}
    </div>
    <div class="slabel">الملخّص الشهري — السنة الكاملة</div>
    <div class="twrap"><table class="t"><thead><tr><th>الشهر</th><th>مكفول</th><th>غير مكفول</th><th>التغطية</th><th>قيمة الكفالات</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>الإجمالي</td><td class="num">${fmt(DB.stats.reduce((x,s)=>x+n0(s.sponsored),0))}</td>
      <td class="num">${fmt(DB.stats.reduce((x,s)=>x+n0(s.unsponsored),0))}</td><td>—</td><td class="num">${usd(totSpon)}</td></tr></tfoot>
    </table></div>`;
}
function monthlyReport(month){
  const s=DB.stats.find(x=>x.month===month); if(!s) return '<div class="empty"><b>لا بيانات لهذا الشهر</b></div>';
  const idx=MONTHS.indexOf(month);
  const paidKids=DB.children.filter(c=>String(c.months?.[month]).trim()==='✓');
  const lateKids=DB.children.filter(c=>String(c.months?.[month]).trim()!=='✓');
  return `<div class="kpis">
      ${kpi('ok','fa-hand-holding-heart',n0(s.sponsored),'مكفولون — '+month)}
      ${kpi('bad','fa-user-clock',n0(s.unsponsored),'غير مكفولين')}
      ${kpi('gold','fa-sack-dollar',n0(s.total_usd),'قيمة الكفالات (USD)')}
      ${kpi('brand','fa-percent',Math.round(n0(s.coverage)*100),'نسبة التغطية %')}
    </div>
    <div class="slabel">الأطفال غير المكفولين في ${month} (${lateKids.length})</div>
    <div class="twrap"><table class="t"><thead><tr><th>#</th><th>الاسم</th><th>المدينة</th><th>الميداني</th></tr></thead>
      <tbody>${lateKids.map(c=>`<tr><td class="num">${c.box}</td><td>${c.name}</td><td>${c.city}</td><td>${c.fieldWorker||'—'}</td></tr>`).join('')||'<tr><td colspan="4" style="text-align:center;color:var(--text-3)">الجميع مكفول 🎉</td></tr>'}</tbody>
    </table></div>`;
}

/* =================================================================
   EXPORTS
================================================================= */
function exportXlsx(){
  const wb=XLSX.utils.book_new();
  const rows=DB.children.map(c=>({'رقم الصندوق':c.box,'الاسم':c.name,'الجنس':c.gender,'المدينة':c.city,
    'العمر':c.age,'المرحلة':c.stage,'الصف':c.grade,'يتيم':c.orphan,'الميداني':c.fieldWorker,
    'هاتف ولي الأمر':c.guardianPhone,'أشهر التبرّع':c.paidMonths,
    'الحالة الحالية':paidNow(c)?'مكفول':'متأخّر','تأخّر (أشهر)':c.unpaidStreak,
    'إجمالي الكفالة USD':c.paidMonths*50}));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'الأطفال');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(DB.stats),'الإحصائيات');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(workerStats().map(w=>({
    'الميداني':w.name,'الأطفال':w.kids,'مكفول حالياً':w.paidNow,'متأخّر':w.late,'أشهر التبرّع':w.marks,'قيمة محصّلة USD':w.usd}))),'الميدانيون');
  if(DB.logistics.length) XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(DB.logistics),'اللوجستيات');
  XLSX.writeFile(wb,'الطفولة_المكسورة_تقرير.xlsx'); toast('تم تصدير Excel');
}
function exportPdf(){
  const {jsPDF}=window.jspdf; const doc=new jsPDF();
  const a=agg();
  doc.setFontSize(16); doc.text('Broken Childhood - Admin Report',14,16);
  doc.setFontSize(10); doc.text('Generated: '+new Date().toLocaleDateString('en-GB'),14,23);
  doc.text('Reference month: '+toLatinMonth(DB.currentMonth),14,29);
  doc.autoTable({startY:35,head:[['Metric','Value']],body:[
    ['Total children',a.total],['Males / Females',a.males+' / '+a.females],
    ['Orphans',a.orphans],['Sponsored ('+toLatinMonth(DB.currentMonth)+')',a.paid],
    ['Late / unpaid',a.late],['Coverage',a.coverage+'%'],
    ['Month value USD','$'+fmt(a.monthValue)],['Year collected USD','$'+fmt(a.yearValue)]],
    headStyles:{fillColor:[15,107,84]}});
  doc.autoTable({startY:doc.lastAutoTable.finalY+8,head:[['Worker','Kids','Sponsored','Late','Paid months']],
    body:workerStats().map(w=>[w.name,w.kids,w.paidNow,w.late,w.marks]),headStyles:{fillColor:[176,125,43]},styles:{fontSize:9}});
  doc.save('broken_childhood_admin_report.pdf'); toast('تم تصدير PDF');
}
function toLatinMonth(m){ const map={'يناير':'Jan','فبراير':'Feb','مارس':'Mar','أبريل':'Apr','مايو':'May','يونيو':'Jun','يوليو':'Jul','أغسطس':'Aug','سبتمبر':'Sep','أكتوبر':'Oct','نوفمبر':'Nov','ديسمبر':'Dec'}; return map[m]||m; }

/* =================================================================
   NAV / THEME / INIT
================================================================= */
window.go=name=>{
  $$('.page').forEach(p=>p.classList.remove('active'));
  $('#p-'+name).classList.add('active');
  $$('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.p===name));
  if(name==='map') buildMap();
  if(name==='children') renderCards();
  window.scrollTo({top:0,behavior:'smooth'});
};
function applyTheme(t){ document.documentElement.setAttribute('data-theme',t);
  $('#theme').innerHTML=t==='dark'?'<i class="fa-solid fa-sun"></i>':'<i class="fa-solid fa-moon"></i>';
  try{localStorage.setItem('cd_theme',t);}catch(_){}}
function toggleTheme(){ const cur=document.documentElement.getAttribute('data-theme');
  applyTheme(cur==='dark'?'light':'dark'); rebuildVisuals(); }
function rebuildVisuals(){
  buildOverviewCharts();
  if($('#p-logistics').classList.contains('active')) buildLogistics();
  if($('#p-efficiency').classList.contains('active')) buildEfficiency();
  if($('#p-workers').classList.contains('active')) buildWorkers();
  if($('#p-map').classList.contains('active')) buildMap();
}

async function init(){
  let saved='light'; try{ saved=localStorage.getItem('cd_theme')||'light'; }catch(_){}
  applyTheme(saved);
  await load();
  buildOverview();
  buildAlerts();
  buildWorkers();
  buildLogistics();
  buildEfficiency();
  initFilters();
  initReports();

  $$('#nav button').forEach(b=>b.onclick=()=>go(b.dataset.p));
  $('#theme').onclick=toggleTheme;
  $('#refresh').onclick=async()=>{ toast('جارٍ التحديث…'); await load(); buildOverview(); buildAlerts(); buildWorkers(); buildLogistics(); buildEfficiency(); renderCards(); initReports(); toast('تم التحديث'); };
  $('#drawerBg').onclick=closeChild;
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeChild(); });
  $('#quickPdf').onclick=exportPdf; $('#quickXlsx').onclick=exportXlsx;
  $('#rpPdf').onclick=exportPdf; $('#rpXlsx').onclick=exportXlsx;

  setTimeout(()=>$('#loader').classList.add('hide'),350);
}
document.addEventListener('DOMContentLoaded',init);
