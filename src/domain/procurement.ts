import {
  ACCEPTANCE_RESULTS,
  COMMITTEE_ROLES,
  MAX_PROJECT_ATTACHMENT_BYTES,
  PROJECT_TYPES,
  STATUSES,
  TERMINAL_STATUSES,
  USERS,
} from '../data/constants';
import type {
  AcceptanceRound,
  AttachmentCategory,
  CommitteeMember,
  ProjectDetails,
  ProjectRecord,
  ProjectStatus,
  SortDirection,
  SortKey,
  UserAccount,
  WorkflowStep,
} from '../types/procurement';
import { isValidIsoDate, todayBangkok } from '../utils/date';
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

export function getStepName(steps: WorkflowStep[], stepId: string): string {
  return steps.find((s) => s.id === stepId)?.name || stepId;
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

  if (!STATUSES.includes(project.status as ProjectStatus)) {
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

  const current = steps.find((s) => s.id === project.step);
  if (current && !current.next.includes(nextStepId) && nextStepId !== project.step) {
    throw new Error('เส้นทางนี้ไม่ได้รับอนุญาต');
  }

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
};

export function getAttachmentMeta(
  file: { name: string; type: string; size: number },
  category: AttachmentCategory = 'general',
): { name: string; type: string; size: number } {
  const ext = String(file.name).split('.').pop()?.toLowerCase() || '';
  const isDocCategory = ['tor', 'acceptance', 'order', 'voucher'].includes(category);
  const allowed = isDocCategory
    ? ['pdf', 'xlsx', 'xls', 'docx', 'doc']
    : ['pdf', 'png', 'jpg', 'jpeg'];

  if (
    !allowed.includes(ext) ||
    (file.type && file.type !== 'application/octet-stream' && file.type !== ATTACHMENT_MIME_TYPES[ext])
  ) {
    throw new Error(
      isDocCategory
        ? 'รองรับไฟล์เอกสารเฉพาะ PDF, Excel (.xlsx/.xls), Word (.docx/.doc)'
        : 'รองรับเฉพาะ PDF, PNG และ JPG',
    );
  }

  if (!file.size || file.size > MAX_PROJECT_ATTACHMENT_BYTES) {
    throw new Error('ไฟล์ต้องมีข้อมูลและขนาดไม่เกิน 2 MB');
  }

  return {
    name: file.name,
    type: ATTACHMENT_MIME_TYPES[ext],
    size: file.size,
  };
}

export function createAcceptanceDraft(details: ProjectDetails = {}): {
  members: CommitteeMember[];
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
    rounds: structuredClone(rounds),
  };
}
