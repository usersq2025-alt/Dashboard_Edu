/* =====================================================================
   الكود الكامل الموحّد — معدَّل (مدرسة ملهم للأيتام)
   ------------------------------------------------------------
   إصلاحات مهمة:
   - مطابقة اسم المدرسة من school.name (كائن المنصة)
   - سحب دفعات «وارد» فقط
   - منع تكرار WS- + تنظيف مكررات مرة واحدة
   - الإحصائيات الشهرية: مجمل / صافي بعد الخصم / قيمة الخصم
   - ربط داشبورد HTML كما كان
   الصق هذا الملف مكان الكود القديم كاملًا في Apps Script للملف الجديد.
   ===================================================================== */

const WORKSHOP_API_BASE = 'https://workshop-api.molhamteam.com';
const PROP_KEY = 'WORKSHOP_API_KEY';
const SCHOOL_NAME_TARGET = 'مدرسة ملهم للأيتام';
const MASTER_FILE_ID = '1WKUe2k8HFb73l9WlguDWyqWCjP6vg3FoHGSb28f2ChE';
const WEBAPP_USER_PROP = 'WEBAPP_USER';
const WEBAPP_PASS_PROP = 'WEBAPP_PASS';
const IDLIB_COORD_ = [35.93, 36.63];

const H = {
  BOX: 'رقم الصندوق',
  NAME: 'الاسم الكامل',
  BIRTH: 'تاريخ الميلاد',
  FIRST_SPONSOR_DATE: 'تاريخ أول كفالة',
  LAST_SPONSOR_DATE: 'تاريخ آخر كفالة',
  DURATION: 'مدة الاستفادة من الكفالة',
  BOX_STATUS: 'حالة الصندوق',
  BOX_LINK: 'رابط الصندوق',
  SPONSOR_NAME: 'اسم الكفيل',
  MONTHLY_AMOUNT: 'قيمة الكفالة الشهرية ($)',
  TOTAL_IN: 'إجمالي الداخل ($)',
  TOTAL_PAID: 'إجمالي المدفوع ($)',
  REMAINING: 'الرصيد المتبقي ($)',
  PROGRESS: 'نسبة الإنجاز (%)',
  LAST_SYNC: 'آخر مزامنة'
};

const LEDGER_H = {
  BOX: 'رقم الصندوق',
  NAME: 'اسم الطالب',
  PAYMENT_ID: 'معرف الدفعة',
  DATE: 'التاريخ',
  AMOUNT: 'المبلغ $',
  NET_AMOUNT: 'صافي المبلغ $',
  DONOR_ID: 'معرف المتبرع',
  DONOR_NAME: 'اسم المتبرع',
  DONOR_EMAIL: 'بريد المتبرع'
};

const DASHBOARD_SUPPLEMENT_HEADERS = {
  MOTHER: 'اسم الأم',
  GENDER: 'الجنس',
  LEGAL_STATUS: 'ما هي الحالة القانونية للطالب؟',
  HEALTH: 'الوضع الصحي',
  GRADE: 'الصف',
  COHORT: 'الفوج'
};

const MASTER_HEADERS = {
  BOX: 'رقم الصندوق',
  PREV_BOX: 'رقم الصندوق السابق',
  MOTHER: 'اسم الأم للطالب',
  GENDER: 'جنس الطالب',
  LEGAL_STATUS: 'ما هي الحالة القانونية للطالب؟',
  HEALTH: 'الوضع الصحي للطالب: (يمكن اختيار أكثر من خيار)',
  GRADE: 'الصف الدراسي',
  COHORT: 'الفوج'
};

const MASTER_TO_DASHBOARD_KEY = {
  MOTHER: 'MOTHER', GENDER: 'GENDER', LEGAL_STATUS: 'LEGAL_STATUS',
  HEALTH: 'HEALTH', GRADE: 'GRADE', COHORT: 'COHORT'
};

const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const HEADER_SEARCH_ROWS = 10;
const DISCOVERY_BATCH_SIZE = 30;
const DISCOVERY_MAX_PAGES = 300;
const PAYMENTS_PARALLEL = 20;
const PAYMENTS_TIME_BUDGET_MS = 5 * 60 * 1000;

/* ===================== قائمة ===================== */
function onOpen() {
  const ui = safeUi_();
  if (!ui) return;
  const dailyOn = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'dailySyncRun');
  ui.createMenu('🔄 مزامنة منصة ملهم')
    .addItem('🔑 تعيين مفتاح API', 'setApiKey')
    .addSeparator()
    .addItem('🔄 تحديث وجلب البيانات', 'updateAndFetchAll')
    .addSeparator()
    .addItem(dailyOn ? '⏰ إيقاف التحديث اليومي التلقائي' : '⏰ تفعيل التحديث اليومي التلقائي', 'toggleDailySync')
    .addSeparator()
    .addItem('📊 إعادة بناء الإحصائيات الشهرية (مجمل/صافي/خصم)', 'rebuildMonthlyStatsFromLedger')
    .addItem('🧹 تنظيف سجل التبرعات من المكررات (مرة واحدة)', 'dedupeDonationsLedgerOnce')
    .addToUi();

  ui.createMenu('🔗 مزامنة الملف الأم')
    .addItem('▶ بدء المزامنة', 'syncFromMasterFile')
    .addToUi();

  ui.createMenu('🌐 داشبورد HTML')
    .addItem('🔑 تعيين بيانات دخول الداشبورد', 'setWebAppCredentials')
    .addToUi();
}

function setApiKey() {
  const ui = safeUi_();
  if (!ui) return;
  const res = ui.prompt('مفتاح API', 'الصقي مفتاح X-API-Key هنا:', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const key = res.getResponseText().trim();
  if (!key) return;
  PropertiesService.getScriptProperties().setProperty(PROP_KEY, key);
  ui.alert('✅ تم حفظ المفتاح.');
}

function toggleDailySync() {
  const ui = safeUi_();
  const exists = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'dailySyncRun');
  if (exists) {
    ScriptApp.getProjectTriggers().forEach(t => {
      if (t.getHandlerFunction() === 'dailySyncRun') ScriptApp.deleteTrigger(t);
    });
    if (ui) ui.alert('تم إيقاف التحديث اليومي التلقائي.');
  } else {
    ScriptApp.newTrigger('dailySyncRun').timeBased().atHour(3).everyDays(1).create();
    if (ui) ui.alert('✅ تم تفعيل التحديث اليومي التلقائي (~٣ فجرًا).');
  }
}

function dailySyncRun() { updateAndFetchAll_(true); }

/* ===================== أدوات عامة ===================== */
function safeUi_() {
  try { return SpreadsheetApp.getUi(); } catch (e) { return null; }
}
function normalize_(str) { return String(str || '').replace(/\s+/g, ' ').trim(); }
function normalizeArabic_(str) {
  return normalize_(str)
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[\u064B-\u0652]/g, '');
}
function num_(v) { if (v === '' || v == null) return 0; const n = Number(v); return isNaN(n) ? 0 : n; }
function asText_(v) { return v == null ? '' : String(v).trim(); }
function formatNow_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Damascus', 'yyyy-MM-dd HH:mm');
}
function apiDateOnly_(s) { return s ? String(s).split(' ')[0] : ''; }

function schoolMatches_(rec) {
  var school = '';
  if (rec) {
    if (rec.school && typeof rec.school === 'object') {
      school = rec.school.name || rec.school.title || rec.school.label || '';
    } else if (typeof rec.school === 'string') {
      school = rec.school;
    } else {
      school = rec.institute_name || rec.school_name || '';
    }
  }
  return normalizeArabic_(school).indexOf(normalizeArabic_(SCHOOL_NAME_TARGET)) !== -1;
}

function findSheetByHeaders_(requiredHeaders) {
  const sheets = SpreadsheetApp.getActive().getSheets();
  for (let s = 0; s < sheets.length; s++) {
    const sh = sheets[s];
    const maxRow = Math.min(HEADER_SEARCH_ROWS, sh.getLastRow());
    const maxCol = sh.getLastColumn();
    if (maxRow < 1 || maxCol < 1) continue;
    const values = sh.getRange(1, 1, maxRow, maxCol).getValues();
    for (let r = 0; r < values.length; r++) {
      const row = values[r].map(v => String(v).trim());
      const cols = {};
      let allFound = true;
      for (const key in requiredHeaders) {
        const idx = row.indexOf(requiredHeaders[key]);
        if (idx === -1) { allFound = false; break; }
        cols[key] = idx + 1;
      }
      if (allFound) return { sheet: sh, headerRow: r + 1, cols: cols };
    }
  }
  return null;
}

function toDateKey_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone() || 'Asia/Damascus', 'yyyy-MM-dd');
  }
  const str = String(value).trim();
  if (!str) return '';
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return isoMatch[1] + '-' + isoMatch[2] + '-' + isoMatch[3];
  const parsed = new Date(str);
  if (!isNaN(parsed)) {
    return Utilities.formatDate(parsed, Session.getScriptTimeZone() || 'Asia/Damascus', 'yyyy-MM-dd');
  }
  return '';
}

/* ===================== اكتشاف طلاب المدرسة ===================== */
function discoverSchoolRecords_(apiKey) {
  const found = {};
  const first = UrlFetchApp.fetch(WORKSHOP_API_BASE + '/students?page=1', {
    headers: { 'X-API-Key': apiKey }, muteHttpExceptions: true
  });
  if (first.getResponseCode() === 401) return { authError: true, found: found };
  if (first.getResponseCode() !== 200) return { found: found, error: true };

  let json;
  try { json = JSON.parse(first.getContentText()); } catch (e) { return { found: found, error: true }; }
  (json.data || []).forEach(rec => { if (schoolMatches_(rec)) found[String(rec.id)] = rec; });

  const lastPage = Math.min(json.last_page || 1, DISCOVERY_MAX_PAGES);
  for (let p = 2; p <= lastPage; p += DISCOVERY_BATCH_SIZE) {
    const pages = [];
    for (let x = p; x < p + DISCOVERY_BATCH_SIZE && x <= lastPage; x++) pages.push(x);
    const requests = pages.map(pg => ({
      url: WORKSHOP_API_BASE + '/students?page=' + pg,
      method: 'get', headers: { 'X-API-Key': apiKey }, muteHttpExceptions: true
    }));
    const responses = UrlFetchApp.fetchAll(requests);
    let authError = false;
    responses.forEach(res => {
      if (res.getResponseCode() === 401) { authError = true; return; }
      if (res.getResponseCode() !== 200) return;
      let j;
      try { j = JSON.parse(res.getContentText()); } catch (e) { return; }
      (j.data || []).forEach(rec => { if (schoolMatches_(rec)) found[String(rec.id)] = rec; });
    });
    if (authError) return { authError: true, found: found };
  }
  return { found: found };
}

/* ===================== تحديث وجلب ===================== */
function updateAndFetchAll() { updateAndFetchAll_(false); }

function updateAndFetchAll_(quiet) {
  const ui = quiet ? null : safeUi_();
  const apiKey = PropertiesService.getScriptProperties().getProperty(PROP_KEY);
  if (!apiKey) { if (ui) ui.alert('⚠️ عيّني مفتاح API أولًا من القائمة.'); return; }

  const found = findSheetByHeaders_(H);
  if (!found) { if (ui) ui.alert('لم أجد شيت بيانات الطلاب بالعناوين المتوقعة.'); return; }
  const sh = found.sheet, cols = found.cols;
  const startRow = found.headerRow + 1;

  const discovery = discoverSchoolRecords_(apiKey);
  if (discovery.authError) { if (ui) ui.alert('❌ مفتاح API غير صالح.'); return; }

  const lastRow = sh.getLastRow();
  const boxToRow = {};
  if (lastRow >= startRow) {
    sh.getRange(startRow, cols.BOX, lastRow - startRow + 1, 1).getValues().forEach((r, i) => {
      const box = normalize_(r[0]);
      if (box) boxToRow[box] = startRow + i;
    });
  }

  const now = formatNow_();
  let updated = 0, added = 0;
  let nextFreeRow = Math.max(lastRow + 1, startRow);

  Object.keys(discovery.found).forEach(box => {
    const rec = discovery.found[box];
    let row = boxToRow[box];
    if (!row) {
      row = nextFreeRow;
      nextFreeRow++;
      boxToRow[box] = row;
      added++;
    } else {
      updated++;
    }
    writeStudentRow_(sh, row, cols, rec, now);
  });

  startPaymentsSync_(true);

  const summary = 'اكتمل التحديث ✅\n\n' +
    'طلاب على المنصة (مدرسة ملهم للأيتام): ' + Object.keys(discovery.found).length + '\n' +
    'صفوف محدّثة: ' + updated + '\n' +
    'صفوف جديدة: ' + added + '\n\n' +
    'سحب التبرعات يعمل بالخلفية، وبعد انتهائه تُحدَّث تواريخ الكفالة والإحصائيات الشهرية.';
  Logger.log(summary);
  if (ui) ui.alert(summary);
}

function writeStudentRow_(sh, row, cols, rec, now) {
  const totalIn = num_(rec.amount_in);
  const totalPaid = num_(rec.amount_out);
  const remaining = totalIn - totalPaid;
  const boxStatus = rec.is_active === true ? 'نشط' : 'مغلق';
  const sponsorName = (rec.sponsor && rec.sponsor.name) || '';
  // لا نفرض 100% هنا — تُحسب لاحقًا من السجل بعد سحب الدفعات
  const progress = num_(rec.progress_percentage);

  sh.getRange(row, cols.BOX).setValue(rec.id);
  if (asText_(rec.name)) sh.getRange(row, cols.NAME).setValue(asText_(rec.name));
  if (asText_(rec.birth)) sh.getRange(row, cols.BIRTH).setValue(apiDateOnly_(rec.birth));

  sh.getRange(row, cols.BOX_STATUS).setValue(boxStatus);
  sh.getRange(row, cols.BOX_LINK).setValue('https://molhamteam.com/students/' + rec.id);
  sh.getRange(row, cols.SPONSOR_NAME).setValue(sponsorName);
  sh.getRange(row, cols.MONTHLY_AMOUNT).setValue(num_(rec.sponsorship_amount));
  sh.getRange(row, cols.TOTAL_IN).setValue(totalIn);
  sh.getRange(row, cols.TOTAL_PAID).setValue(totalPaid);
  sh.getRange(row, cols.REMAINING).setValue(remaining);
  if (cols.PROGRESS) sh.getRange(row, cols.PROGRESS).setValue(progress);
  sh.getRange(row, cols.LAST_SYNC).setValue(now);
}

/* ===================== سجل التبرعات ===================== */
function startPaymentsSync_(quiet) {
  const existing = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'syncPaymentsBatch_');
  if (!existing) {
    ScriptApp.newTrigger('syncPaymentsBatch_').timeBased().everyMinutes(1).create();
    PropertiesService.getScriptProperties().setProperty('PAY_CURSOR', '0');
  }
  if (!quiet) {
    const ui = safeUi_();
    if (ui) ui.alert('سحب سجل التبرعات بالخلفية شغّال.');
  }
}

function ensureLedgerSheet_() {
  const ss = SpreadsheetApp.getActive();
  const byName = ss.getSheetByName('سجل التبرعات');
  if (byName) {
    const mapped = mapLedgerColsFromSheet_(byName);
    if (mapped) return mapped;
  }
  const found = findSheetByHeaders_(LEDGER_H);
  if (found) return found;

  const sh = ss.insertSheet('سجل التبرعات');
  const headers = ['رقم الصندوق', 'اسم الطالب', 'معرف الدفعة', 'التاريخ', 'المبلغ $', 'صافي المبلغ $', 'معرف المتبرع', 'اسم المتبرع', 'بريد المتبرع'];
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sh.setFrozenRows(1);
  const cols = {};
  headers.forEach((h, i) => {
    const key = Object.keys(LEDGER_H).find(k => LEDGER_H[k] === h);
    if (key) cols[key] = i + 1;
  });
  return { sheet: sh, headerRow: 1, cols: cols };
}

function mapLedgerColsFromSheet_(sh) {
  const maxRow = Math.min(HEADER_SEARCH_ROWS, Math.max(1, sh.getLastRow()));
  const maxCol = Math.max(1, sh.getLastColumn());
  const values = sh.getRange(1, 1, maxRow, maxCol).getValues();
  for (let r = 0; r < values.length; r++) {
    const row = values[r].map(v => String(v).trim());
    const cols = {};
    let allFound = true;
    for (const key in LEDGER_H) {
      const idx = row.indexOf(LEDGER_H[key]);
      if (idx === -1) { allFound = false; break; }
      cols[key] = idx + 1;
    }
    if (allFound) return { sheet: sh, headerRow: r + 1, cols: cols };
  }
  return null;
}

function syncPaymentsBatch_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) { Logger.log('⏭️ تشغيل موازٍ — تخطي.'); return; }
  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty(PROP_KEY);
    if (!apiKey) return;

    const mainFound = findSheetByHeaders_(H);
    if (!mainFound) return;
    const mainSheet = mainFound.sheet, mainCols = mainFound.cols;
    const mainStartRow = mainFound.headerRow + 1;
    const mainLastRow = mainSheet.getLastRow();
    if (mainLastRow < mainStartRow) return;

    const boxRows = mainSheet.getRange(mainStartRow, mainCols.BOX, mainLastRow - mainStartRow + 1, 1).getValues();
    const nameRows = mainSheet.getRange(mainStartRow, mainCols.NAME, mainLastRow - mainStartRow + 1, 1).getValues();

    const props = PropertiesService.getScriptProperties();
    let cursor = Number(props.getProperty('PAY_CURSOR') || '0');
    if (cursor >= boxRows.length) cursor = 0;

    const ledgerFound = ensureLedgerSheet_();
    const ledgerSheet = ledgerFound.sheet, lc = ledgerFound.cols;
    const ledgerLast = ledgerSheet.getLastRow();
    const existingIds = {};
    if (ledgerLast > ledgerFound.headerRow) {
      ledgerSheet.getRange(ledgerFound.headerRow + 1, lc.PAYMENT_ID, ledgerLast - ledgerFound.headerRow, 1)
        .getValues().forEach(r => { if (r[0]) existingIds[String(r[0])] = true; });
    }

    const start = Date.now();
    const newRows = [];
    let processed = 0, rateLimited = false;

    function absorbPayments_(box, name, list) {
      (list || []).forEach(p => {
        if (p.type !== 'وارد') return; // مهم: لا نُدخل «صادر»
        const idKey = 'WS-' + p.id;
        if (existingIds[idKey]) return;
        existingIds[idKey] = true;
        newRows.push([
          box, name, idKey, apiDateOnly_(p.date), num_(p.amount), num_(p.net_amount),
          (p.donor && p.donor.id) || '', (p.donor && p.donor.name) || '', (p.donor && p.donor.email) || ''
        ]);
      });
    }

    while (cursor < boxRows.length && (Date.now() - start) < PAYMENTS_TIME_BUDGET_MS && !rateLimited) {
      const wave = [];
      while (wave.length < PAYMENTS_PARALLEL && cursor < boxRows.length) {
        const box = normalize_(boxRows[cursor][0]);
        const name = normalize_(nameRows[cursor][0]);
        cursor++;
        if (!box) continue;
        wave.push({ box: box, name: name, page: 1 });
      }
      if (!wave.length) break;

      let requests = wave.map(w => ({
        url: WORKSHOP_API_BASE + '/students/' + w.box + '/payments?page=' + w.page,
        method: 'get', headers: { 'X-API-Key': apiKey }, muteHttpExceptions: true
      }));
      let responses = UrlFetchApp.fetchAll(requests);

      const needNext = [];
      for (let i = 0; i < wave.length; i++) {
        const code = responses[i].getResponseCode();
        if (code === 429) { rateLimited = true; break; }
        if (code !== 200) continue;
        let json;
        try { json = JSON.parse(responses[i].getContentText()); } catch (e) { continue; }
        absorbPayments_(wave[i].box, wave[i].name, json.data || []);
        if (json.next_page_url && wave[i].page < 5) { wave[i].page++; needNext.push(wave[i]); }
      }
      if (rateLimited) { cursor -= wave.length; break; }

      while (needNext.length && (Date.now() - start) < PAYMENTS_TIME_BUDGET_MS) {
        const chunk = needNext.splice(0, PAYMENTS_PARALLEL);
        requests = chunk.map(w => ({
          url: WORKSHOP_API_BASE + '/students/' + w.box + '/payments?page=' + w.page,
          method: 'get', headers: { 'X-API-Key': apiKey }, muteHttpExceptions: true
        }));
        responses = UrlFetchApp.fetchAll(requests);
        for (let j = 0; j < chunk.length; j++) {
          const code = responses[j].getResponseCode();
          if (code === 429) { rateLimited = true; break; }
          if (code !== 200) continue;
          let json;
          try { json = JSON.parse(responses[j].getContentText()); } catch (e) { continue; }
          absorbPayments_(chunk[j].box, chunk[j].name, json.data || []);
          if (json.next_page_url && chunk[j].page < 5) { chunk[j].page++; needNext.push(chunk[j]); }
        }
        if (rateLimited) break;
      }
      processed += wave.length;
    }

    if (newRows.length) {
      ledgerSheet.getRange(ledgerSheet.getLastRow() + 1, 1, newRows.length, 9).setValues(newRows);
    }

    props.setProperty('PAY_CURSOR', String(cursor));
    Logger.log('دفعات: عولج ' + processed + '، مؤشر=' + cursor + '/' + boxRows.length + '، جديد=' + newRows.length);

    if (rateLimited) Utilities.sleep(1500);

    if (cursor >= boxRows.length) {
      props.setProperty('PAY_CURSOR', '0');
      updateSponsorDatesFromLedger_();
      rebuildMonthlyStatsFromLedger_(true);
      ScriptApp.getProjectTriggers().forEach(t => {
        if (t.getHandlerFunction() === 'syncPaymentsBatch_') ScriptApp.deleteTrigger(t);
      });
      Logger.log('اكتملت دورة سحب التبرعات + الإحصائيات الشهرية.');
    }
  } finally {
    lock.releaseLock();
  }
}

/* ===================== تنظيف المكررات ===================== */
function dedupeDonationsLedgerOnce() {
  const ui = safeUi_();
  const found = ensureLedgerSheet_();
  const sh = found.sheet, lc = found.cols;
  const start = found.headerRow + 1;
  const last = sh.getLastRow();
  if (last < start) { if (ui) ui.alert('سجل التبرعات فارغ.'); return; }

  const width = Math.max(sh.getLastColumn(), 9);
  const vals = sh.getRange(start, 1, last - start + 1, width).getValues();
  const seen = {};
  const kept = [];
  let removed = 0;

  vals.forEach(r => {
    const id = String(r[lc.PAYMENT_ID - 1] || '').trim();
    const key = id || ('_' + [r[lc.BOX - 1], r[lc.DATE - 1], r[lc.AMOUNT - 1], r[lc.DONOR_ID - 1]].join('|'));
    if (seen[key]) { removed++; return; }
    seen[key] = true;
    kept.push(r);
  });

  sh.getRange(start, 1, last - start + 1, width).clearContent();
  if (kept.length) sh.getRange(start, 1, kept.length, width).setValues(kept);

  const msg = 'تنظيف سجل التبرعات ✅\nقبل: ' + vals.length + '\nبعد: ' + kept.length + '\nحُذف: ' + removed;
  Logger.log(msg);
  if (ui) ui.alert(msg);
  rebuildMonthlyStatsFromLedger_(true);
}

/* ===================== تواريخ الكفالة ===================== */
function updateSponsorDatesFromLedger_() {
  const mainFound = findSheetByHeaders_(H);
  const ledgerFound = findSheetByHeaders_(LEDGER_H) || ensureLedgerSheet_();
  if (!mainFound || !ledgerFound) return;

  const mainSheet = mainFound.sheet, mc = mainFound.cols;
  const ledgerSheet = ledgerFound.sheet, lc = ledgerFound.cols;
  const ledgerLast = ledgerSheet.getLastRow();
  const byBox = {};

  if (ledgerLast > ledgerFound.headerRow) {
    ledgerSheet.getRange(ledgerFound.headerRow + 1, 1, ledgerLast - ledgerFound.headerRow, ledgerSheet.getLastColumn())
      .getValues().forEach(r => {
        const box = normalize_(r[lc.BOX - 1]);
        const dateKey = toDateKey_(r[lc.DATE - 1]);
        if (!box || !dateKey) return;
        if (!byBox[box]) byBox[box] = { min: dateKey, max: dateKey };
        if (dateKey < byBox[box].min) byBox[box].min = dateKey;
        if (dateKey > byBox[box].max) byBox[box].max = dateKey;
      });
  }

  const mainStartRow = mainFound.headerRow + 1;
  const mainLastRow = mainSheet.getLastRow();
  if (mainLastRow < mainStartRow) return;
  const numDataRows = mainLastRow - mainStartRow + 1;

  if (mc.FIRST_SPONSOR_DATE) mainSheet.getRange(mainStartRow, mc.FIRST_SPONSOR_DATE, numDataRows, 1).setNumberFormat('yyyy-mm-dd');
  if (mc.LAST_SPONSOR_DATE) mainSheet.getRange(mainStartRow, mc.LAST_SPONSOR_DATE, numDataRows, 1).setNumberFormat('yyyy-mm-dd');
  if (mc.DURATION) mainSheet.getRange(mainStartRow, mc.DURATION, numDataRows, 1).setNumberFormat('@');
  if (mc.PROGRESS) mainSheet.getRange(mainStartRow, mc.PROGRESS, numDataRows, 1).setNumberFormat('0.0"%"');

  const boxVals = mainSheet.getRange(mainStartRow, mc.BOX, numDataRows, 1).getValues();
  boxVals.forEach((r, i) => {
    const box = normalize_(r[0]);
    const info = byBox[box];
    const row = mainStartRow + i;

    if (!info) {
      setIfNotFormula_(mainSheet, row, mc.FIRST_SPONSOR_DATE, '');
      setIfNotFormula_(mainSheet, row, mc.LAST_SPONSOR_DATE, '');
      if (mc.DURATION) setIfNotFormula_(mainSheet, row, mc.DURATION, '');
      if (mc.PROGRESS) setIfNotFormula_(mainSheet, row, mc.PROGRESS, 0);
      return;
    }

    setIfNotFormula_(mainSheet, row, mc.FIRST_SPONSOR_DATE, info.min);
    setIfNotFormula_(mainSheet, row, mc.LAST_SPONSOR_DATE, info.max);

    const boxStatus = mc.BOX_STATUS ? String(mainSheet.getRange(row, mc.BOX_STATUS).getValue()).trim() : '';
    const todayStr = formatNow_().split(' ')[0];
    const endDateForCalc = boxStatus === 'مغلق' ? info.max : todayStr;

    if (mc.DURATION) setIfNotFormula_(mainSheet, row, mc.DURATION, durationLabel_(info.min, endDateForCalc));

    if (mc.PROGRESS && mc.MONTHLY_AMOUNT && mc.TOTAL_IN) {
      const monthlyAmount = num_(mainSheet.getRange(row, mc.MONTHLY_AMOUNT).getValue());
      const totalIn = num_(mainSheet.getRange(row, mc.TOTAL_IN).getValue());
      const monthsElapsed = monthsElapsedInclusive_(info.min, endDateForCalc);
      const expected = monthlyAmount * monthsElapsed;
      const progress = expected > 0
        ? Math.min(100, Math.round((totalIn / expected) * 100))
        : (totalIn > 0 ? 100 : 0);
      setIfNotFormula_(mainSheet, row, mc.PROGRESS, progress);
    }
  });
}

function monthsElapsedInclusive_(startDateStr, endDateStr) {
  const d1 = new Date(startDateStr), d2 = new Date(endDateStr);
  if (isNaN(d1) || isNaN(d2)) return 1;
  const months = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth()) + 1;
  return Math.max(1, months);
}

function setIfNotFormula_(sh, row, col, value) {
  if (!col) return;
  const range = sh.getRange(row, col);
  if (range.getFormula()) return;
  range.setValue(value);
}

function durationLabel_(minDate, maxDate) {
  const d1 = new Date(minDate), d2 = new Date(maxDate);
  if (isNaN(d1) || isNaN(d2)) return '';
  let totalMonths = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
  if (totalMonths < 0) totalMonths = 0;
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  let yearsText = '';
  if (years === 1) yearsText = 'سنة';
  else if (years === 2) yearsText = 'سنتين';
  else if (years >= 3) yearsText = 'سنوات';
  const monthsText = months > 0 ? (months + ' أشهر') : '';
  if (yearsText && monthsText) return yearsText + ' و ' + monthsText;
  if (yearsText) return yearsText;
  if (monthsText) return monthsText;
  return '';
}

/* ===================== الإحصائيات الشهرية: مجمل / صافي / خصم ===================== */
function rebuildMonthlyStatsFromLedger() { rebuildMonthlyStatsFromLedger_(false); }

function rebuildMonthlyStatsFromLedger_(quiet) {
  const ui = quiet ? null : safeUi_();
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName('الإحصائيات الشهرية');
  if (!sh) sh = ss.insertSheet('الإحصائيات الشهرية');

  const ledgerFound = ensureLedgerSheet_();
  const ledgerSheet = ledgerFound.sheet, lc = ledgerFound.cols;
  const ledgerLast = ledgerSheet.getLastRow();

  const year = new Date().getFullYear();
  const byMonth = {};
  MONTHS_AR.forEach((_, i) => {
    byMonth[i] = { gross: 0, net: 0, fee: 0, count: 0, donors: {}, boxes: {} };
  });

  if (ledgerLast > ledgerFound.headerRow) {
    ledgerSheet.getRange(ledgerFound.headerRow + 1, 1, ledgerLast - ledgerFound.headerRow, ledgerSheet.getLastColumn())
      .getValues().forEach(r => {
        const day = toDateKey_(r[lc.DATE - 1]);
        if (!day || Number(day.slice(0, 4)) !== year) return;
        const mi = Number(day.slice(5, 7)) - 1;
        if (mi < 0 || mi > 11) return;
        const gross = num_(r[lc.AMOUNT - 1]);
        const net = num_(r[lc.NET_AMOUNT - 1]);
        const fee = Math.max(0, gross - net);
        const box = normalize_(r[lc.BOX - 1]);
        const donor = String(r[lc.DONOR_ID - 1] || r[lc.DONOR_NAME - 1] || '').trim();
        byMonth[mi].gross += gross;
        byMonth[mi].net += net;
        byMonth[mi].fee += fee;
        byMonth[mi].count += 1;
        if (box) byMonth[mi].boxes[box] = true;
        if (donor) byMonth[mi].donors[donor] = true;
      });
  }

  // عدد الطلاب الكلي (لتغطية تقريبية)
  const mainFound = findSheetByHeaders_(H);
  let totalStudents = 0;
  if (mainFound) {
    const start = mainFound.headerRow + 1;
    const last = mainFound.sheet.getLastRow();
    if (last >= start) totalStudents = last - start + 1;
  }

  const headers = [
    'الشهر',
    'المتبرع لهم',
    'غير المتبرع لهم',
    'نسبة التغطية %',
    'إجمالي التبرعات المجملة ($)',
    'بعد الخصم الإداري ($)',
    'الخصم الإداري ($)',
    'عدد التبرعات',
    'عدد المتبرعين'
  ];

  sh.clear();
  sh.getRange(1, 1, 1, headers.length).merge().setValue('مدرسة ملهم للأيتام في إدلب — الإحصائيات الشهرية').setFontWeight('bold');
  sh.getRange(2, 1).setValue('السنة');
  sh.getRange(2, 2).setValue(year);
  sh.getRange(3, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');

  let sumGross = 0, sumNet = 0, sumFee = 0, sumCount = 0;
  const rows = MONTHS_AR.map((m, i) => {
    const b = byMonth[i];
    const helped = Object.keys(b.boxes).length;
    const notHelped = Math.max(0, totalStudents - helped);
    const cov = totalStudents ? Math.round((helped / totalStudents) * 1000) / 10 : 0;
    const donors = Object.keys(b.donors).length;
    sumGross += b.gross; sumNet += b.net; sumFee += b.fee; sumCount += b.count;
    return [m, helped, notHelped, cov, b.gross, b.net, b.fee, b.count, donors];
  });

  sh.getRange(4, 1, 12, headers.length).setValues(rows);
  sh.getRange(16, 1, 1, headers.length).setValues([[
    'الإجمالي / السنة', '', '', '', sumGross, sumNet, sumFee, sumCount, ''
  ]]).setFontWeight('bold');

  sh.getRange(4, 5, 13, 3).setNumberFormat('$#,##0.00');
  sh.getRange(4, 4, 12, 1).setNumberFormat('0.0');
  sh.setFrozenRows(3);

  const msg = 'الإحصائيات الشهرية ✅\nمجمل السنة: $' + sumGross.toFixed(2) +
    '\nبعد الخصم: $' + sumNet.toFixed(2) +
    '\nالخصم: $' + sumFee.toFixed(2);
  Logger.log(msg);
  if (ui) ui.alert(msg);
}

/* ===================== الملف الأم ===================== */
function syncFromMasterFile() { syncFromMasterFile_(false); }

function findMasterHeaderCols_(spreadsheet, requiredHeaders) {
  const sheets = spreadsheet.getSheets();
  for (let s = 0; s < sheets.length; s++) {
    const sh = sheets[s];
    const maxRow = Math.min(HEADER_SEARCH_ROWS, sh.getLastRow());
    const maxCol = sh.getLastColumn();
    if (maxRow < 1 || maxCol < 1) continue;
    const values = sh.getRange(1, 1, maxRow, maxCol).getValues();
    for (let r = 0; r < values.length; r++) {
      const row = values[r].map(v => String(v).trim());
      const cols = {};
      let allFound = true;
      for (const key in requiredHeaders) {
        const idx = row.indexOf(requiredHeaders[key]);
        if (idx === -1) { allFound = false; break; }
        cols[key] = idx + 1;
      }
      if (allFound) return { sheet: sh, headerRow: r + 1, cols: cols };
    }
  }
  return null;
}

function syncFromMasterFile_(quiet) {
  const ui = quiet ? null : safeUi_();
  let masterSs;
  try { masterSs = SpreadsheetApp.openById(MASTER_FILE_ID); }
  catch (e) { if (ui) ui.alert('⚠️ تعذّر فتح ملف البيانات الأم.'); return; }

  const masterFound = findMasterHeaderCols_(masterSs, MASTER_HEADERS);
  if (!masterFound) { if (ui) ui.alert('⚠️ لم أجد أعمدة الملف الأم.'); return; }
  const mSheet = masterFound.sheet, mc = masterFound.cols;
  const mStartRow = masterFound.headerRow + 1;
  const mLastRow = mSheet.getLastRow();
  if (mLastRow < mStartRow) { if (ui) ui.alert('ملف البيانات الأم فاضي.'); return; }

  const mVals = mSheet.getRange(mStartRow, 1, mLastRow - mStartRow + 1, mSheet.getLastColumn()).getValues();
  const masterByBox = {};
  mVals.forEach(r => {
    const box = normalize_(r[mc.BOX - 1]);
    const prevBoxRaw = normalize_(r[mc.PREV_BOX - 1]);
    if (!box && !prevBoxRaw) return;
    const info = {
      MOTHER: asText_(r[mc.MOTHER - 1]),
      GENDER: asText_(r[mc.GENDER - 1]),
      LEGAL_STATUS: asText_(r[mc.LEGAL_STATUS - 1]),
      HEALTH: asText_(r[mc.HEALTH - 1]),
      GRADE: asText_(r[mc.GRADE - 1]),
      COHORT: asText_(r[mc.COHORT - 1])
    };
    if (box) masterByBox[box] = info;
    if (prevBoxRaw) prevBoxRaw.split(',').forEach(pb => {
      const key = normalize_(pb);
      if (key) masterByBox[key] = info;
    });
  });

  const dashFound = findSheetByHeaders_(H);
  if (!dashFound) { if (ui) ui.alert('لم أجد شيت بيانات الطلاب.'); return; }
  const sh = dashFound.sheet;
  const headerRow = dashFound.headerRow;
  const startRow = headerRow + 1;
  const lastRow = sh.getLastRow();
  if (lastRow < startRow) { if (ui) ui.alert('لا توجد بيانات طلاب.'); return; }

  const headerVals = sh.getRange(headerRow, 1, 1, sh.getLastColumn()).getValues()[0].map(v => String(v).trim());
  const cols = { BOX: dashFound.cols.BOX };
  Object.keys(DASHBOARD_SUPPLEMENT_HEADERS).forEach(key => {
    const idx = headerVals.indexOf(DASHBOARD_SUPPLEMENT_HEADERS[key]);
    if (idx !== -1) cols[key] = idx + 1;
  });

  const numRows = lastRow - startRow + 1;
  const boxVals = sh.getRange(startRow, cols.BOX, numRows, 1).getValues();
  const availableKeys = Object.keys(MASTER_TO_DASHBOARD_KEY).filter(k => !!cols[MASTER_TO_DASHBOARD_KEY[k]]);
  if (!availableKeys.length) { if (ui) ui.alert('⚠️ لم أجد أعمدة الاستكمال بالداشبورد.'); return; }

  const outputs = {};
  availableKeys.forEach(key => {
    const dashKey = MASTER_TO_DASHBOARD_KEY[key];
    outputs[key] = sh.getRange(startRow, cols[dashKey], numRows, 1).getValues().map(r => r[0]);
  });

  let filled = 0, matchedBoxes = 0;
  for (let i = 0; i < numRows; i++) {
    const box = normalize_(boxVals[i][0]);
    if (!box) continue;
    const info = masterByBox[box];
    if (!info) continue;
    matchedBoxes++;
    availableKeys.forEach(key => {
      const cur = asText_(outputs[key][i]);
      const newVal = info[key];
      if (!cur && newVal) { outputs[key][i] = newVal; filled++; }
    });
  }

  availableKeys.forEach(key => {
    const dashKey = MASTER_TO_DASHBOARD_KEY[key];
    sh.getRange(startRow, cols[dashKey], numRows, 1).setValues(outputs[key].map(v => [v]));
  });

  const summary = 'استكمال من ملف البيانات الأم ✅\nتطابق: ' + matchedBoxes + '\nخلايا مُلئت: ' + filled;
  Logger.log(summary);
  if (ui) ui.alert(summary);
}

/* ===================== Web App للداشبورد ===================== */
function setWebAppCredentials() {
  const ui = safeUi_();
  if (!ui) return;
  const u = ui.prompt('اسم المستخدم', 'اسم مستخدم الداشبورد:', ui.ButtonSet.OK_CANCEL);
  if (u.getSelectedButton() !== ui.Button.OK) return;
  const uname = u.getResponseText().trim();
  if (!uname) return;
  const p = ui.prompt('كلمة المرور', 'كلمة مرور الداشبورد:', ui.ButtonSet.OK_CANCEL);
  if (p.getSelectedButton() !== ui.Button.OK) return;
  const pass = p.getResponseText();
  if (!pass) return;
  PropertiesService.getScriptProperties().setProperty(WEBAPP_USER_PROP, uname);
  PropertiesService.getScriptProperties().setProperty(WEBAPP_PASS_PROP, pass);
  ui.alert('✅ تم الحفظ. انشري Web App (نفس الرابط أو إصدار جديد).');
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === 'login') return jsonOut_(webLogin_(p.user, p.pass));
    if (p.action === 'shareLogin') return jsonOut_(webShareLogin_());
    if (p.token) return jsonOut_(webAuthedPayload_(p.token));
    return jsonOut_({ ok: false, error: 'missing token' });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function webLogin_(user, pass) {
  const props = PropertiesService.getScriptProperties();
  const savedUser = props.getProperty(WEBAPP_USER_PROP);
  const savedPass = props.getProperty(WEBAPP_PASS_PROP);
  if (!savedUser || !savedPass) return { ok: false, error: 'لم يتم تعيين بيانات الدخول بعد.' };
  if (String(user) !== savedUser || String(pass) !== savedPass) {
    return { ok: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
  }
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('tok_' + token, 'admin', 21600);
  return { ok: true, token: token };
}

function webShareLogin_() {
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('tok_' + token, 'share', 21600);
  return { ok: true, token: token };
}

function webAuthedPayload_(token) {
  const role = CacheService.getScriptCache().get('tok_' + token);
  if (!role) return { ok: false, code: 401, error: 'Unauthorized' };
  const students = buildStudentsJson_();
  const donations = buildDonationsJson_();
  return {
    ok: true,
    students: role === 'share' ? redactStudents_(students) : students,
    donations: role === 'share' ? redactDonations_(donations) : donations,
    generated: formatNow_(),
    source: role === 'share' ? 'live-share' : 'live'
  };
}

function redactStudents_(list) {
  return (list || []).map(s => {
    const c = Object.assign({}, s);
    c.phone = '';
    c.guardianNationalId = '';
    return c;
  });
}
function redactDonations_(list) {
  return (list || []).map(d => {
    const c = Object.assign({}, d);
    c.donorEmail = '';
    c.donorId = '';
    return c;
  });
}

function buildStudentsJson_() {
  const found = findSheetByHeaders_(H);
  if (!found) return [];
  const sh = found.sheet, cols = found.cols;
  const headerRow = found.headerRow;
  const startRow = headerRow + 1;
  const lastRow = sh.getLastRow();
  if (lastRow < startRow) return [];

  const headerVals = sh.getRange(headerRow, 1, 1, sh.getLastColumn()).getValues()[0].map(v => String(v).trim());
  const extra = {};
  Object.keys(DASHBOARD_SUPPLEMENT_HEADERS).forEach(key => {
    const idx = headerVals.indexOf(DASHBOARD_SUPPLEMENT_HEADERS[key]);
    if (idx !== -1) extra[key] = idx + 1;
  });

  const numRows = lastRow - startRow + 1;
  const vals = sh.getRange(startRow, 1, numRows, sh.getLastColumn()).getValues();
  const donationCounts = getDonationCountsByBox_();
  const out = [];

  vals.forEach(row => {
    const box = normalize_(row[cols.BOX - 1]);
    const name = normalize_(row[cols.NAME - 1]);
    if (!box || !name) return;
    const birth = toDateKey_(row[cols.BIRTH - 1]);
    const boxStatus = String(row[cols.BOX_STATUS - 1] || '').trim();
    const isActive = boxStatus === 'نشط';
    const sponsorName = String(row[cols.SPONSOR_NAME - 1] || '').trim();
    const legalStatus = extra.LEGAL_STATUS ? String(row[extra.LEGAL_STATUS - 1] || '').trim() : '';
    const firstDate = toDateKey_(row[cols.FIRST_SPONSOR_DATE - 1]);
    const lastDate = toDateKey_(row[cols.LAST_SPONSOR_DATE - 1]);
    const coord = coordForBox_(box);

    out.push({
      box: box,
      name: name,
      motherName: extra.MOTHER ? String(row[extra.MOTHER - 1] || '').trim() : '',
      gender: extra.GENDER ? String(row[extra.GENDER - 1] || '').trim() : '',
      birthdate: birth,
      age: birth ? ageFromBirth_(birth) : '',
      city: 'إدلب',
      displaced: deriveDisplaced_(legalStatus),
      healthStatus: extra.HEALTH ? String(row[extra.HEALTH - 1] || '').trim() : '',
      grade: extra.GRADE ? String(row[extra.GRADE - 1] || '').trim() : '',
      cohort: extra.COHORT ? String(row[extra.COHORT - 1] || '').trim() : '',
      legalStatus: legalStatus,
      sponsored: !!sponsorName,
      sponsorName: sponsorName,
      isActive: isActive,
      platformStatus: boxStatus,
      sponsorStart: firstDate,
      stopDate: (!isActive ? lastDate : ''),
      boxLink: cols.BOX_LINK ? String(row[cols.BOX_LINK - 1] || '').trim() : '',
      monthlyAmount: num_(row[cols.MONTHLY_AMOUNT - 1]),
      totalIn: num_(row[cols.TOTAL_IN - 1]),
      totalPaid: num_(row[cols.TOTAL_PAID - 1]),
      remainingBalance: num_(row[cols.REMAINING - 1]),
      progressPct: num_(row[cols.PROGRESS - 1]),
      donationsCount: donationCounts[box] || 0,
      lastSync: String(row[cols.LAST_SYNC - 1] || ''),
      lat: coord[0],
      lng: coord[1]
    });
  });
  return out;
}

function deriveDisplaced_(legalStatus) {
  const s = String(legalStatus || '');
  if (s.indexOf('نازح') !== -1) return 'نازح';
  if (s.indexOf('مقيم') !== -1 || s.indexOf('مجتمع مضيف') !== -1) return 'مقيم';
  return '';
}

function ageFromBirth_(birthDateStr) {
  const d = new Date(birthDateStr);
  if (isNaN(d)) return '';
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

function coordForBox_(box) {
  const s = String(box);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const a = (h % 1000) / 1000, b = ((h >>> 8) % 1000) / 1000;
  return [IDLIB_COORD_[0] + (a - 0.5) * 0.06, IDLIB_COORD_[1] + (b - 0.5) * 0.06];
}

function buildDonationsJson_() {
  const found = findSheetByHeaders_(LEDGER_H) || ensureLedgerSheet_();
  if (!found) return [];
  const sh = found.sheet, lc = found.cols;
  const startRow = found.headerRow + 1;
  const lastRow = sh.getLastRow();
  if (lastRow < startRow) return [];
  const vals = sh.getRange(startRow, 1, lastRow - startRow + 1, sh.getLastColumn()).getValues();
  return vals
    .map(r => ({
      box: normalize_(r[lc.BOX - 1]),
      name: String(r[lc.NAME - 1] || '').trim(),
      paymentId: String(r[lc.PAYMENT_ID - 1] || '').trim(),
      date: toDateKey_(r[lc.DATE - 1]),
      amount: num_(r[lc.AMOUNT - 1]),
      netAmount: num_(r[lc.NET_AMOUNT - 1]),
      donorId: r[lc.DONOR_ID - 1] || '',
      donorName: String(r[lc.DONOR_NAME - 1] || '').trim(),
      donorEmail: String(r[lc.DONOR_EMAIL - 1] || '').trim()
    }))
    .filter(d => d.box);
}

function getDonationCountsByBox_() {
  const found = findSheetByHeaders_(LEDGER_H);
  const counts = {};
  if (!found) return counts;
  const sh = found.sheet, lc = found.cols;
  const startRow = found.headerRow + 1;
  const lastRow = sh.getLastRow();
  if (lastRow < startRow) return counts;
  sh.getRange(startRow, lc.BOX, lastRow - startRow + 1, 1).getValues().forEach(r => {
    const box = normalize_(r[0]);
    if (box) counts[box] = (counts[box] || 0) + 1;
  });
  return counts;
}
