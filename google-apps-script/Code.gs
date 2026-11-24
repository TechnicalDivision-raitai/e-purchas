/**
 * Google Apps Script Backend
 * ระบบงานจัดซื้อจัดจ้าง • กองช่าง อบต.ไร่ใต้
 * รองรับ:
 * 1) ระบบจัดซื้อจัดจ้าง: fetch, sync (_DATA_PROJECTS_JSON / _DATA_WORKFLOW_JSON / _DATA_BUDGET_POOLS_JSON / _DATA_EXPENSE_CATEGORIES_JSON), uploadFile
 * 2) รับข้อมูลเชื่อมโยงจากระบบสารบรรณ (SarabanProcurementQueue):
 *    - GET  ?action=getProcurementOptions&fiscalYear=all
 *    - POST action="pushProcurementQueue" (Content-Type: text/plain;charset=utf-8)
 *    - GET  ?action=getProcurementQueue&queueStatus=all&t=...
 *    - POST action="reviewProcurementQueue" (approved / rejected สำหรับ 2-Way Sync)
 *    - POST action="deleteProcurementQueue" (ลบคิวได้ทุกสถานะ)
 */

const DEFAULT_SPREADSHEET_ID = '19oCgv21-WkPLYthCdqUNFmqaPCeh2G5Dfuo10lcYuZw';
const DEFAULT_SHEET_NAME = 'ทะเบียนจัดซื้อจัดจ้าง';
const BUDGET_POOLS_SUMMARY_SHEET = 'BUDGET DATA';
const BUDGET_TRANSFERS_SUMMARY_SHEET = 'ประวัติโอนงบประมาณ';
const RAW_PROJECTS_SHEET = '_DATA_PROJECTS_JSON';
const RAW_WORKFLOW_SHEET = '_DATA_WORKFLOW_JSON';
const RAW_BUDGET_POOLS_SHEET = '_DATA_BUDGET_POOLS_JSON';
const RAW_BUDGET_TRANSFERS_SHEET = '_DATA_BUDGET_TRANSFERS_JSON';
const RAW_EXPENSE_CATEGORIES_SHEET = '_DATA_EXPENSE_CATEGORIES_JSON';
const DEFAULT_DRIVE_FOLDER_ID = '1wyP35kgPzxgKWJN8nggjc4b6QIfsvcNN';
const DEFAULT_DRIVE_FOLDER_NAME = 'เอกสารแนบ';
const CHUNK_SIZE = 40000; // ป้องกันเกินลิมิต 50,000 ตัวอักษร/เซลล์ ของ Google Sheet

function getSpreadsheet_() {
  return (
    SpreadsheetApp.getActiveSpreadsheet() ||
    SpreadsheetApp.openById(DEFAULT_SPREADSHEET_ID)
  );
}

const QUEUE_SHEET_NAME = 'SarabanProcurementQueue';

const ALLOWED_DOC_CATEGORIES = [
  'general_approval',
  'tor_order',
  'tor_approval',
  'ref_price',
  'disbursement',
];

const QUEUE_HEADERS = [
  'queueId',
  'idempotencyKey',
  'procurementId',
  'projectCode',
  'fiscalYear',
  'docCategory',
  'bookNo',
  'bookDate',
  'subject',
  'payloadJson',
  'attachmentJson',
  'queueStatus',
  'reviewedBy',
  'reviewedAt',
  'rejectReason',
  'createdAt',
  'submittedBy',
];

const STATUS_TO_CODE = {
  'รอขออนุมัติโครงการ': 'waiting_project_approval',
  'รอจัดทำTOR และราคากลาง': 'tor_preparation',
  'อยู่ระหว่างสั่งซื้อสั่งจ้าง': 'ordering',
  'รอดำเนินการ': 'pending',
  'กำลังดำเนินการ': 'in_progress',
  'รออนุมัติ': 'pending_approval',
  'ส่งกลับแก้ไข': 'revision',
  'พักงาน': 'suspended',
  'เสร็จสิ้น': 'completed',
  'ยกเลิก': 'cancelled',
};

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    const action = String(params.action || 'fetch').trim();

    if (action === 'fetch') {
      const ss = getSpreadsheet_();
      const rows = readChunkedJsonList_(ss, RAW_PROJECTS_SHEET);
      const steps = readChunkedSingleJson_(ss, RAW_WORKFLOW_SHEET);
      const budgetPools = readChunkedJsonList_(ss, RAW_BUDGET_POOLS_SHEET);
      const budgetTransfers = readChunkedJsonList_(
        ss,
        RAW_BUDGET_TRANSFERS_SHEET,
      );
      const expenseCategories = readChunkedSingleJson_(
        ss,
        RAW_EXPENSE_CATEGORIES_SHEET,
      );

      return jsonResponse_({
        status: 'ok',
        success: true,
        rows: rows || [],
        projects: rows || [],
        steps: Array.isArray(steps) && steps.length > 0 ? steps : undefined,
        budgetPools: Array.isArray(budgetPools) ? budgetPools : [],
        budgetTransfers: Array.isArray(budgetTransfers) ? budgetTransfers : [],
        expenseCategories:
          Array.isArray(expenseCategories) && expenseCategories.length > 0
            ? expenseCategories
            : undefined,
      });
    }

    if (action === 'getProcurementOptions') {
      return jsonResponse_(handleGetProcurementOptions_(params.fiscalYear || 'all'));
    }

    if (action === 'getProcurementQueue') {
      return jsonResponse_(handleGetProcurementQueue_(params.queueStatus || 'all'));
    }

    return jsonResponse_({
      status: 'error',
      success: false,
      error: 'ไม่รองรับ action: ' + action,
    });
  } catch (err) {
    return jsonResponse_({
      status: 'error',
      success: false,
      error: err && err.message ? err.message : String(err),
      message: err && err.message ? err.message : String(err),
    });
  }
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const body = JSON.parse(raw);
    const action = String(body.action || '').trim();

    if (action === 'sync') {
      return jsonResponse_(handleSyncProjects_(body));
    }
    if (action === 'uploadFile') {
      return jsonResponse_(handleUploadFile_(body));
    }
    if (action === 'pushProcurementQueue') {
      return jsonResponse_(handlePushProcurementQueue_(body));
    }
    if (action === 'reviewProcurementQueue') {
      return jsonResponse_(handleReviewProcurementQueue_(body));
    }
    if (action === 'deleteProcurementQueue') {
      return jsonResponse_(handleDeleteProcurementQueue_(body));
    }

    return jsonResponse_({
      status: 'error',
      success: false,
      error: 'ไม่รองรับ action: ' + action,
      message: 'ไม่รองรับ action: ' + action,
    });
  } catch (err) {
    return jsonResponse_({
      status: 'error',
      success: false,
      error: err && err.message ? err.message : String(err),
      message: err && err.message ? err.message : String(err),
    });
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function formatIsoDate_(value) {
  if (!value && value !== 0) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, 'Asia/Bangkok', 'yyyy-MM-dd');
  }
  const s = String(value).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, 'Asia/Bangkok', 'yyyy-MM-dd');
  }
  return s;
}

function formatIsoTimestamp_(value) {
  if (!value && value !== 0) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return value.toISOString();
  }
  return String(value).trim();
}

/* ============================================================================
 * 1) อ่าน/เขียนข้อมูลโครงการและ Workflow ในชีตเดิม (_DATA_PROJECTS_JSON / _DATA_WORKFLOW_JSON)
 * ========================================================================== */

function parseJsonSafe_(str) {
  if (!str || typeof str !== 'string') return null;
  const trimmed = str.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (_e) {
    return null;
  }
}

function extractProjectsFromParsed_(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.rows)) return parsed.rows;
    if (Array.isArray(parsed.projects)) return parsed.projects;
    if (parsed.id || parsed.code || parsed.title) return [parsed];
  }
  return null;
}

function isHeaderRow_(row) {
  if (!row || !row.length) return false;
  for (let c = 0; c < row.length; c++) {
    const s = String(row[c] === null || row[c] === undefined ? '' : row[c]).trim();
    if (s && (s[0] === '{' || s[0] === '[')) {
      return false;
    }
  }
  const first = String(row[0] === null || row[0] === undefined ? '' : row[0]).trim();
  return Boolean(first);
}

function rowPayloadText_(row) {
  if (!row || !row.length) return '';
  if (row.length >= 2) {
    const c0 = String(row[0] === null || row[0] === undefined ? '' : row[0]).trim();
    const c1 = String(row[1] === null || row[1] === undefined ? '' : row[1]).trim();
    const looksLikeIndex =
      typeof row[0] === 'number' || /^\d+$/.test(c0) || /^chunk[_-]?\d+$/i.test(c0);
    if (looksLikeIndex && (c1 || row.length >= 2)) {
      return row
        .slice(1)
        .map(function (cell) {
          return cell !== null && cell !== undefined ? String(cell) : '';
        })
        .join('');
    }
  }
  return row
    .map(function (cell) {
      return cell !== null && cell !== undefined ? String(cell) : '';
    })
    .join('');
}

function readChunkedSingleJson_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    return null;
  }
  const values = sheet.getDataRange().getValues();
  if (!values.length) return null;

  const dataRows = values.length > 1 && isHeaderRow_(values[0]) ? values.slice(1) : values;

  let joined = '';
  for (let r = 0; r < dataRows.length; r++) {
    joined += rowPayloadText_(dataRows[r]);
  }
  const parsed = parseJsonSafe_(joined);
  if (parsed !== null) return parsed;

  // Fallback กรณีไม่ตัด header หรือไม่ตัดคอลัมน์ index
  let rawJoined = '';
  for (let r = 0; r < values.length; r++) {
    for (let c = 0; c < values[r].length; c++) {
      if (values[r][c] !== '' && values[r][c] !== null && values[r][c] !== undefined) {
        rawJoined += String(values[r][c]);
      }
    }
  }
  return parseJsonSafe_(rawJoined);
}

function readChunkedJsonList_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    return [];
  }
  const values = sheet.getDataRange().getValues();
  if (!values.length) return [];

  // 1) ลองอ่านแบบ single JSON array หรือ { rows/projects: [...] } ที่แบ่ง chunk
  const single = readChunkedSingleJson_(ss, sheetName);
  const extractedSingle = extractProjectsFromParsed_(single);
  if (Array.isArray(extractedSingle) && extractedSingle.length > 0) {
    return extractedSingle;
  }

  const dataRows = values.length > 1 && isHeaderRow_(values[0]) ? values.slice(1) : values;

  // 2) ลองอ่านแบบ 1 แถวต่อ 1 โครงการ (รองรับทั้งไม่มี index และมี col 0..k เป็น id/index ก่อนหน้า '{')
  const rowItems = [];
  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r];
    let parsedObj = null;

    // 2a) รวมทั้งแถว
    const fullStr = row
      .map(function (cell) {
        return cell !== null && cell !== undefined ? String(cell) : '';
      })
      .join('')
      .trim();
    if (fullStr && fullStr[0] === '{') {
      parsedObj = parseJsonSafe_(fullStr);
    }

    // 2b) หาคอลัมน์แรกที่ขึ้นต้นด้วย '{' แล้วรวมตั้งแต่คอลัมน์นั้นจนจบแถว (เช่น [id, json] หรือ [id, chunk0, chunk1])
    if (!parsedObj) {
      for (let c = 0; c < row.length; c++) {
        const cellStr = String(
          row[c] === null || row[c] === undefined ? '' : row[c],
        ).trim();
        if (cellStr && cellStr[0] === '{') {
          const fromJsonCol = row
            .slice(c)
            .map(function (cell) {
              return cell !== null && cell !== undefined ? String(cell) : '';
            })
            .join('')
            .trim();
          parsedObj = parseJsonSafe_(fromJsonCol);
          if (parsedObj) break;
        }
      }
    }

    if (parsedObj && typeof parsedObj === 'object' && !Array.isArray(parsedObj)) {
      rowItems.push(parsedObj);
    }
  }
  if (rowItems.length > 0) {
    return rowItems;
  }

  // 3) ลองอ่านแบบแบ่งหลายแถวต่อ 1 โครงการ โดยจัดกลุ่มตาม col 0 เช่น [projectId/rowIdx, chunkIdx, jsonChunk]
  const groupOrder = [];
  const groups = {};
  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r];
    if (row.length < 2) continue;
    const key = String(row[0] === null || row[0] === undefined ? '' : row[0]).trim();
    if (!key) continue;

    let chunkIdx = r;
    let textStartCol = 1;
    const c1Str = String(row[1] === null || row[1] === undefined ? '' : row[1]).trim();
    if (row.length >= 3 && (typeof row[1] === 'number' || /^\d+$/.test(c1Str))) {
      chunkIdx = Number(c1Str);
      textStartCol = 2;
    }

    const text = row
      .slice(textStartCol)
      .map(function (cell) {
        return cell !== null && cell !== undefined ? String(cell) : '';
      })
      .join('');

    if (!groups[key]) {
      groups[key] = [];
      groupOrder.push(key);
    }
    groups[key].push({ chunkIdx: chunkIdx, text: text });
  }

  const groupedItems = [];
  for (let i = 0; i < groupOrder.length; i++) {
    const chunks = groups[groupOrder[i]];
    chunks.sort(function (a, b) {
      return a.chunkIdx - b.chunkIdx;
    });
    const combined = chunks
      .map(function (ch) {
        return ch.text;
      })
      .join('')
      .trim();
    const parsed = parseJsonSafe_(combined);
    const extracted = extractProjectsFromParsed_(parsed);
    if (extracted && extracted.length > 0) {
      for (let j = 0; j < extracted.length; j++) {
        if (extracted[j] && typeof extracted[j] === 'object') {
          groupedItems.push(extracted[j]);
        }
      }
    }
  }
  if (groupedItems.length > 0) {
    return groupedItems;
  }

  // 4) Fallback สุดท้าย: กรณีแต่ละแถวเป็น JSON object ที่ไม่มี comma คั่นเมื่อต่อกัน
  let concat = '';
  for (let r = 0; r < dataRows.length; r++) {
    concat += rowPayloadText_(dataRows[r]);
  }
  concat = concat.trim();
  if (concat && concat[0] === '{') {
    const wrapped = parseJsonSafe_('[' + concat.replace(/\}\s*\{/g, '},{') + ']');
    if (Array.isArray(wrapped) && wrapped.length > 0) {
      return wrapped;
    }
  }

  // ถ้า single เป็น array ว่างจริงๆ ให้คืน []
  if (Array.isArray(single)) return single;
  return [];
}

function writeChunkedSingleJson_(ss, sheetName, data) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.hideSheet();
  }
  sheet.clearContents();
  const raw = JSON.stringify(data);
  const rows = [];
  for (let i = 0; i < raw.length; i += CHUNK_SIZE) {
    rows.push([raw.slice(i, i + CHUNK_SIZE)]);
  }
  if (rows.length > 0) {
    sheet.getRange(1, 1, rows.length, 1).setValues(rows);
  }
}

function writeChunkedJsonList_(ss, sheetName, list) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.hideSheet();
  }
  sheet.clearContents();
  if (!Array.isArray(list) || list.length === 0) {
    sheet.getRange(1, 1).setValue('[]');
    return;
  }
  const rows = list.map(function (item) {
    const str = JSON.stringify(item);
    const chunks = [];
    for (let i = 0; i < str.length; i += CHUNK_SIZE) {
      chunks.push(str.slice(i, i + CHUNK_SIZE));
    }
    return chunks;
  });
  const maxCols = rows.reduce(function (m, r) {
    return Math.max(m, r.length);
  }, 1);
  const padded = rows.map(function (r) {
    while (r.length < maxCols) r.push('');
    return r;
  });
  sheet.getRange(1, 1, padded.length, maxCols).setValues(padded);
}

function handleSyncProjects_(body) {
  const ss = getSpreadsheet_();
  const sheetName = String(body.sheetName || DEFAULT_SHEET_NAME).trim();
  const rows = Array.isArray(body.rows)
    ? body.rows
    : Array.isArray(body.projects)
      ? body.projects
      : [];
  const steps = Array.isArray(body.steps) ? body.steps : [];
  const hasBudgetPools = Array.isArray(body.budgetPools);
  const budgetPools = hasBudgetPools ? body.budgetPools : [];
  const hasBudgetTransfers = Array.isArray(body.budgetTransfers);
  const budgetTransfers = hasBudgetTransfers ? body.budgetTransfers : [];
  const hasExpenseCategories =
    Array.isArray(body.expenseCategories) && body.expenseCategories.length > 0;

  writeChunkedJsonList_(ss, RAW_PROJECTS_SHEET, rows);
  if (steps.length > 0) {
    writeChunkedSingleJson_(ss, RAW_WORKFLOW_SHEET, steps);
  }
  if (hasExpenseCategories) {
    writeChunkedSingleJson_(
      ss,
      RAW_EXPENSE_CATEGORIES_SHEET,
      body.expenseCategories,
    );
  }
  if (hasBudgetPools) {
    writeChunkedJsonList_(ss, RAW_BUDGET_POOLS_SHEET, budgetPools);
    let poolSheet =
      ss.getSheetByName(BUDGET_POOLS_SUMMARY_SHEET) ||
      ss.getSheetByName('BUDGET  DATA');
    if (!poolSheet) {
      poolSheet = ss.insertSheet(BUDGET_POOLS_SUMMARY_SHEET);
    }
    poolSheet.clearContents();
    const poolSummaryRows = [
      [
        'id',
        'ปีงบประมาณ',
        'รหัสหมวด',
        '1. แผนงาน',
        '2. งาน',
        '3. งบ',
        '4. รายจ่าย',
        '5. ประเภทรายจ่าย',
        'ชื่อหมวดวงเงิน',
        'แหล่งงบประมาณ',
        'หน่วยงาน',
        'วงเงินตั้งไว้ (บาท)',
        'หมายเหตุ',
      ],
    ];
    budgetPools.forEach(function (p) {
      poolSummaryRows.push([
        String(p.id || ''),
        Number(p.year || 0),
        String(p.code || ''),
        String(p.planName || ''),
        String(p.workName || ''),
        String(p.budgetType || ''),
        String(p.expenseCategory || ''),
        String(p.expenseSubCategory || ''),
        String(p.name || ''),
        String(p.fund || ''),
        String(p.department || ''),
        Number(p.allocatedBudget || 0),
        String(p.notes || ''),
      ]);
    });
    poolSheet
      .getRange(1, 1, poolSummaryRows.length, poolSummaryRows[0].length)
      .setValues(poolSummaryRows);
  }

  if (hasBudgetTransfers) {
    writeChunkedJsonList_(ss, RAW_BUDGET_TRANSFERS_SHEET, budgetTransfers);
    let transferSheet = ss.getSheetByName(BUDGET_TRANSFERS_SUMMARY_SHEET);
    if (!transferSheet) {
      transferSheet = ss.insertSheet(BUDGET_TRANSFERS_SUMMARY_SHEET);
    }
    transferSheet.clearContents();
    const transferRows = [
      [
        'id',
        'ปีงบประมาณ',
        'วันที่โอน',
        'เลขที่เอกสาร',
        'ประเภทการโอน',
        'ต้นทาง',
        'ปลายทาง',
        'จำนวนเงิน (บาท)',
        'เหตุผล',
        'ผู้บันทึก',
      ],
    ];
    budgetTransfers.forEach(function (t) {
      const typeLabel =
        t.transferType === 'from_external' ? 'โอนเข้าจากงบอื่น' : 'โอนระหว่างหมวด';
      const sourceLabel =
        t.transferType === 'from_external'
          ? String(t.externalSource || '')
          : String(t.fromPoolName || '');
      transferRows.push([
        String(t.id || ''),
        Number(t.year || 0),
        String(t.transferDate || ''),
        String(t.docNo || ''),
        typeLabel,
        sourceLabel,
        String(t.toPoolName || ''),
        Number(t.amount || 0),
        String(t.reason || ''),
        String(t.createdBy || ''),
      ]);
    });
    transferSheet
      .getRange(1, 1, transferRows.length, transferRows[0].length)
      .setValues(transferRows);
  }

  // อัปเดตชีตสรุป 'ทะเบียนจัดซื้อจัดจ้าง' ให้อ่านง่ายใน Google Sheet
  let mainSheet = ss.getSheetByName(sheetName);
  if (!mainSheet) {
    mainSheet = ss.insertSheet(sheetName);
  }
  mainSheet.clearContents();
  const summaryRows = [
    [
      'id',
      'เลขทะเบียน',
      'ปีงบประมาณ',
      'ชื่อโครงการ',
      'หมวด BUDGET DATA',
      'แผนงาน',
      'งาน',
      'งบ',
      'รายจ่าย',
      'ประเภทรายจ่าย',
      'สถานะ',
      'วิธีจัดซื้อจัดจ้าง',
      'ราคากลาง / งบอ้างอิง',
      'วงเงินตกลง',
      'ผู้ขาย / ผู้รับจ้าง',
      'ผู้รับผิดชอบ',
    ],
  ];
  const poolLookup = {};
  (hasBudgetPools ? budgetPools : readChunkedJsonList_(ss, RAW_BUDGET_POOLS_SHEET)).forEach(
    function (p) {
      if (p && p.id) poolLookup[String(p.id)] = p;
    },
  );
  rows.forEach(function (r) {
    const linkedPool = r.budgetPoolId ? poolLookup[String(r.budgetPoolId)] : null;
    const poolName = String((linkedPool && linkedPool.name) || '');
    const planName = String(
      r.planName || (linkedPool && linkedPool.planName) || '',
    );
    const workName = String(
      r.workName || (linkedPool && linkedPool.workName) || '',
    );
    const budgetType = String(
      r.budgetType || (linkedPool && linkedPool.budgetType) || '',
    );
    const expCat = String(
      r.expenseCategory || (linkedPool && linkedPool.expenseCategory) || '',
    );
    const expSub = String(
      r.expenseSubCategory || (linkedPool && linkedPool.expenseSubCategory) || '',
    );
    const displayBudget =
      Number(r.budget || 0) > 0
        ? Number(r.budget || 0)
        : Number(r.reference || 0);
    summaryRows.push([
      String(r.id || ''),
      String(r.code || ''),
      Number(r.year || 0),
      String(r.title || ''),
      poolName,
      planName,
      workName,
      budgetType,
      expCat,
      expSub,
      String(r.status || ''),
      String(r.method || ''),
      displayBudget,
      Number(r.agreed || 0),
      String(r.vendor || ''),
      String(r.responsibleName || ''),
    ]);
  });
  mainSheet.getRange(1, 1, summaryRows.length, summaryRows[0].length).setValues(summaryRows);

  return {
    status: 'ok',
    success: true,
    count: rows.length,
    syncedAt: new Date().toISOString(),
  };
}

function ensureViewSharing_(driveResource) {
  if (!driveResource) return false;
  try {
    driveResource.setSharing(
      DriveApp.Access.ANYONE_WITH_LINK,
      DriveApp.Permission.VIEW,
    );
    return true;
  } catch (err) {
    // กรณีบัญชีองค์กร (Google Workspace) จำกัดไม่ให้แชร์สาธารณะ ให้ลองแชร์ภายในองค์กรแทน
    try {
      driveResource.setSharing(
        DriveApp.Access.DOMAIN_WITH_LINK,
        DriveApp.Permission.VIEW,
      );
      return true;
    } catch (_innerErr) {
      return false;
    }
  }
}

function getOrCreateDriveFolder_(folderId) {
  const resolvedFolderId = String(folderId || DEFAULT_DRIVE_FOLDER_ID || '').trim();
  let folder;
  if (resolvedFolderId) {
    folder = DriveApp.getFolderById(resolvedFolderId);
  } else {
    const folders = DriveApp.getFoldersByName(DEFAULT_DRIVE_FOLDER_NAME);
    folder = folders.hasNext()
      ? folders.next()
      : DriveApp.createFolder(DEFAULT_DRIVE_FOLDER_NAME);
  }
  ensureViewSharing_(folder);
  return folder;
}

function getOrCreateSubFolder_(parentFolder, folderName) {
  const cleanName = String(folderName || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ');
  if (!cleanName) return parentFolder;

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const existing = parentFolder.getFoldersByName(cleanName);
    const subFolder = existing.hasNext()
      ? existing.next()
      : parentFolder.createFolder(cleanName);
    ensureViewSharing_(subFolder);
    return subFolder;
  } finally {
    lock.releaseLock();
  }
}

function handleUploadFile_(body) {
  const fileName = String(body.fileName || 'attachment.bin');
  const mimeType = String(body.mimeType || 'application/octet-stream');
  const base64Data = String(body.base64Data || '');
  const folderId = String(body.folderId || DEFAULT_DRIVE_FOLDER_ID || '').trim();
  const projectCode = String(body.projectCode || '').trim();

  if (!base64Data) {
    throw new Error('ไม่พบข้อมูลไฟล์สำหรับอัปโหลด');
  }

  const bytes = Utilities.base64Decode(base64Data);
  const blob = Utilities.newBlob(bytes, mimeType, fileName);
  const rootFolder = getOrCreateDriveFolder_(folderId);
  const targetFolder = projectCode
    ? getOrCreateSubFolder_(rootFolder, projectCode)
    : rootFolder;
  const created = targetFolder.createFile(blob);

  // ตั้งค่าสิทธิ์แชร์อัตโนมัติให้ทุกคนที่มีลิงก์สามารถเปิดดูไฟล์ได้ทันที
  ensureViewSharing_(created);

  const fileId = created.getId();
  const shareUrl = 'https://drive.google.com/file/d/' + fileId + '/view?usp=sharing';

  return {
    status: 'ok',
    success: true,
    fileId: fileId,
    folderId: targetFolder.getId(),
    folderName: targetFolder.getName(),
    url: shareUrl,
    webViewLink: shareUrl,
  };
}

/**
 * ฟังก์ชันช่วยปลดล็อกสิทธิ์ไฟล์เดิมทั้งหมดในโฟลเดอร์ "เอกสารแนบ"
 * วิธีใช้: เปิดหน้า Apps Script Editor -> เลือกฟังก์ชัน fixExistingAttachmentPermissions -> กด Run (เรียกใช้)
 */
function fixExistingAttachmentPermissions() {
  const folder = getOrCreateDriveFolder_(DEFAULT_DRIVE_FOLDER_ID);
  let updatedCount = 0;

  function processFolder(currentFolder) {
    ensureViewSharing_(currentFolder);
    const files = currentFolder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      if (ensureViewSharing_(file)) {
        updatedCount += 1;
      }
    }
    const subFolders = currentFolder.getFolders();
    while (subFolders.hasNext()) {
      processFolder(subFolders.next());
    }
  }

  processFolder(folder);
  Logger.log('อัปเดตสิทธิ์การอ่านสำเร็จจำนวน ' + updatedCount + ' ไฟล์');
  return updatedCount;
}

/* ============================================================================
 * 2) Saraban Procurement Sync Queue Endpoints
 * ========================================================================== */

function handleGetProcurementOptions_(fiscalYearParam) {
  const ss = getSpreadsheet_();
  let rows = readChunkedJsonList_(ss, RAW_PROJECTS_SHEET);

  // Fallback อ่านจากชีต 'ทะเบียนจัดซื้อจัดจ้าง' ตามชื่อหัวคอลัมน์จริง หากยังไม่มีข้อมูล JSON
  if (!rows || rows.length === 0) {
    const mainSheet = ss.getSheetByName(DEFAULT_SHEET_NAME);
    if (mainSheet && mainSheet.getLastRow() >= 2) {
      const vals = mainSheet.getDataRange().getValues();
      const headers = vals[0].map(function (h) {
        return String(h || '').trim();
      });
      const findCol = function (names) {
        for (let i = 0; i < headers.length; i++) {
          for (let j = 0; j < names.length; j++) {
            if (headers[i].indexOf(names[j]) !== -1) return i;
          }
        }
        return -1;
      };
      const colId = findCol(['id', 'ID']);
      const colCode = findCol(['เลขทะเบียน', 'รหัสโครงการ', 'code']);
      const colYear = findCol(['ปีงบ', 'year']);
      const colTitle = findCol(['ชื่อโครงการ', 'รายการ', 'title']);
      const colStatus = findCol(['สถานะ', 'status']);
      const colMethod = findCol(['วิธี', 'method']);
      const colBudget = findCol(['ราคากลาง', 'งบประมาณ', 'วงเงินตกลง', 'วงเงิน', 'budget']);

      rows = vals.slice(1).map(function (r, idx) {
        const code = colCode >= 0 ? String(r[colCode] || '') : String(r[0] || '');
        const id = colId >= 0 ? String(r[colId] || code || 'row-' + (idx + 1)) : code || 'row-' + (idx + 1);
        return {
          id: id,
          code: code,
          year: colYear >= 0 ? Number(r[colYear] || 0) : Number(r[1] || 0),
          title: colTitle >= 0 ? String(r[colTitle] || '') : String(r[2] || ''),
          status: colStatus >= 0 ? String(r[colStatus] || '') : '',
          method: colMethod >= 0 ? String(r[colMethod] || '') : '',
          budget: colBudget >= 0 ? Number(r[colBudget] || 0) : 0,
        };
      });
    }
  }

  const poolLookup = {};
  (readChunkedJsonList_(ss, RAW_BUDGET_POOLS_SHEET) || []).forEach(function (p) {
    if (p && p.id) poolLookup[String(p.id)] = p;
  });

  const fyFilter = String(fiscalYearParam || 'all').trim();
  const data = (rows || [])
    .filter(function (r) {
      if (!r || (!r.id && !r.code)) return false;
      if (!fyFilter || fyFilter.toLowerCase() === 'all') return true;
      return String(r.year || '') === fyFilter;
    })
    .map(function (r) {
      const thaiStatus = String(r.status || '');
      const linkedPool = r.budgetPoolId ? poolLookup[String(r.budgetPoolId)] : null;
      const effectiveBudget =
        Number(r.budget || 0) > 0
          ? Number(r.budget || 0)
          : Number(r.agreed || 0) > 0
            ? Number(r.agreed || 0)
            : Number(r.reference || 0);
      return {
        id: String(r.id || ''),
        projectCode: String(r.code || ''),
        fiscalYear: Number(r.year || 0),
        name: String(r.title || ''),
        status: STATUS_TO_CODE[thaiStatus] || thaiStatus,
        statusLabel: thaiStatus,
        method: String(r.method || ''),
        budget: effectiveBudget,
        responsibleName: String(r.responsibleName || ''),
        startDate: String(r.start || ''),
        approvalDocNo: String(
          (r.projectDetails && r.projectDetails.approvalDocNo) || '',
        ),
        budgetPoolId: String(r.budgetPoolId || ''),
        budgetPoolName: String((linkedPool && linkedPool.name) || ''),
        planName: String(r.planName || (linkedPool && linkedPool.planName) || ''),
        workName: String(r.workName || (linkedPool && linkedPool.workName) || ''),
        budgetType: String(r.budgetType || (linkedPool && linkedPool.budgetType) || ''),
        expenseCategory: String(
          r.expenseCategory || (linkedPool && linkedPool.expenseCategory) || '',
        ),
        expenseSubCategory: String(
          r.expenseSubCategory || (linkedPool && linkedPool.expenseSubCategory) || '',
        ),
      };
    });

  return {
    status: 'success',
    data: data,
  };
}

function getOrCreateQueueSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(QUEUE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(QUEUE_SHEET_NAME);
    sheet.getRange(1, 1, 1, QUEUE_HEADERS.length).setValues([QUEUE_HEADERS]);
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, QUEUE_HEADERS.length).setValues([QUEUE_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function rowToQueueItem_(row) {
  let payload = {};
  let attachment = null;
  try {
    payload = row[9] ? JSON.parse(String(row[9])) : {};
  } catch (_e) {
    payload = {};
  }
  try {
    attachment = row[10] ? JSON.parse(String(row[10])) : null;
  } catch (_e) {
    attachment = null;
  }

  return {
    queueId: String(row[0] || ''),
    idempotencyKey: String(row[1] || ''),
    procurementId: String(row[2] || ''),
    projectCode: String(row[3] || ''),
    fiscalYear: Number(row[4] || 0),
    docCategory: String(row[5] || ''),
    bookNo: String(row[6] || ''),
    bookDate: formatIsoDate_(row[7]),
    subject: String(row[8] || ''),
    payload: payload,
    attachment: attachment,
    queueStatus: String(row[11] || 'pending'),
    reviewedBy: String(row[12] || ''),
    reviewedAt: formatIsoTimestamp_(row[13]),
    rejectReason: String(row[14] || ''),
    createdAt: formatIsoTimestamp_(row[15]),
    submittedBy: String(row[16] || ''),
  };
}

function generateQueueId_(sheet) {
  const todayStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd');
  const prefix = 'PQ-' + todayStr + '-';
  let maxSeq = 0;
  if (sheet.getLastRow() >= 2) {
    const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    ids.forEach(function (r) {
      const id = String(r[0] || '');
      if (id.indexOf(prefix) === 0) {
        const seq = Number(id.slice(prefix.length)) || 0;
        if (seq > maxSeq) maxSeq = seq;
      }
    });
  }
  const nextSeq = String(maxSeq + 1).padStart(3, '0');
  return prefix + nextSeq;
}

function handlePushProcurementQueue_(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const docCategory = String(body.docCategory || '').trim();
    if (ALLOWED_DOC_CATEGORIES.indexOf(docCategory) === -1) {
      throw new Error(
        'docCategory ไม่รองรับ (รองรับเฉพาะ general_approval, tor_order, tor_approval, ref_price, disbursement)',
      );
    }

    const sheet = getOrCreateQueueSheet_();
    const idempotencyKey = String(body.idempotencyKey || '').trim();

    if (idempotencyKey && sheet.getLastRow() >= 2) {
      const existingValues = sheet
        .getRange(2, 1, sheet.getLastRow() - 1, QUEUE_HEADERS.length)
        .getValues();
      for (let i = 0; i < existingValues.length; i++) {
        if (String(existingValues[i][1] || '').trim() === idempotencyKey) {
          return {
            status: 'success',
            queueId: String(existingValues[i][0] || ''),
            queueStatus: String(existingValues[i][11] || 'pending'),
            duplicated: true,
          };
        }
      }
    }

    const queueId = generateQueueId_(sheet);
    const createdAt = new Date().toISOString();
    const bookNo = body.bookNo == null ? '' : String(body.bookNo).trim();
    const bookDateIso = body.bookDate ? formatIsoDate_(body.bookDate) : '';
    const subject = body.subject == null ? '' : String(body.subject).trim();
    const safePayload =
      body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
        ? body.payload
        : {};
    const payloadJson = JSON.stringify(safePayload);
    const attachmentJson =
      body.attachment && typeof body.attachment === 'object'
        ? JSON.stringify(body.attachment)
        : '';

    const newRow = [
      queueId,
      idempotencyKey,
      String(body.procurementId || '').trim(),
      String(body.projectCode || '').trim(),
      Number(body.fiscalYear || 0),
      docCategory,
      bookNo,
      bookDateIso,
      subject,
      payloadJson,
      attachmentJson,
      'pending',
      '',
      '',
      '',
      createdAt,
      String(body.submittedBy || '').trim(),
    ];

    const targetRow = sheet.getLastRow() + 1;
    sheet.getRange(targetRow, 1, 1, QUEUE_HEADERS.length).setNumberFormat('@');
    sheet.getRange(targetRow, 1, 1, QUEUE_HEADERS.length).setValues([newRow]);

    return {
      status: 'success',
      queueId: queueId,
      queueStatus: 'pending',
      duplicated: false,
    };
  } finally {
    lock.releaseLock();
  }
}

function handleGetProcurementQueue_(queueStatusParam) {
  const sheet = getOrCreateQueueSheet_();
  const filterStatus = String(queueStatusParam || 'all').trim().toLowerCase();

  if (sheet.getLastRow() < 2) {
    return {
      status: 'success',
      pendingCount: 0,
      data: [],
    };
  }

  const values = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, QUEUE_HEADERS.length)
    .getValues();

  const allItems = values.map(rowToQueueItem_);
  const pendingCount = allItems.filter(function (item) {
    return item.queueStatus === 'pending';
  }).length;

  const filtered = allItems.filter(function (item) {
    if (!filterStatus || filterStatus === 'all') return true;
    return item.queueStatus === filterStatus;
  });

  return {
    status: 'success',
    pendingCount: pendingCount,
    data: filtered,
  };
}

function handleReviewProcurementQueue_(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const queueId = String(body.queueId || '').trim();
    const idempotencyKey = String(body.idempotencyKey || '').trim();
    const nextStatus = String(body.queueStatus || '').trim();

    if (nextStatus !== 'approved' && nextStatus !== 'rejected') {
      throw new Error('queueStatus ต้องเป็น approved หรือ rejected');
    }

    const sheet = getOrCreateQueueSheet_();
    if (sheet.getLastRow() < 2) {
      throw new Error('ไม่พบรายการคิวที่ระบุ');
    }

    const values = sheet
      .getRange(2, 1, sheet.getLastRow() - 1, QUEUE_HEADERS.length)
      .getValues();

    let foundRowIndex = -1;
    for (let i = 0; i < values.length; i++) {
      const rQueueId = String(values[i][0] || '').trim();
      const rIdemp = String(values[i][1] || '').trim();
      if ((queueId && rQueueId === queueId) || (idempotencyKey && rIdemp === idempotencyKey)) {
        foundRowIndex = i + 2;
        break;
      }
    }

    if (foundRowIndex === -1) {
      throw new Error('ไม่พบรายการคิว ' + (queueId || idempotencyKey));
    }

    const reviewedBy = String(body.reviewedBy || '').trim();
    const reviewedAt = body.reviewedAt ? String(body.reviewedAt) : new Date().toISOString();
    const rejectReason = nextStatus === 'rejected' ? String(body.rejectReason || '').trim() : '';

    sheet.getRange(foundRowIndex, 12, 1, 4).setValues([
      [nextStatus, reviewedBy, reviewedAt, rejectReason],
    ]);

    return {
      status: 'success',
      queueId: String(values[foundRowIndex - 2][0] || ''),
      queueStatus: nextStatus,
      reviewedAt: reviewedAt,
    };
  } finally {
    lock.releaseLock();
  }
}

function handleDeleteProcurementQueue_(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const queueId = String(body.queueId || '').trim();
    const idempotencyKey = String(body.idempotencyKey || '').trim();

    if (!queueId && !idempotencyKey) {
      throw new Error('ต้องระบุ queueId หรือ idempotencyKey');
    }

    const sheet = getOrCreateQueueSheet_();
    if (sheet.getLastRow() < 2) {
      return { status: 'success', deleted: false };
    }

    const values = sheet
      .getRange(2, 1, sheet.getLastRow() - 1, 2)
      .getValues();

    let deleted = false;
    for (let i = values.length - 1; i >= 0; i--) {
      const rQueueId = String(values[i][0] || '').trim();
      const rIdemp = String(values[i][1] || '').trim();
      if ((queueId && rQueueId === queueId) || (idempotencyKey && rIdemp === idempotencyKey)) {
        sheet.deleteRow(i + 2);
        deleted = true;
      }
    }

    return {
      status: 'success',
      deleted: deleted,
    };
  } finally {
    lock.releaseLock();
  }
}
