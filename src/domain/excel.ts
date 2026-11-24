import * as XLSX from 'xlsx';
import {
  ATTACHMENT_CATEGORIES,
  BASE64_CHUNK_SIZE,
  DEFAULT_DEPARTMENT,
  FINANCIAL_EXCLUDED_STATUSES,
  MAX_IMPORT_TOTAL_ROWS,
  MAX_PROJECT_ATTACHMENT_BYTES,
} from '../data/constants';
import type {
  AttachmentCategory,
  BudgetPool,
  BudgetTransfer,
  CommitteeRole,
  FinancialSums,
  ImportErrorItem,
  ImportPlan,
  ImportPreviewItem,
  ProjectDetails,
  ProjectRecord,
  ProjectStatus,
  ProjectType,
  WorkflowStep,
} from '../types/procurement';
import { isValidIsoDate } from '../utils/date';
import { normalizeCodeKey, triggerDownloadUrl } from '../utils/format';
import {
  cleanAcceptanceRounds,
  cleanCancelledRounds,
  cleanCommitteeMembers,
  cleanDeliveryRounds,
  cleanInstallmentCount,
  cleanVoucherEntries,
  getAttachmentMeta,
  getEffectiveVoucherEntries,
  getTorPreparedDate,
  getTotalVoucherAmount,
  normalizeLegacyStepId,
  validateProject,
} from './procurement';

export type SheetMatrix = Array<Array<string | number>>;
export type WorkbookTables = Record<string, SheetMatrix>;

export const EXCEL_SCHEMA: Record<string, string[]> = {
  'ข้อมูลทั่วไป': [
    'รหัสโครงการ',
    'ปีงบประมาณ',
    'ชื่อโครงการ',
    'ประเภทงาน',
    'วิธีจัดซื้อจัดจ้าง',
    'แหล่งงบประมาณ',
    'วงเงินงบประมาณ',
    'ผู้รับผิดชอบ',
    'วันที่ขออนุมัติ',
    'รายละเอียดโครงการ',
    'สถานะ',
    'ขั้นตอน',
    'รายจ่าย',
    'ประเภทรายจ่าย',
    'หมวด BUDGET DATA',
    'แผนงาน',
    'งาน',
    'งบ',
  ],
  'TORและราคากลาง': [
    'รหัสโครงการ',
    'เลขที่คำสั่ง',
    'วันที่ออกคำสั่ง',
    'วันที่จัดทำTORและราคากลาง',
    'ราคากลาง',
    'รายละเอียดTOR',
  ],
  'สั่งซื้อสั่งจ้าง': [
    'รหัสโครงการ',
    'เลขที่ใบสั่ง',
    'วันที่ใบสั่ง',
    'ผู้ขายผู้รับจ้าง',
    'วงเงินตกลง',
    'กำหนดส่งมอบ',
    'รายละเอียดสั่งซื้อสั่งจ้าง',
    'จำนวนงวดงาน',
    'งวดงานที่ยกเลิก',
    'เหตุผลยกเลิกงวดงาน',
  ],
  'ตั้งกรรมการตรวจรับ': [
    'รหัสโครงการ',
    'เลขที่คำสั่ง',
    'วันที่ออกคำสั่ง',
    'เลขที่เอกสารตรวจรับเดิม',
  ],
  'ฎีกา': [
    'รหัสโครงการ',
    'เลขที่ฎีกา',
    'วันที่ฎีกา',
    'จำนวนเงินฎีกา',
    'วันที่เบิกจ่าย',
    'รายละเอียดฎีกา',
  ],
  'กรรมการTOR': ['รหัสโครงการ', 'ลำดับ', 'ชื่อกรรมการ', 'ตำแหน่ง', 'หน้าที่'],
  'กรรมการตรวจรับ': ['รหัสโครงการ', 'ลำดับ', 'ชื่อกรรมการ', 'ตำแหน่ง', 'หน้าที่'],
  'การส่งมอบ': ['รหัสโครงการ', 'ลำดับ', 'งวดที่', 'เลขที่หนังสือส่งมอบ', 'วันที่ส่งมอบ', 'รายละเอียด'],
  'ผลตรวจรับ': ['รหัสโครงการ', 'ลำดับ', 'งวดที่', 'วันที่ตรวจรับ', 'ผลตรวจรับ', 'รายละเอียด'],
  'รายการฎีกา': [
    'รหัสโครงการ',
    'ลำดับ',
    'งวดที่',
    'เลขที่ฎีกา',
    'วันที่ฎีกา',
    'จำนวนเงินฎีกา',
    'วันที่เบิกจ่าย',
    'รายละเอียดฎีกา',
  ],
  'ข้อมูลขั้นตอน': [
    'รหัสโครงการ',
    'ขั้นตอน',
    'เลขที่เอกสาร',
    'วันที่เอกสาร',
    'วันเริ่มขั้นตอน',
    'กำหนดเสร็จขั้นตอน',
    'วันเสร็จจริง',
  ],
  'ไฟล์แนบ': [
    'รหัสโครงการ',
    'หมวดไฟล์',
    'รหัสไฟล์',
    'ชื่อไฟล์',
    'ชนิดไฟล์',
    'ลำดับส่วน',
    'ข้อมูลBase64',
  ],
};

export function isFinancialEligible(project: Pick<ProjectRecord, 'status'>): boolean {
  return !FINANCIAL_EXCLUDED_STATUSES.includes(project.status);
}

export function calculateFinancialSums(rows: ProjectRecord[]): FinancialSums {
  const eligible = rows.filter(isFinancialEligible);
  return {
    budget: eligible.reduce((s, r) => s + Number(r.budget || 0), 0),
    reference: eligible.reduce((s, r) => s + Number(r.reference || 0), 0),
    agreed: eligible.reduce((s, r) => s + Number(r.agreed || 0), 0),
    voucher: eligible.reduce((s, r) => s + getTotalVoucherAmount(r.projectDetails), 0),
  };
}

export function buildExcelTables(
  rows: ProjectRecord[],
  budgetPools?: BudgetPool[],
  budgetTransfers?: BudgetTransfer[],
): WorkbookTables {
  const tables: WorkbookTables = Object.fromEntries(
    Object.entries(EXCEL_SCHEMA).map(([sheet, headers]) => [sheet, [[...headers]]]),
  );

  const poolById = new Map<string, BudgetPool>(
    (budgetPools || []).map((p) => [p.id, p]),
  );

  if (Array.isArray(budgetPools) && budgetPools.length > 0) {
    tables['BUDGET DATA'] = [
      [
        'ปีงบประมาณ',
        'รหัสหมวด',
        'แผนงาน',
        'งาน',
        'งบ',
        'รายจ่าย',
        'ประเภทรายจ่าย',
        'ชื่อหมวดวงเงิน',
        'แหล่งงบประมาณ',
        'หน่วยงาน',
        'วงเงินตั้งไว้',
        'จำนวนรายการซื้อ',
        'ตกลงซื้อแล้ว',
        'กันวงเงิน (ราคากลาง)',
        'คงเหลือ',
        'หมายเหตุ',
      ],
    ];
    for (const pool of budgetPools) {
      const linked = rows.filter(
        (r) => r.budgetPoolId === pool.id && isFinancialEligible(r),
      );
      const agreed = linked.reduce((s, r) => s + Math.max(0, Number(r.agreed || 0)), 0);
      const reserved = linked.reduce(
        (s, r) =>
          s + (Number(r.agreed || 0) > 0 ? 0 : Math.max(0, Number(r.reference || 0))),
        0,
      );
      const allocated = Math.max(0, Number(pool.allocatedBudget || 0));
      tables['BUDGET DATA'].push([
        Number(pool.year),
        pool.code || '',
        pool.planName || '',
        pool.workName || '',
        pool.budgetType || '',
        pool.expenseCategory || '',
        pool.expenseSubCategory || '',
        pool.name,
        pool.fund || '',
        pool.department || '',
        allocated,
        linked.length,
        agreed,
        reserved,
        allocated - (agreed + reserved),
        pool.notes || '',
      ]);
    }
  }

  if (Array.isArray(budgetTransfers) && budgetTransfers.length > 0) {
    tables['โอนงบประมาณ'] = [
      [
        'ปีงบประมาณ',
        'วันที่โอน',
        'เลขที่เอกสาร',
        'ประเภทการโอน',
        'ต้นทาง',
        'หมวดงบปลายทาง',
        'จำนวนเงิน (บาท)',
        'เหตุผล',
        'ผู้บันทึก',
      ],
    ];
    for (const t of budgetTransfers) {
      const isExternal = t.transferType === 'from_external';
      const sourcePool = t.fromPoolId ? poolById.get(t.fromPoolId) : undefined;
      const targetPool = poolById.get(t.toPoolId);
      tables['โอนงบประมาณ'].push([
        Number(t.year),
        t.transferDate || '',
        t.docNo || '',
        isExternal ? 'โอนเข้าจากงบอื่นๆ' : 'โอนระหว่างหมวดงบ',
        isExternal
          ? t.externalSource || ''
          : sourcePool?.name || t.fromPoolName || '',
        targetPool?.name || t.toPoolName || '',
        Number(t.amount || 0),
        t.reason || '',
        t.createdBy || '',
      ]);
    }
  }

  for (const r of rows) {
    const code = String(r.code);
    const d = r.projectDetails || {};
    const linkedPool = r.budgetPoolId ? poolById.get(r.budgetPoolId) : undefined;

    tables['ข้อมูลทั่วไป'].push([
      code,
      Number(r.year),
      r.title,
      r.type,
      r.method,
      r.fund || linkedPool?.fund || '',
      Number(r.budget || 0),
      r.responsibleName || '',
      r.start,
      r.notes,
      r.status,
      r.step,
      r.expenseCategory || linkedPool?.expenseCategory || '',
      r.expenseSubCategory || linkedPool?.expenseSubCategory || '',
      linkedPool?.name || '',
      r.planName || linkedPool?.planName || '',
      r.workName || linkedPool?.workName || '',
      r.budgetType || linkedPool?.budgetType || '',
    ]);

    tables['TORและราคากลาง'].push([
      code,
      d.torOrderNo || '',
      d.torOrderDate || '',
      getTorPreparedDate(d),
      Number(r.reference) || 0,
      d.torNotes || '',
    ]);

    tables['สั่งซื้อสั่งจ้าง'].push([
      code,
      r.docNo || '',
      r.docDate || '',
      r.vendor || '',
      Number(r.agreed) || 0,
      d.deliveryDue || '',
      d.orderNotes || '',
      d.installmentCount ? Number(d.installmentCount) : '',
      (d.cancelledRounds || []).join(','),
      d.installmentCancelReason || '',
    ]);

    tables['ตั้งกรรมการตรวจรับ'].push([
      code,
      d.committeeNo || '',
      d.committeeDate || '',
      d.acceptanceNo || '',
    ]);

    tables['ฎีกา'].push([
      code,
      d.voucherNo || '',
      d.voucherDate || '',
      d.voucherAmount == null || d.voucherAmount === '' ? '' : Number(d.voucherAmount),
      d.paymentDate || '',
      d.voucherNotes || '',
    ]);

    for (const [sheetName, key] of [
      ['กรรมการTOR', 'torMembers'],
      ['กรรมการตรวจรับ', 'acceptanceMembers'],
    ] as const) {
      const list = d[key] || [];
      list.forEach((m, i) => {
        tables[sheetName].push([code, i + 1, m.name, m.position, m.role]);
      });
    }

    (d.deliveryRounds || []).forEach((dlv, i) => {
      tables['การส่งมอบ'].push([
        code,
        i + 1,
        Number(dlv.round) || 1,
        dlv.docNo || '',
        dlv.date || '',
        dlv.notes || '',
      ]);
    });

    (d.acceptanceRounds || []).forEach((v, i) => {
      tables['ผลตรวจรับ'].push([
        code,
        i + 1,
        Number(v.round),
        v.date,
        v.result,
        v.notes,
      ]);
    });

    getEffectiveVoucherEntries(d).forEach((ve, i) => {
      tables['รายการฎีกา'].push([
        code,
        i + 1,
        Number(ve.round) || 1,
        ve.voucherNo || '',
        ve.voucherDate || '',
        ve.voucherAmount == null || ve.voucherAmount === '' ? '' : Number(ve.voucherAmount),
        ve.paymentDate || '',
        ve.voucherNotes || '',
      ]);
    });

    for (const [stepId, v] of Object.entries(r.stageData || {})) {
      tables['ข้อมูลขั้นตอน'].push([
        code,
        stepId,
        v.docNo || '',
        v.docDate || '',
        v.start || '',
        v.due || '',
        v.finished || '',
      ]);
    }

    for (const f of r.files || []) {
      const b64 = String(f.data || '').split(',')[1] || '';
      if (!b64) {
        continue;
      }
      for (let i = 0; i < b64.length; i += BASE64_CHUNK_SIZE) {
        tables['ไฟล์แนบ'].push([
          code,
          f.category || 'general',
          f.id,
          f.name,
          f.type,
          i / BASE64_CHUNK_SIZE + 1,
          b64.slice(i, i + BASE64_CHUNK_SIZE),
        ]);
      }
    }
  }

  const s = calculateFinancialSums(rows);
  const poolAllocatedSum = (budgetPools || []).reduce(
    (acc, p) => acc + Math.max(0, Number(p.allocatedBudget || 0)),
    0,
  );
  const totalBudgetDisplay = poolAllocatedSum > 0 ? poolAllocatedSum : s.budget;
  tables['สรุปวงเงิน'] = [
    ['รายการ', 'จำนวนเงินบาท'],
    ['วงเงินงบประมาณรวม (BUDGET DATA)', totalBudgetDisplay],
    ['ราคากลาง (ไม่รวมพักงาน/ยกเลิก)', s.reference],
    ['วงเงินตกลง (ไม่รวมพักงาน/ยกเลิก)', s.agreed],
    ['จำนวนเงินฎีกา (ไม่รวมพักงาน/ยกเลิก)', s.voucher],
    ['หมายเหตุ', 'ทะเบียนยังคงเก็บวงเงินเดิมของทุกโครงการ สรุปนี้ตัดเฉพาะยอดรวม'],
  ];

  return tables;
}

interface ParsedRow {
  a: Array<string | number>;
  row: number;
}

interface FileAccumulator {
  category: AttachmentCategory;
  id: string;
  name: string;
  type: string;
  parts: Map<number, string>;
}

interface ProjectGroup {
  record: ProjectRecord;
  mode: 'insert' | 'update';
  existingId?: string;
  row: number;
  singles: Set<string>;
  sequences: Set<string>;
  files: Map<string, FileAccumulator>;
  hasAttachmentRows: boolean;
  linkedPoolName?: string;
}

export function previewExcelImport(
  tables: WorkbookTables,
  existingRows: ProjectRecord[],
  userId: string,
  targetYear: string,
  steps: WorkflowStep[],
  budgetPools: BudgetPool[] = [],
): Omit<ImportPlan, 'targetYear'> {
  if (
    targetYear !== 'file' &&
    (!Number.isInteger(Number(targetYear)) ||
      Number(targetYear) < 2500 ||
      Number(targetYear) > 2800)
  ) {
    throw new Error('ต้องเลือกปีปลายทางหรือใช้ปีที่ระบุในไฟล์');
  }

  if (!tables['ข้อมูลทั่วไป']) {
    throw new Error('ต้องมีชีตข้อมูลทั่วไป');
  }

  let totalRows = 0;
  const parsed: Record<string, ParsedRow[]> = {};
  const errors: ImportErrorItem[] = [];
  const bad = new Set<string>();
  const groups = new Map<string, ProjectGroup>();
  const master = new Set<string>();

  const existingByCode = new Map<string, ProjectRecord>();
  for (const row of existingRows) {
    existingByCode.set(normalizeCodeKey(row.code), row);
  }

  const pushError = (sheet: string, row: number, code: unknown, message: string) => {
    errors.push({ sheet, row, code: String(code || ''), message });
    if (code) {
      bad.add(normalizeCodeKey(code));
    }
  };

  for (const [sheetName, matrix] of Object.entries(tables)) {
    if (sheetName === 'สรุปวงเงิน') {
      if (JSON.stringify(matrix[0]) !== JSON.stringify(['รายการ', 'จำนวนเงินบาท'])) {
        throw new Error('หัวชีตสรุปวงเงินไม่ถูกต้อง');
      }
      continue;
    }

    if (sheetName === 'BUDGET DATA') {
      continue;
    }

    if (!EXCEL_SCHEMA[sheetName]) {
      throw new Error(`ไม่รองรับชีต ${sheetName}`);
    }

    const expectedHeaders = EXCEL_SCHEMA[sheetName];
    const legacyGeneralHeaders =
      sheetName === 'ข้อมูลทั่วไป'
        ? expectedHeaders.map((h, idx) =>
            idx === 12 ? 'หมวดค่าใช้จ่าย' : idx === 13 ? 'ประเภทย่อย' : h,
          )
        : null;
    const headerCandidates =
      sheetName === 'สั่งซื้อสั่งจ้าง'
        ? [expectedHeaders, expectedHeaders.slice(0, 7)]
        : sheetName === 'ข้อมูลทั่วไป'
          ? [
              expectedHeaders,
              expectedHeaders.slice(0, 15),
              expectedHeaders.slice(0, 14),
              expectedHeaders.slice(0, 12),
              ...(legacyGeneralHeaders
                ? [
                    legacyGeneralHeaders,
                    legacyGeneralHeaders.slice(0, 15),
                    legacyGeneralHeaders.slice(0, 14),
                  ]
                : []),
            ]
          : [expectedHeaders];
    const headerMatches =
      Array.isArray(matrix) &&
      headerCandidates.some(
        (candidate) => JSON.stringify(matrix[0]) === JSON.stringify(candidate),
      );

    if (!headerMatches) {
      throw new Error(`หัวคอลัมน์ชีต ${sheetName} ไม่ตรงกับแม่แบบ`);
    }

    const activeHeaderLength = matrix[0].length;

    parsed[sheetName] = [];
    matrix.slice(1).forEach((rowArr, i) => {
      if (!Array.isArray(rowArr)) {
        throw new Error('แถวข้อมูลไม่ถูกต้อง');
      }
      if (!rowArr.some((v) => v !== '' && v != null)) {
        return;
      }
      if (++totalRows > MAX_IMPORT_TOTAL_ROWS) {
        throw new Error('เกิน 5,000 แถวต่อชุด กรุณาแบ่งไฟล์');
      }
      if (
        rowArr.length > activeHeaderLength &&
        rowArr.slice(activeHeaderLength).some((v) => v !== '' && v != null)
      ) {
        pushError(sheetName, i + 2, rowArr[0], 'มีข้อมูลเกินคอลัมน์ที่รองรับ');
        return;
      }
      if (typeof rowArr[0] !== 'string' || !rowArr[0].trim()) {
        pushError(sheetName, i + 2, rowArr[0], 'รหัสโครงการต้องเป็นข้อความและห้ามว่าง');
        return;
      }
      parsed[sheetName].push({ a: rowArr, row: i + 2 });
    });
  }

  for (const { a, row } of parsed['ข้อมูลทั่วไป']) {
    const code = String(a[0]).trim();
    const k = normalizeCodeKey(code);

    if (master.has(k)) {
      pushError('ข้อมูลทั่วไป', row, code, 'รหัสโครงการซ้ำในไฟล์');
      continue;
    }
    master.add(k);

    const existingRecord = existingByCode.get(k);

    const dest = targetYear === 'file' ? a[1] : Number(targetYear);
    if (a[1] !== '' && Number(a[1]) !== Number(dest)) {
      pushError('ข้อมูลทั่วไป', row, code, 'ปีในแถวไม่ตรงกับปีปลายทาง');
      continue;
    }

    const rawBudget = a[6];
    const parsedBudget =
      rawBudget === '' || rawBudget == null ? 0 : Number(rawBudget);
    if (
      (rawBudget !== '' && rawBudget != null && typeof rawBudget !== 'number') ||
      !Number.isFinite(parsedBudget) ||
      parsedBudget < 0
    ) {
      pushError('ข้อมูลทั่วไป', row, code, 'วงเงินงบประมาณต้องเป็นเซลล์ตัวเลขตั้งแต่ศูนย์');
      continue;
    }

    const rowYear = Number(dest);
    const poolRefText = String(a[14] ?? '').trim();
    const rowCat = String(a[12] ?? existingRecord?.expenseCategory ?? '').trim();
    const rowSub = String(a[13] ?? existingRecord?.expenseSubCategory ?? '').trim();
    const rowPlan = String(a[15] ?? existingRecord?.planName ?? '').trim();
    const rowWork = String(a[16] ?? existingRecord?.workName ?? '').trim();
    const rowBudgetType = String(a[17] ?? existingRecord?.budgetType ?? '').trim();

    const yearPools = budgetPools.filter((bp) => Number(bp.year) === rowYear);
    let matchedPool: BudgetPool | undefined;

    if (poolRefText) {
      const targetKey = poolRefText.toLowerCase();
      matchedPool = yearPools.find(
        (bp) =>
          bp.name.trim().toLowerCase() === targetKey ||
          (bp.code && bp.code.trim().toLowerCase() === targetKey) ||
          bp.id.toLowerCase() === targetKey,
      );
      if (!matchedPool) {
        pushError(
          'ข้อมูลทั่วไป',
          row,
          code,
          `ไม่พบหมวด BUDGET DATA "${poolRefText}" ในปีงบฯ ${rowYear}`,
        );
        continue;
      }
    } else if (existingRecord?.budgetPoolId) {
      matchedPool = yearPools.find((bp) => bp.id === existingRecord.budgetPoolId);
    } else if (rowSub) {
      const subMatches = yearPools.filter(
        (bp) =>
          String(bp.expenseSubCategory || '').trim().toLowerCase() ===
            rowSub.toLowerCase() &&
          (!rowCat ||
            String(bp.expenseCategory || '').trim().toLowerCase() ===
              rowCat.toLowerCase()),
      );
      if (subMatches.length === 1) {
        matchedPool = subMatches[0];
      }
    }

    const record: ProjectRecord = {
      id: existingRecord?.id || '',
      code,
      year: rowYear,
      title: String(a[2] || ''),
      type: String(a[3] || '') as ProjectType,
      method: String(a[4] || ''),
      fund: String(a[5] || '').trim() || matchedPool?.fund || '',
      budget: matchedPool ? 0 : parsedBudget,
      budgetPoolId: matchedPool?.id,
      responsibleName: String(a[7] || '').trim(),
      start: String(a[8] || ''),
      notes: String(a[9] || ''),
      status: (a[10] || existingRecord?.status || 'รอจัดทำTOR และราคากลาง') as ProjectStatus,
      step: normalizeLegacyStepId(String(a[11] || existingRecord?.step || steps[0].id)),
      planName: rowPlan || matchedPool?.planName || undefined,
      workName: rowWork || matchedPool?.workName || undefined,
      budgetType: rowBudgetType || matchedPool?.budgetType || undefined,
      expenseCategory: rowCat || matchedPool?.expenseCategory || undefined,
      expenseSubCategory: rowSub || matchedPool?.expenseSubCategory || undefined,
      department: existingRecord?.department || DEFAULT_DEPARTMENT,
      assignee: existingRecord?.assignee || userId,
      reference: 0,
      agreed: 0,
      due: existingRecord?.due || '',
      docNo: '',
      docDate: '',
      vendor: '',
      ack: existingRecord?.ack ?? false,
      projectDetails: {},
      stageData: {},
      files: [],
      history: existingRecord?.history ? structuredClone(existingRecord.history) : [],
    };

    groups.set(k, {
      record,
      mode: existingRecord ? 'update' : 'insert',
      existingId: existingRecord?.id,
      row,
      singles: new Set(),
      sequences: new Set(),
      files: new Map(),
      hasAttachmentRows: false,
      linkedPoolName: matchedPool?.name,
    });
  }

  for (const [sheetName, rows] of Object.entries(parsed)) {
    if (sheetName === 'ข้อมูลทั่วไป') continue;
    for (const { a, row } of rows) {
      const code = String(a[0]).trim();
      const group = groups.get(normalizeCodeKey(code));
      if (!group) {
        pushError(sheetName, row, code, 'ไม่มีข้อมูลทั่วไปที่นำเข้าได้สำหรับรหัสนี้');
        continue;
      }

      const r = group.record;
      const d = r.projectDetails;

      try {
        if (['TORและราคากลาง', 'สั่งซื้อสั่งจ้าง', 'ตั้งกรรมการตรวจรับ', 'ฎีกา'].includes(sheetName)) {
          if (group.singles.has(sheetName)) {
            throw new Error('หมวดนี้มีข้อมูลซ้ำต่อโครงการ');
          }
          group.singles.add(sheetName);

          const text = (i: number) => String(a[i] ?? '');
          const doc = (i: number) => {
            if (a[i] !== '' && a[i] != null && typeof a[i] !== 'string') {
              throw new Error('เลขที่เอกสารต้องเป็นเซลล์ข้อความ');
            }
            return text(i);
          };
          const amount = (i: number) => {
            if (a[i] === '' || a[i] == null) return 0;
            const num = a[i];
            if (typeof num !== 'number' || !Number.isFinite(num) || num < 0) {
              throw new Error('จำนวนเงินต้องเป็นเซลล์ตัวเลขตั้งแต่ศูนย์');
            }
            return num;
          };

          if (sheetName === 'TORและราคากลาง') {
            d.torOrderNo = doc(1);
            d.torOrderDate = text(2);
            d.torPreparedDate = text(3);
            r.reference = amount(4);
            d.torNotes = text(5);
          } else if (sheetName === 'สั่งซื้อสั่งจ้าง') {
            r.docNo = doc(1);
            r.docDate = text(2);
            r.vendor = text(3);
            r.agreed = amount(4);
            d.deliveryDue = text(5);
            d.orderNotes = text(6);
            if (a[7] !== '' && a[7] != null) {
              d.installmentCount = cleanInstallmentCount(a[7]);
            }
            if (a[8] !== '' && a[8] != null) {
              const rawRounds = String(a[8])
                .split(',')
                .map((s) => Number(s.trim()))
                .filter((n) => Number.isInteger(n) && n >= 1);
              d.cancelledRounds = rawRounds;
            }
            if (a[9] !== '' && a[9] != null) {
              d.installmentCancelReason = text(9);
            }
          } else if (sheetName === 'ตั้งกรรมการตรวจรับ') {
            d.committeeNo = doc(1);
            d.committeeDate = text(2);
            d.acceptanceNo = doc(3);
          } else if (sheetName === 'ฎีกา') {
            d.voucherNo = doc(1);
            d.voucherDate = text(2);
            d.voucherAmount = a[3] === '' || a[3] == null ? '' : amount(3);
            d.paymentDate = text(4);
            d.voucherNotes = text(5);
          }
        } else if (
          [
            'กรรมการTOR',
            'กรรมการตรวจรับ',
            'การส่งมอบ',
            'ผลตรวจรับ',
            'รายการฎีกา',
          ].includes(sheetName)
        ) {
          const seqNum = a[1];
          if (typeof seqNum !== 'number' || !Number.isInteger(seqNum) || seqNum < 1) {
            throw new Error('ลำดับต้องเป็นเซลล์ตัวเลขจำนวนเต็มบวก');
          }
          const seqKey = `${sheetName}|${seqNum}`;
          if (group.sequences.has(seqKey)) {
            throw new Error('ลำดับซ้ำในหมวดเดียวกัน');
          }
          group.sequences.add(seqKey);

          if (sheetName === 'การส่งมอบ') {
            if (typeof a[2] !== 'number') {
              throw new Error('งวดที่ต้องเป็นเซลล์ตัวเลข');
            }
            if (a[3] !== '' && a[3] != null && typeof a[3] !== 'string') {
              throw new Error('เลขที่หนังสือส่งมอบต้องเป็นเซลล์ข้อความ');
            }
            d.deliveryRounds ??= [];
            d.deliveryRounds.push({
              sequence: seqNum,
              round: a[2],
              docNo: String(a[3] || ''),
              date: String(a[4] || ''),
              notes: String(a[5] || ''),
            });
          } else if (sheetName === 'ผลตรวจรับ') {
            if (typeof a[2] !== 'number') {
              throw new Error('งวดที่ต้องเป็นเซลล์ตัวเลข');
            }
            d.acceptanceRounds ??= [];
            d.acceptanceRounds.push({
              sequence: seqNum,
              round: a[2],
              date: String(a[3] || ''),
              result: String(a[4] || '') as AcceptanceRoundResultOrEmpty,
              notes: String(a[5] || ''),
            });
          } else if (sheetName === 'รายการฎีกา') {
            if (typeof a[2] !== 'number') {
              throw new Error('งวดที่ต้องเป็นเซลล์ตัวเลข');
            }
            if (a[3] !== '' && a[3] != null && typeof a[3] !== 'string') {
              throw new Error('เลขที่ฎีกาต้องเป็นเซลล์ข้อความ');
            }
            let voucherAmt: number | '' = '';
            if (a[5] !== '' && a[5] != null) {
              if (typeof a[5] !== 'number' || !Number.isFinite(a[5]) || a[5] < 0) {
                throw new Error('จำนวนเงินฎีกาต้องเป็นเซลล์ตัวเลขตั้งแต่ศูนย์');
              }
              voucherAmt = a[5];
            }
            d.voucherEntries ??= [];
            d.voucherEntries.push({
              sequence: seqNum,
              round: a[2],
              voucherNo: String(a[3] || ''),
              voucherDate: String(a[4] || ''),
              voucherAmount: voucherAmt,
              paymentDate: String(a[6] || ''),
              voucherNotes: String(a[7] || ''),
            });
          } else {
            const memberKey = sheetName === 'กรรมการTOR' ? 'torMembers' : 'acceptanceMembers';
            d[memberKey] ??= [];
            d[memberKey]!.push({
              sequence: seqNum,
              name: String(a[2] || ''),
              position: String(a[3] || ''),
              role: String(a[4] || 'กรรมการ') as CommitteeRole,
            });
          }
        } else if (sheetName === 'ข้อมูลขั้นตอน') {
          const stepId = normalizeLegacyStepId(String(a[1] || ''));
          if (!steps.some((v) => v.id === stepId)) {
            throw new Error('ไม่พบรหัสขั้นตอน');
          }
          if (r.stageData[stepId]) {
            throw new Error('ข้อมูลขั้นตอนซ้ำ');
          }
          if (a[2] !== '' && typeof a[2] !== 'string') {
            throw new Error('เลขที่เอกสารต้องเป็นข้อความ');
          }
          for (const i of [3, 4, 5, 6]) {
            if (a[i] && !isValidIsoDate(a[i])) {
              throw new Error('วันที่ขั้นตอนไม่ถูกต้อง');
            }
          }
          const start = String(a[4] || '');
          const due = String(a[5] || '');
          const finished = String(a[6] || '');
          if ((start && due && due < start) || (start && finished && finished < start)) {
            throw new Error('กำหนดเสร็จ/วันเสร็จจริงก่อนวันเริ่มขั้นตอน');
          }
          r.stageData[stepId] = {
            docNo: String(a[2] || ''),
            docDate: String(a[3] || ''),
            start,
            due,
            finished,
          };
        } else if (sheetName === 'ไฟล์แนบ') {
          group.hasAttachmentRows = true;
          const category = String(a[1] || '') as AttachmentCategory;
          const fileId = a[2];
          const fileName = a[3];
          const fileType = String(a[4] || '');
          const partIndex = a[5];
          const chunk = a[6];

          if (
            !ATTACHMENT_CATEGORIES.includes(category) ||
            typeof fileId !== 'string' ||
            !fileId ||
            typeof fileName !== 'string' ||
            !fileName ||
            typeof partIndex !== 'number' ||
            !Number.isInteger(partIndex) ||
            partIndex < 1 ||
            typeof chunk !== 'string' ||
            chunk.length > BASE64_CHUNK_SIZE ||
            !/^[A-Za-z0-9+/]*={0,2}$/.test(chunk)
          ) {
            throw new Error('ข้อมูลส่วนไฟล์ไม่ถูกต้อง');
          }

          let fileAcc = group.files.get(fileId);
          if (!fileAcc) {
            fileAcc = {
              category,
              id: fileId,
              name: fileName,
              type: fileType,
              parts: new Map(),
            };
            group.files.set(fileId, fileAcc);
          }

          if (
            fileAcc.name !== fileName ||
            fileAcc.type !== fileType ||
            fileAcc.category !== category ||
            fileAcc.parts.has(partIndex)
          ) {
            throw new Error('ส่วนไฟล์ซ้ำหรือ metadata ไม่ตรงกัน');
          }
          fileAcc.parts.set(partIndex, chunk);
        }
      } catch (err) {
        pushError(sheetName, row, code, err instanceof Error ? err.message : String(err));
      }
    }
  }

  const items: ImportPreviewItem[] = [];
  const good: ProjectRecord[] = [];
  let insertCount = 0;
  let updateCount = 0;

  for (const [k, group] of groups) {
    if (bad.has(k)) continue;
    const r = group.record;
    const d = r.projectDetails;

    try {
      for (const [id, f] of group.files) {
        const indexes = [...f.parts.keys()].sort((a, b) => a - b);
        if (indexes.some((n, i) => n !== i + 1)) {
          throw new Error(`ไฟล์ ${f.name} มีส่วนข้อมูลขาด`);
        }
        const b64 = indexes.map((i) => f.parts.get(i)!).join('');
        if (
          b64.length % 4 !== 0 ||
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(b64)
        ) {
          throw new Error('Base64 ของไฟล์ไม่ถูกต้อง');
        }
        const size =
          (b64.length / 4) * 3 - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
        const meta = getAttachmentMeta(
          { name: f.name, type: f.type, size },
          f.category === 'general' ? 'general' : 'tor',
        );
        r.files.push({
          ...meta,
          id,
          category: f.category,
          data: `data:${meta.type};base64,${b64}`,
        });
      }

      if (r.files.reduce((n, f) => n + f.size, 0) > MAX_PROJECT_ATTACHMENT_BYTES * 5) {
        throw new Error('ไฟล์แนบรวมเกิน 250 MB ต่อโครงการ');
      }

      if (d.torMembers) {
        d.torMembers.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
      }
      if (d.acceptanceMembers) {
        d.acceptanceMembers.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
      }
      if (d.deliveryRounds) {
        d.deliveryRounds.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
      }
      if (d.acceptanceRounds) {
        d.acceptanceRounds.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
      }

      d.torMembers = cleanCommitteeMembers(d.torMembers || []);
      d.acceptanceMembers = cleanCommitteeMembers(d.acceptanceMembers || []);
      d.deliveryRounds = cleanDeliveryRounds(d.deliveryRounds || []);
      d.acceptanceRounds = cleanAcceptanceRounds(d.acceptanceRounds || []);
      d.installmentCount = cleanInstallmentCount(d.installmentCount);
      d.cancelledRounds = cleanCancelledRounds(d.cancelledRounds, d.installmentCount);

      if (d.voucherEntries) {
        d.voucherEntries.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
        d.voucherEntries = cleanVoucherEntries(d.voucherEntries);
        if (d.voucherEntries.length > 0 && !group.singles.has('ฎีกา')) {
          const allPaid = d.voucherEntries.every((v) => Boolean(v.paymentDate));
          d.voucherNo = d.voucherEntries.map((v) => v.voucherNo).filter(Boolean).join(', ');
          d.voucherDate = d.voucherEntries[d.voucherEntries.length - 1]?.voucherDate || '';
          d.voucherAmount = d.voucherEntries.reduce(
            (sum, v) => sum + (Number(v.voucherAmount) || 0),
            0,
          );
          d.paymentDate = allPaid
            ? d.voucherEntries.map((v) => v.paymentDate).filter(Boolean).sort().pop() || ''
            : '';
          d.voucherNotes = d.voucherEntries
            .map((v) => (v.voucherNotes ? `งวด ${v.round}: ${v.voucherNotes}` : ''))
            .filter(Boolean)
            .join(' | ');
        }
      }

      const dateKeys: Array<keyof ProjectDetails> = [
        'torOrderDate',
        'torPreparedDate',
        'deliveryDue',
        'committeeDate',
        'voucherDate',
        'paymentDate',
      ];
      for (const name of dateKeys) {
        const val = d[name];
        if (val && !isValidIsoDate(val)) {
          throw new Error(`วันที่ ${name} ไม่ถูกต้อง`);
        }
      }

      if (!r.responsibleName || r.responsibleName.length > 200) {
        throw new Error('ต้องกรอกผู้รับผิดชอบไม่เกิน 200 ตัวอักษร');
      }

      if (r.code.length > 80 || r.title.length > 500) {
        throw new Error('รหัส/ชื่อโครงการยาวเกินกำหนด');
      }

      const validationErrors = validateProject(
        r,
        existingRows,
        group.existingId || '',
      );
      if (validationErrors.length) {
        throw new Error(validationErrors.join(' / '));
      }

      if (!steps.some((s) => s.id === r.step)) {
        throw new Error('ขั้นตอนไม่อยู่ในการตั้งค่าปัจจุบัน');
      }

      if (r.status === 'เสร็จสิ้น' && r.step !== steps[steps.length - 1].id) {
        throw new Error('งานเสร็จสิ้นต้องอยู่ขั้นตอนสุดท้าย');
      }

      if (group.mode === 'update') updateCount++;
      else insertCount++;

      items.push({
        record: r,
        mode: group.mode,
        existingId: group.existingId,
        hasAttachmentRows: group.hasAttachmentRows,
        linkedPoolName: group.linkedPoolName,
      });
      good.push(r);
    } catch (err) {
      pushError(
        'ข้อมูลทั่วไป',
        group.row,
        r.code,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  const years: Record<number, number> = {};
  for (const r of good) {
    years[r.year] = (years[r.year] || 0) + 1;
  }

  return {
    items,
    good,
    insertCount,
    updateCount,
    errors,
    badProjects: bad.size,
    years,
    totalRows,
  };
}

type AcceptanceRoundResultOrEmpty = NonNullable<
  ProjectDetails['acceptanceRounds']
>[number]['result'];

export function exportWorkbookFile(tables: WorkbookTables, filename: string): void {
  const wb = XLSX.utils.book_new();
  for (const [sheet, matrix] of Object.entries(tables)) {
    const ws = XLSX.utils.aoa_to_sheet(matrix);
    ws['!cols'] = (matrix[0] || []).map((h) => ({
      wch: String(h).includes('รายละเอียด')
        ? 45
        : String(h).includes('Base64')
          ? 30
          : 24,
    }));
    XLSX.utils.book_append_sheet(wb, ws, sheet);
  }
  const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  triggerDownloadUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readExcelFileToTables(file: File): Promise<WorkbookTables> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const tables: WorkbookTables = {};
  for (const name of wb.SheetNames) {
    tables[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], {
      header: 1,
      defval: '',
    }) as SheetMatrix;
  }
  return tables;
}
