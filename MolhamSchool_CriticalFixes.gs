/**
 * إصلاحات حرجة لسكربت مدرسة ملهم (الملف الجديد) + تنظيف سجل التبرعات.
 *
 * الصق هذا الملف في مشروع Apps Script للملف الجديد بعد الكود الموحّد،
 * أو استبدلي الدوال المذكورة يدويًا إن وُجدت بنفس الاسم.
 *
 * من قائمة الشيت بعد اللصق:
 *   🧹 تنظيف سجل التبرعات من المكررات (مرة واحدة)
 */

// ---------- 1) اسم المدرسة من كائن school وليس [object Object] ----------
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

// ---------- 2) إيجاد سجل التبرعات بالاسم أولاً (يتجنب إنشاء ورقة ثانية فارغة) ----------
function ensureLedgerSheet_() {
  var ss = SpreadsheetApp.getActive();
  var byName = ss.getSheetByName('سجل التبرعات');
  if (byName) {
    var mapped = mapLedgerColsFromSheet_(byName);
    if (mapped) return mapped;
  }
  var found = findSheetByHeaders_(LEDGER_H);
  if (found) return found;

  var sh = ss.insertSheet('سجل التبرعات');
  var headers = ['رقم الصندوق', 'اسم الطالب', 'معرف الدفعة', 'التاريخ', 'المبلغ $', 'صافي المبلغ $', 'معرف المتبرع', 'اسم المتبرع', 'بريد المتبرع'];
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sh.setFrozenRows(1);
  var cols = {};
  headers.forEach(function (h, i) {
    var key = Object.keys(LEDGER_H).find(function (k) { return LEDGER_H[k] === h; });
    if (key) cols[key] = i + 1;
  });
  return { sheet: sh, headerRow: 1, cols: cols };
}

function mapLedgerColsFromSheet_(sh) {
  var maxRow = Math.min(HEADER_SEARCH_ROWS, Math.max(1, sh.getLastRow()));
  var maxCol = Math.max(1, sh.getLastColumn());
  var values = sh.getRange(1, 1, maxRow, maxCol).getValues();
  for (var r = 0; r < values.length; r++) {
    var row = values[r].map(function (v) { return String(v).trim(); });
    var cols = {};
    var allFound = true;
    for (var key in LEDGER_H) {
      var idx = row.indexOf(LEDGER_H[key]);
      if (idx === -1) { allFound = false; break; }
      cols[key] = idx + 1;
    }
    if (allFound) return { sheet: sh, headerRow: r + 1, cols: cols };
  }
  return null;
}

/**
 * تنظيف مرة واحدة: يبقي أول ظهور لكل معرف دفعة WS-xxx ويحذف الباقي.
 * يعمل على ورقة «سجل التبرعات» فقط. لا يلمس بيانات الطلاب.
 */
function dedupeDonationsLedgerOnce() {
  var ui = safeUi_();
  var found = ensureLedgerSheet_();
  if (!found) {
    if (ui) ui.alert('لم أجد ورقة سجل التبرعات.');
    return;
  }
  var sh = found.sheet;
  var lc = found.cols;
  var start = found.headerRow + 1;
  var last = sh.getLastRow();
  if (last < start) {
    if (ui) ui.alert('سجل التبرعات فارغ.');
    return;
  }

  var width = Math.max(sh.getLastColumn(), 9);
  var vals = sh.getRange(start, 1, last - start + 1, width).getValues();
  var seen = {};
  var kept = [];
  var removed = 0;
  var emptyId = 0;

  vals.forEach(function (r) {
    var id = String(r[lc.PAYMENT_ID - 1] || '').trim();
    if (!id) {
      // صف بلا معرف: نُبقي مرة واحدة بمفتاح مركب حتى لا نخسر بيانات يدوية نادرة
      var fallback = [r[lc.BOX - 1], r[lc.DATE - 1], r[lc.AMOUNT - 1], r[lc.DONOR_ID - 1]].join('|');
      if (seen['_' + fallback]) { removed++; return; }
      seen['_' + fallback] = true;
      emptyId++;
      kept.push(r);
      return;
    }
    if (seen[id]) { removed++; return; }
    seen[id] = true;
    kept.push(r);
  });

  // مسح البيانات القديمة وإعادة الكتابة مرة واحدة (آمن أسرع من حذف صفوف مبعثرة)
  if (last >= start) sh.getRange(start, 1, last - start + 1, width).clearContent();
  if (kept.length) sh.getRange(start, 1, kept.length, width).setValues(kept);

  var msg = 'تنظيف سجل التبرعات ✅\n\n' +
    'قبل: ' + vals.length + ' صف\n' +
    'بعد: ' + kept.length + ' صف\n' +
    'حُذف مكرر: ' + removed + '\n' +
    (emptyId ? ('صفوف بلا معرف دفعة أُبقيت بحذر: ' + emptyId + '\n') : '') +
    '\nبعدها شغّلي «تحديث وجلب البيانات» مرة واحدة فقط إن لزم، ولا تعيدي تشغيل سحب الدفعات يدويًا مرات كثيرة.';
  Logger.log(msg);
  if (ui) ui.alert(msg);
}

/** قائمة مختصرة تُضاف فوق القائمة الحالية */
function onOpenDedupeMenu_() {
  var ui = safeUi_();
  if (!ui) return;
  ui.createMenu('🧹 صيانة السجل')
    .addItem('تنظيف سجل التبرعات من المكررات (مرة واحدة)', 'dedupeDonationsLedgerOnce')
    .addToUi();
}

// دمج مع onOpen الأصلي: استدعي هذا من نهاية onOpen() عندك:
//   onOpenDedupeMenu_();
