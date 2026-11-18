import {
  ACCEPTANCE_RESULTS,
  COMMITTEE_ROLES,
  MAX_PROJECT_ATTACHMENT_BYTES,
  PROJECT_TYPES,
  SARABAN_ALLOWED_CATEGORIES,
  SARABAN_CATEGORY_META,
  STATUSES,
  TERMINAL_STATUSES,
  USERS,
} from '../data/constants';
import type {
  AcceptanceRound,
  AttachmentCategory,
  CommitteeMember,
  DeliveryRound,
  ProjectDetails,
  ProjectRecord,
  ProjectStatus,
  SarabanQueueItem,
  SortDirection,
  SortKey,
  UserAccount,
  VoucherEntry,
  WorkflowStep,
} from '../types/procurement';
import { isValidIsoDate, todayBangkok, uid } from '../utils/date';
import { normalizeCodeKey } from '../utils/format';

export function isTerminalStatus(status: ProjectStatus | string): boolean {
  return TERMINAL_STATUSES.includes(status as ProjectStatus);
}

export function isActiveProject(project: Pick<ProjectRecord, 'status'>): boolean {
  return !isTerminalStatus(project.status);
}

export function getInboxProjects(rows: ProjectRecord[], userId: string): ProjectRecord[] {
  return rows.filter((r) => r.assignee === userId && isActiveProject(r));
}

export function isOverdueProject(
  project: Pick<ProjectRecord, 'status' | 'due'>,
  day: string = todayBangkok(),
): boolean {
  return isActiveProject(project) && Boolean(project.due) && project.due < day;
}

export function sortProjects(
  rows: ProjectRecord[],
  key: SortKey,
  dir: SortDirection = 'asc',
): ProjectRecord[] {
  const factor = dir === 'asc' ? 1 : -1;
  const numericKeys: SortKey[] = ['budget', 'agreed', 'year'];
  return [...rows].sort((a, b) => {
    const x = a[key] ?? '';
    const y = b[key] ?? '';
    if (numericKeys.includes(key)) {
      return (Number(x) - Number(y)) * factor;
    }
    return String(x).localeCompare(String(y), 'th', { numeric: true }) * factor;
  });
}

export function canEditProject(user: UserAccount, _project?: ProjectRecord): boolean {
  return user.role === 'admin';
}

export function getUserName(id: string): string {
  return USERS.find((u) => u.id === id)?.name || id;
}

export function getResponsibleName(project: Pick<ProjectRecord, 'responsibleName' | 'assignee'>): string {
  return project.responsibleName ?? getUserName(project.assignee);
}

export function normalizeLegacyStepId(stepId: string | undefined | null): string {
  if (!stepId) return 's1';
  if (stepId === 's6') return 's4';
  if (stepId === 's7' || stepId === 's8') return 's5';
  if (['s1', 's2', 's3', 's4', 's5'].includes(stepId)) return stepId;
  return 's1';
}

export function getStepName(steps: WorkflowStep[], stepId: string): string {
  const normalized = normalizeLegacyStepId(stepId);
  return steps.find((s) => s.id === normalized)?.name || stepId;
}

export function getAckAt(project: Pick<ProjectRecord, 'ack' | 'ackAt' | 'history'>): string | null {
  if (!project.ack) return null;
  if (project.ackAt) return project.ackAt;
  const history = project.history || [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]?.action.includes('รับทราบงาน')) {
      return history[i].at;
    }
  }
  return null;
}

export function getStatusUpdatedAt(
  project: Pick<ProjectRecord, 'statusUpdatedAt' | 'history'>,
): string | null {
  if (project.statusUpdatedAt) return project.statusUpdatedAt;
  const history = project.history || [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const action = history[i]?.action || '';
    if (
      action.includes('เปลี่ยนสถานะ') ||
      action.includes('เปลี่ยน ') ||
      action.includes('สร้างโครงการ') ||
      action.includes('นำเข้า')
    ) {
      return history[i].at;
    }
  }
  return history.length ? history[history.length - 1].at : null;
}

export function deriveProgressFromTabs(
  project: Pick<
    ProjectRecord,
    | 'reference'
    | 'agreed'
    | 'docNo'
    | 'docDate'
    | 'vendor'
    | 'due'
    | 'projectDetails'
    | 'files'
    | 'status'
    | 'manualStatusOverride'
  >,
  ignoreManualOverride: boolean = false,
): { step: string; status: ProjectStatus; due: string } {
  const details = project.projectDetails || {};
  const files = project.files || [];

  const hasTor = Boolean(
    details.torOrderNo?.trim() ||
      details.torOrderDate ||
      details.torPreparedDate ||
      details.torDate ||
      details.referenceDate ||
      details.torNo?.trim() ||
      details.torNotes?.trim() ||
      Number(project.reference) > 0 ||
      (details.torMembers || []).some((m) => m.name?.trim()) ||
      files.some((f) => f.category === 'tor'),
  );

  const summary = getInstallmentSummary(details);

  const hasOrder = Boolean(
    project.docNo?.trim() ||
      project.docDate ||
      project.vendor?.trim() ||
      Number(project.agreed) > 0 ||
      details.deliveryDue ||
      details.orderNotes?.trim() ||
      summary.installmentCount > 0 ||
      files.some((f) => f.category === 'order'),
  );

  const hasAcceptance = Boolean(
    details.committeeNo?.trim() ||
      details.committeeDate ||
      details.acceptanceNo?.trim() ||
      (details.acceptanceMembers || []).some((m) => m.name?.trim()) ||
      (details.deliveryRounds || []).some(
        (d) => d.date || d.docNo?.trim() || d.notes?.trim(),
      ) ||
      (details.acceptanceRounds || []).some(
        (r) => r.date || r.result || r.notes?.trim(),
      ) ||
      files.some((f) => f.category === 'acceptance'),
  );

  const voucherEntries = summary.voucherEntries;
  const hasVoucher = Boolean(
    voucherEntries.length > 0 ||
      details.voucherNo?.trim() ||
      details.voucherDate ||
      (details.voucherAmount !== '' &&
        details.voucherAmount != null &&
        Number(details.voucherAmount) > 0) ||
      details.paymentDate ||
      details.voucherNotes?.trim() ||
      files.some((f) => f.category === 'voucher'),
  );

  let step = 's1';
  if (hasVoucher) step = 's5';
  else if (hasAcceptance) step = 's4';
  else if (hasOrder) step = 's3';
  else if (hasTor) step = 's2';

  const due = details.deliveryDue || project.due || '';

  if (
    !ignoreManualOverride &&
    (project.manualStatusOverride ||
      project.status === 'พักงาน' ||
      project.status === 'ยกเลิก')
  ) {
    return { step, status: project.status, due };
  }

  let status: ProjectStatus = 'รอจัดทำTOR และราคากลาง';
  if (hasVoucher) {
    if (summary.installmentCount > 0) {
      if (summary.activeRounds.length === 0) {
        status = summary.allVouchersPaid && voucherEntries.length > 0 ? 'เสร็จสิ้น' : 'ยกเลิก';
      } else if (summary.missingVoucherRounds.length > 0) {
        status = 'กำลังดำเนินการ';
      } else {
        const allActivePaid = summary.activeRounds.every((r) =>
          voucherEntries.some((v) => v.round === r && Boolean(v.paymentDate)),
        );
        const allRecordedPaid = voucherEntries.every((v) => Boolean(v.paymentDate));
        status = allActivePaid && allRecordedPaid ? 'เสร็จสิ้น' : 'รออนุมัติ';
      }
    } else {
      const validDeliveries = (details.deliveryRounds || []).filter(
        (d) => d.date || d.docNo?.trim() || d.notes?.trim(),
      );
      if (voucherEntries.length > 0) {
        const allVouchersPaid = voucherEntries.every((v) => Boolean(v.paymentDate));
        const allDeliveriesPaid =
          validDeliveries.length === 0 ||
          validDeliveries.every((d) =>
            voucherEntries.some((v) => v.round === d.round && Boolean(v.paymentDate)),
          );
        status = allVouchersPaid && allDeliveriesPaid ? 'เสร็จสิ้น' : 'รออนุมัติ';
      } else {
        status = details.paymentDate ? 'เสร็จสิ้น' : 'รออนุมัติ';
      }
    }
  } else if (hasAcceptance) {
    const completedRounds = (details.acceptanceRounds || []).filter((r) => r.result);
    const latestResult = completedRounds[completedRounds.length - 1]?.result;
    if (
      latestResult === 'ไม่ผ่านการตรวจรับ' ||
      latestResult === 'ให้แก้ไขก่อนตรวจรับ'
    ) {
      status = 'ส่งกลับแก้ไข';
    } else if (latestResult === 'ตรวจรับถูกต้องครบถ้วน') {
      if (summary.installmentCount > 0) {
        const allActiveAccepted =
          summary.activeRounds.length > 0 &&
          summary.activeRounds.every((r) =>
            (details.acceptanceRounds || []).some(
              (ar) => ar.round === r && ar.result === 'ตรวจรับถูกต้องครบถ้วน',
            ),
          );
        status = allActiveAccepted ? 'รออนุมัติ' : 'กำลังดำเนินการ';
      } else {
        status = 'รออนุมัติ';
      }
    } else {
      status = 'กำลังดำเนินการ';
    }
  } else if (hasOrder) {
    if (summary.installmentCount > 0 && summary.activeRounds.length === 0) {
      status = 'ยกเลิก';
    } else {
      status = 'กำลังดำเนินการ';
    }
  } else if (hasTor) {
    status = 'อยู่ระหว่างสั่งซื้อสั่งจ้าง';
  }

  return { step, status, due };
}

export function validateProject(
  project: Partial<ProjectRecord>,
  existingRows: ProjectRecord[] = [],
  editingId: string = '',
): string[] {
  const errors: string[] = [];
  const requiredPairs: Array<[keyof ProjectRecord, string]> = [
    ['code', 'เลขทะเบียน'],
    ['title', 'ชื่อโครงการ'],
    ['department', 'หน่วยงาน'],
    ['method', 'วิธีจัดซื้อจัดจ้าง'],
    ['assignee', 'ผู้รับผิดชอบ'],
  ];

  for (const [k, label] of requiredPairs) {
    if (!String(project[k] ?? '').trim()) {
      errors.push(`กรุณาระบุ${label}`);
    }
  }

  const yearNum = Number(project.year);
  if (!Number.isInteger(yearNum) || yearNum < 2500 || yearNum > 2800) {
    errors.push('ปีงบประมาณต้องเป็น พ.ศ. 2500–2800');
  }

  for (const k of ['budget', 'reference', 'agreed'] as const) {
    const val = Number(project[k]);
    if (!Number.isFinite(val) || val < 0) {
      errors.push('จำนวนเงินต้องเป็นตัวเลขตั้งแต่ศูนย์ขึ้นไป');
    }
  }

  if (!isValidIsoDate(project.start)) {
    errors.push('วันที่ขออนุมัติไม่ถูกต้อง');
  }

  if (project.due && (!isValidIsoDate(project.due) || project.due < String(project.start || ''))) {
    errors.push('กำหนดเสร็จต้องไม่ก่อนวันเริ่ม');
  }

  if (project.docDate && !isValidIsoDate(project.docDate)) {
    errors.push('วันที่เอกสารไม่ถูกต้อง');
  }

  const targetCodeKey = normalizeCodeKey(project.code);
  if (
    existingRows.some(
      (x) => x.id !== editingId && normalizeCodeKey(x.code) === targetCodeKey,
    )
  ) {
    errors.push('เลขทะเบียน/รหัสโครงการซ้ำในระบบ');
  }

  if (
    !STATUSES.includes(project.status as ProjectStatus) &&
    project.status !== 'รอดำเนินการ'
  ) {
    errors.push('สถานะไม่ถูกต้อง');
  }

  if (!PROJECT_TYPES.includes(project.type as ProjectRecord['type'])) {
    errors.push('ประเภทงานไม่ถูกต้อง');
  }

  return errors;
}

export function transitionProjectStep(
  project: ProjectRecord,
  nextStepId: string,
  user: UserAccount,
  steps: WorkflowStep[],
  reason: string = '',
): ProjectRecord {
  if (!canEditProject(user, project)) {
    throw new Error('ไม่มีสิทธิ์เปลี่ยนขั้นตอน');
  }

  const target = steps.find((s) => s.id === nextStepId);
  if (!target) {
    throw new Error('ไม่พบขั้นตอน');
  }

  const current = steps.find((s) => s.id === normalizeLegacyStepId(project.step));
  if (current && steps.indexOf(target) < steps.indexOf(current) && !reason.trim()) {
    throw new Error('กรุณาระบุเหตุผลส่งกลับ');
  }

  if (target.roles && !target.roles.includes(user.role)) {
    throw new Error('บทบาทนี้ไม่มีสิทธิ์ดำเนินการขั้นตอนปลายทาง');
  }

  if ((target.required || []).some((k) => !project[k])) {
    throw new Error('ข้อมูลไม่ครบตามเงื่อนไขของขั้นตอน');
  }

  return { ...project, step: nextStepId };
}

export function getTorPreparedDate(details: ProjectDetails = {}): string {
  if (details.torPreparedDate !== undefined) {
    return details.torPreparedDate;
  }
  if (details.torDate && details.referenceDate && details.torDate !== details.referenceDate) {
    return '';
  }
  return details.torDate || details.referenceDate || '';
}

export function cleanCommitteeMembers(members: Partial<CommitteeMember>[]): CommitteeMember[] {
  if (!Array.isArray(members) || members.length > 30) {
    throw new Error('รายชื่อกรรมการต้องไม่เกิน 30 คน');
  }

  return members
    .map((m) => ({
      name: String(m.name || '').trim(),
      position: String(m.position || '').trim(),
      role: String(m.role || 'กรรมการ') as CommitteeMember['role'],
    }))
    .filter((m) => m.name || m.position)
    .map((m) => {
      if (!m.name) {
        throw new Error('กรุณาระบุชื่อกรรมการในแถวที่กรอกตำแหน่ง');
      }
      if (m.name.length > 200 || m.position.length > 200) {
        throw new Error('ชื่อหรือตำแหน่งกรรมการยาวเกิน 200 ตัวอักษร');
      }
      if (!COMMITTEE_ROLES.includes(m.role)) {
        throw new Error('หน้าที่กรรมการไม่ถูกต้อง');
      }
      return m;
    });
}

export function cleanAcceptanceRounds(rows: Partial<AcceptanceRound>[]): AcceptanceRound[] {
  if (!Array.isArray(rows) || rows.length > 100) {
    throw new Error('บันทึกผลตรวจรับได้ไม่เกิน 100 ครั้ง');
  }

  return rows
    .map((r) => ({
      round: Number(r.round),
      date: String(r.date || ''),
      result: String(r.result || '') as AcceptanceRound['result'],
      notes: String(r.notes || '').trim(),
    }))
    .filter((r) => r.date || r.result || r.notes)
    .map((r) => {
      if (!Number.isInteger(r.round) || r.round < 1) {
        throw new Error('งวดตรวจรับต้องเป็นจำนวนเต็มตั้งแต่ 1');
      }
      if (r.date && !isValidIsoDate(r.date)) {
        throw new Error('วันที่ตรวจรับไม่ถูกต้อง');
      }
      if (r.result && !ACCEPTANCE_RESULTS.includes(r.result)) {
        throw new Error('ผลตรวจรับไม่ถูกต้อง');
      }
      if (r.result && !r.date) {
        throw new Error('กรุณาระบุวันที่เมื่อบันทึกผลตรวจรับ');
      }
      if (r.notes.length > 2000) {
        throw new Error('รายละเอียดตรวจรับยาวเกิน 2,000 ตัวอักษร');
      }
      return r;
    });
}

const ATTACHMENT_MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
};

export function getAttachmentMeta(
  file: { name: string; type: string; size: number },
  category: AttachmentCategory = 'general',
): { name: string; type: string; size: number } {
  const ext = String(file.name).split('.').pop()?.toLowerCase() || '';
  const isDocCategory = ['tor', 'acceptance', 'order', 'voucher'].includes(category);
  const allowed = [
    'pdf',
    'xlsx',
    'xls',
    'docx',
    'doc',
    'png',
    'jpg',
    'jpeg',
    'zip',
    'rar',
  ];

  if (!allowed.includes(ext)) {
    throw new Error(
      isDocCategory
        ? 'รองรับไฟล์ PDF, Excel (.xlsx/.xls), Word (.docx/.doc), รูปภาพ (PNG/JPG) และ ZIP/RAR'
        : 'รองรับไฟล์ PDF, รูปภาพ (PNG/JPG), Word, Excel และ ZIP/RAR',
    );
  }

  if (!file.size || file.size > MAX_PROJECT_ATTACHMENT_BYTES) {
    throw new Error('ไฟล์ต้องมีข้อมูลและขนาดไม่เกิน 50 MB ต่อไฟล์');
  }

  return {
    name: file.name,
    type: ATTACHMENT_MIME_TYPES[ext] || file.type || 'application/octet-stream',
    size: file.size,
  };
}

export function cleanDeliveryRounds(rows: Partial<DeliveryRound>[]): DeliveryRound[] {
  if (!Array.isArray(rows) || rows.length > 100) {
    throw new Error('บันทึกการส่งมอบได้ไม่เกิน 100 ครั้ง');
  }

  return rows
    .map((r) => ({
      round: Number(r.round),
      docNo: String(r.docNo || '').trim(),
      date: String(r.date || ''),
      notes: String(r.notes || '').trim(),
    }))
    .filter((r) => r.date || r.docNo || r.notes)
    .map((r) => {
      if (!Number.isInteger(r.round) || r.round < 1) {
        throw new Error('งวดส่งมอบต้องเป็นจำนวนเต็มตั้งแต่ 1');
      }
      if (r.date && !isValidIsoDate(r.date)) {
        throw new Error('วันที่ส่งมอบไม่ถูกต้อง');
      }
      if (r.docNo.length > 200) {
        throw new Error('เลขที่หนังสือส่งมอบยาวเกิน 200 ตัวอักษร');
      }
      if (r.notes.length > 2000) {
        throw new Error('รายละเอียดการส่งมอบยาวเกิน 2,000 ตัวอักษร');
      }
      return r;
    });
}

export function getEffectiveVoucherEntries(
  details: ProjectDetails = {},
): VoucherEntry[] {
  if (Array.isArray(details.voucherEntries)) {
    return details.voucherEntries.filter(
      (v) =>
        v.voucherNo?.trim() ||
        v.voucherDate ||
        (v.voucherAmount !== '' && v.voucherAmount != null) ||
        v.paymentDate ||
        v.voucherNotes?.trim(),
    );
  }

  const hasLegacy = Boolean(
    details.voucherNo?.trim() ||
      details.voucherDate ||
      (details.voucherAmount !== '' && details.voucherAmount != null) ||
      details.paymentDate ||
      details.voucherNotes?.trim(),
  );
  if (!hasLegacy) return [];

  const firstDeliveryRound = details.deliveryRounds?.[0]?.round || 1;
  return [
    {
      round: firstDeliveryRound,
      voucherNo: details.voucherNo || '',
      voucherDate: details.voucherDate || '',
      voucherAmount: details.voucherAmount ?? '',
      paymentDate: details.paymentDate || '',
      voucherNotes: details.voucherNotes || '',
    },
  ];
}

export function getTotalVoucherAmount(details: ProjectDetails = {}): number {
  const entries = getEffectiveVoucherEntries(details);
  if (entries.length > 0) {
    return entries.reduce((sum, v) => sum + (Number(v.voucherAmount) || 0), 0);
  }
  return Number(details.voucherAmount || 0);
}

export function cleanVoucherEntries(rows: Partial<VoucherEntry>[]): VoucherEntry[] {
  if (!Array.isArray(rows) || rows.length > 100) {
    throw new Error('บันทึกรายการฎีกาได้ไม่เกิน 100 ครั้ง');
  }

  return rows
    .map((r) => ({
      round: Number(r.round) || 1,
      voucherNo: String(r.voucherNo || '').trim(),
      voucherDate: String(r.voucherDate || ''),
      voucherAmount:
        r.voucherAmount === '' || r.voucherAmount == null
          ? ('' as const)
          : Number(r.voucherAmount),
      paymentDate: String(r.paymentDate || ''),
      voucherNotes: String(r.voucherNotes || '').trim(),
    }))
    .filter(
      (r) =>
        r.voucherNo ||
        r.voucherDate ||
        r.voucherAmount !== '' ||
        r.paymentDate ||
        r.voucherNotes,
    )
    .map((r) => {
      if (!Number.isInteger(r.round) || r.round < 1) {
        throw new Error('งวดที่เชื่อมโยงกับฎีกาต้องเป็นจำนวนเต็มตั้งแต่ 1');
      }
      if (r.voucherNo.length > 100) {
        throw new Error('เลขที่ฎีกายาวเกิน 100 ตัวอักษร');
      }
      if (r.voucherDate && !isValidIsoDate(r.voucherDate)) {
        throw new Error('วันที่ฎีกาไม่ถูกต้อง');
      }
      if (
        r.voucherAmount !== '' &&
        (!Number.isFinite(r.voucherAmount) || r.voucherAmount < 0)
      ) {
        throw new Error('จำนวนเงินตามฎีกาต้องเป็นตัวเลขตั้งแต่ศูนย์ขึ้นไป');
      }
      if (r.paymentDate && !isValidIsoDate(r.paymentDate)) {
        throw new Error('วันที่เบิกจ่ายไม่ถูกต้อง');
      }
      if (r.voucherNotes.length > 2000) {
        throw new Error('รายละเอียดฎีกายาวเกิน 2,000 ตัวอักษร');
      }
      return r;
    });
}

export function cleanInstallmentCount(val: unknown): number | '' {
  if (val === '' || val == null) return '';
  const num = Number(val);
  if (!Number.isInteger(num) || num < 1 || num > 100) {
    throw new Error('จำนวนงวดงานต้องเป็นจำนวนเต็มตั้งแต่ 1 ถึง 100 งวด');
  }
  return num;
}

export function cleanCancelledRounds(
  rounds: unknown,
  installmentCount: number | '',
): number[] {
  const max = Number(installmentCount) || 0;
  if (!Array.isArray(rounds) || max < 1) return [];
  const valid = new Set<number>();
  for (const r of rounds) {
    const num = Number(r);
    if (Number.isInteger(num) && num >= 1 && num <= max) {
      valid.add(num);
    }
  }
  return [...valid].sort((a, b) => a - b);
}

export interface InstallmentSummary {
  installmentCount: number;
  cancelledRounds: number[];
  activeRounds: number[];
  voucherEntries: VoucherEntry[];
  voucheredActiveRounds: number[];
  paidActiveRounds: number[];
  missingVoucherRounds: number[];
  allVouchersPaid: boolean;
}

export function getInstallmentSummary(details: ProjectDetails = {}): InstallmentSummary {
  const rawCount = Number(details.installmentCount);
  const installmentCount =
    Number.isInteger(rawCount) && rawCount >= 1 && rawCount <= 100 ? rawCount : 0;

  const cancelledRounds = cleanCancelledRounds(details.cancelledRounds, installmentCount || '');
  const cancelledSet = new Set(cancelledRounds);
  const allRounds = Array.from({ length: installmentCount }, (_, i) => i + 1);
  const activeRounds = allRounds.filter((r) => !cancelledSet.has(r));

  const voucherEntries = getEffectiveVoucherEntries(details);
  const voucheredSet = new Set(voucherEntries.map((v) => v.round));
  const paidSet = new Set(
    voucherEntries.filter((v) => Boolean(v.paymentDate)).map((v) => v.round),
  );

  const voucheredActiveRounds = activeRounds.filter((r) => voucheredSet.has(r));
  const paidActiveRounds = activeRounds.filter((r) => paidSet.has(r));
  const missingVoucherRounds = activeRounds.filter((r) => !voucheredSet.has(r));
  const allVouchersPaid =
    voucherEntries.length > 0 && voucherEntries.every((v) => Boolean(v.paymentDate));

  return {
    installmentCount,
    cancelledRounds,
    activeRounds,
    voucherEntries,
    voucheredActiveRounds,
    paidActiveRounds,
    missingVoucherRounds,
    allVouchersPaid,
  };
}

export function createVoucherDraft(details: ProjectDetails = {}): VoucherEntry[] {
  const effective = getEffectiveVoucherEntries(details);
  if (effective.length > 0) {
    return structuredClone(effective);
  }
  const firstRound = details.deliveryRounds?.[0]?.round || 1;
  return [
    {
      round: firstRound,
      voucherNo: '',
      voucherDate: '',
      voucherAmount: '',
      paymentDate: '',
      voucherNotes: '',
    },
  ];
}

export function createAcceptanceDraft(details: ProjectDetails = {}): {
  members: CommitteeMember[];
  deliveries: DeliveryRound[];
  rounds: AcceptanceRound[];
} {
  const members: CommitteeMember[] =
    details.acceptanceMembers ??
    (details.committeeNames
      ? details.committeeNames
          .split('\n')
          .map((n) => n.trim())
          .filter(Boolean)
          .map((name, i) => ({
            name,
            position: '',
            role: (i ? 'กรรมการ' : 'ประธานกรรมการ') as CommitteeMember['role'],
          }))
      : [{ name: '', position: '', role: 'ประธานกรรมการ' }]);

  const deliveries: DeliveryRound[] =
    details.deliveryRounds && details.deliveryRounds.length > 0
      ? details.deliveryRounds
      : [{ round: 1, docNo: '', date: '', notes: '' }];

  const rounds: AcceptanceRound[] =
    details.acceptanceRounds ??
    (details.acceptanceDate || details.acceptanceNotes
      ? [
          {
            round: 1,
            date: details.acceptanceDate || '',
            result: '',
            notes: details.acceptanceNotes || '',
          },
        ]
      : [{ round: 1, date: '', result: '', notes: '' }]);

  return {
    members: structuredClone(members),
    deliveries: structuredClone(deliveries),
    rounds: structuredClone(rounds),
  };
}

function appendUniqueNoteLine(existing: string | undefined, line: string): string {
  const cleanLine = line.trim();
  if (!cleanLine) return existing || '';
  const current = String(existing || '').trim();
  if (!current) return cleanLine;
  if (current.includes(cleanLine)) return current;
  return `${current}\n${cleanLine}`;
}

export function applySarabanQueueItemToProject(
  target: ProjectRecord,
  item: SarabanQueueItem,
): void {
  if (!SARABAN_ALLOWED_CATEGORIES.includes(item.docCategory)) {
    throw new Error('หมวดเอกสารจากสารบรรณไม่รองรับในระบบจัดซื้อจัดจ้าง');
  }

  target.projectDetails ??= {};
  target.files ??= [];
  const d = target.projectDetails;
  const payload = item.payload || {};
  const meta = SARABAN_CATEGORY_META[item.docCategory];
  const bookDate = isValidIsoDate(item.bookDate) ? item.bookDate : '';
  const refLabel = [item.bookNo, item.subject].filter(Boolean).join(' · ');

  if (item.docCategory === 'tor_order') {
    if (item.bookNo) d.torOrderNo = item.bookNo;
    if (bookDate) d.torOrderDate = bookDate;
    const assigneeName = String(payload.assigneeName || '').trim();
    if (assigneeName) {
      d.torMembers ??= [];
      const alreadyHas = d.torMembers.some(
        (m) => m.name.trim() === assigneeName,
      );
      if (!alreadyHas) {
        const blankRow = d.torMembers.find((m) => !m.name.trim());
        if (blankRow) {
          blankRow.name = assigneeName;
        } else {
          d.torMembers.push({
            name: assigneeName,
            position: '',
            role: d.torMembers.length === 0 ? 'ประธานกรรมการ' : 'กรรมการ',
          });
        }
      }
    }
    const extraNotes = [payload.notes, refLabel].filter(Boolean).join(' — ');
    if (extraNotes) {
      d.torNotes = appendUniqueNoteLine(d.torNotes, `[คำสั่ง TOR] ${extraNotes}`);
    }
  } else if (item.docCategory === 'tor_approval') {
    if (item.bookNo) d.torNo = item.bookNo;
    if (bookDate) {
      d.torPreparedDate = bookDate;
      d.torDate = bookDate;
    }
    if (payload.torAuthor) d.torAuthor = String(payload.torAuthor).trim();
    const extraDetails = [
      payload.torAuthor ? `ผู้จัดทำ: ${payload.torAuthor}` : '',
      payload.details,
      refLabel,
    ]
      .filter(Boolean)
      .join(' · ');
    if (extraDetails) {
      d.torNotes = appendUniqueNoteLine(d.torNotes, `[อนุมัติ TOR] ${extraDetails}`);
    }
  } else if (item.docCategory === 'ref_price') {
    const refPrice = Number(payload.refPrice);
    if (Number.isFinite(refPrice) && refPrice > 0) {
      target.reference = refPrice;
    }
    if (bookDate) {
      d.referenceDate = bookDate;
      if (!d.torPreparedDate) d.torPreparedDate = bookDate;
    }
    const extraDetails = [
      Number.isFinite(refPrice) && refPrice > 0
        ? `ราคากลาง ${refPrice.toLocaleString('en-US')} บาท`
        : '',
      payload.details,
      refLabel,
    ]
      .filter(Boolean)
      .join(' · ');
    if (extraDetails) {
      d.torNotes = appendUniqueNoteLine(d.torNotes, `[ราคากลาง] ${extraDetails}`);
    }
  } else if (item.docCategory === 'disbursement') {
    const round =
      Number.isInteger(Number(payload.installment)) && Number(payload.installment) >= 1
        ? Number(payload.installment)
        : 1;
    const voucherNo = String(payload.voucherNo || item.bookNo || '').trim();
    const amount =
      payload.amount != null && Number.isFinite(Number(payload.amount))
        ? Number(payload.amount)
        : ('' as const);
    const paymentDate =
      payload.status === 'paid' ? bookDate || todayBangkok() : '';
    const voucherNotes = [item.subject, item.bookNo ? `อ้างอิง ${item.bookNo}` : '']
      .filter(Boolean)
      .join(' · ');

    const entries = getEffectiveVoucherEntries(d);
    const existingIdx = entries.findIndex(
      (v) =>
        v.round === round &&
        ((voucherNo && v.voucherNo === voucherNo) ||
          (!v.voucherNo && !v.voucherDate && v.voucherAmount === '')),
    );

    const nextEntry: VoucherEntry = {
      round,
      voucherNo,
      voucherDate: bookDate,
      voucherAmount: amount,
      paymentDate,
      voucherNotes,
    };

    if (existingIdx >= 0) {
      entries[existingIdx] = {
        ...entries[existingIdx],
        ...nextEntry,
        voucherNo: nextEntry.voucherNo || entries[existingIdx].voucherNo,
        voucherDate: nextEntry.voucherDate || entries[existingIdx].voucherDate,
        voucherAmount:
          nextEntry.voucherAmount !== ''
            ? nextEntry.voucherAmount
            : entries[existingIdx].voucherAmount,
        paymentDate: nextEntry.paymentDate || entries[existingIdx].paymentDate,
        voucherNotes: appendUniqueNoteLine(
          entries[existingIdx].voucherNotes,
          voucherNotes,
        ),
      };
    } else {
      entries.push(nextEntry);
    }

    entries.sort((a, b) => a.round - b.round);
    d.voucherEntries = entries;

    const latestVoucher = entries[entries.length - 1];
    const hasAnyAmt = entries.some(
      (v) => v.voucherAmount !== '' && v.voucherAmount != null,
    );
    const allPaid = entries.length > 0 && entries.every((v) => Boolean(v.paymentDate));
    d.voucherNo = entries.map((v) => v.voucherNo).filter(Boolean).join(', ');
    d.voucherDate = latestVoucher?.voucherDate || '';
    d.voucherAmount = hasAnyAmt
      ? entries.reduce((sum, v) => sum + (Number(v.voucherAmount) || 0), 0)
      : '';
    d.paymentDate = allPaid ? latestVoucher?.paymentDate || '' : '';
    d.voucherNotes = latestVoucher?.voucherNotes || '';
  }

  if (item.attachment?.fileUrl && item.attachment?.fileName) {
    const duplicateFile = target.files.some(
      (f) =>
        f.url === item.attachment!.fileUrl ||
        (f.category === meta.targetTab && f.name === item.attachment!.fileName),
    );
    if (!duplicateFile) {
      target.files.push({
        id: uid(),
        name: item.attachment.fileName,
        type: item.attachment.mimeType || 'application/pdf',
        size: Number(item.attachment.fileSize || 0),
        category: meta.targetTab,
        url: item.attachment.fileUrl,
      });
    }
  }

  const prevStatus = target.status;
  const progress = deriveProgressFromTabs(target);
  target.step = progress.step;
  target.status = progress.status;
  target.due = progress.due;
  if (prevStatus !== target.status || !target.statusUpdatedAt) {
    target.statusUpdatedAt = new Date().toISOString();
  }
}
