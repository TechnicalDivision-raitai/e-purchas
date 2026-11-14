import type {
  AcceptanceResult,
  AttachmentCategory,
  CommitteeRole,
  PageId,
  ProcurementState,
  ProjectRecord,
  ProjectStatus,
  ProjectTabId,
  ProjectType,
  SortKey,
  UserAccount,
  ViewFilter,
  WorkflowStep,
} from '../types/procurement';

export const STORAGE_KEY = 'procurement-single-html-v2';
export const VIEW_STORAGE_KEY = `${STORAGE_KEY}-views`;
export const SESSION_USER_KEY = 'raitai_procurement_session_user';

export const DEFAULT_DEPARTMENT = 'กองช่าง';
export const MAX_PROJECT_ATTACHMENT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_TOTAL_ROWS = 5000;
export const BASE64_CHUNK_SIZE = 30000;

export const USERS: UserAccount[] = [
  { id: 'admin', name: 'แอดมิน (ผู้ดูแลระบบ)', role: 'admin' },
  { id: 'staff', name: 'เจ้าหน้าที่ (ดูข้อมูลอย่างเดียว)', role: 'staff' },
];

export const ADMIN_PASSWORD =
  (import.meta.env.VITE_ADMIN_PASSWORD as string | undefined)?.trim() ||
  '12345';

export const STATUSES: ProjectStatus[] = [
  'รอดำเนินการ',
  'กำลังดำเนินการ',
  'รออนุมัติ',
  'ส่งกลับแก้ไข',
  'พักงาน',
  'เสร็จสิ้น',
  'ยกเลิก',
];

export const TERMINAL_STATUSES: ProjectStatus[] = ['เสร็จสิ้น', 'ยกเลิก'];
export const FINANCIAL_EXCLUDED_STATUSES: ProjectStatus[] = ['พักงาน', 'ยกเลิก'];

export const PROJECT_TYPES: ProjectType[] = ['ซื้อ', 'จ้าง', 'อื่น ๆ'];

export const COMMITTEE_ROLES: CommitteeRole[] = [
  'ประธานกรรมการ',
  'กรรมการ',
  'กรรมการและเลขานุการ',
];

export const ACCEPTANCE_RESULTS: AcceptanceResult[] = [
  'ตรวจรับถูกต้องครบถ้วน',
  'ตรวจรับบางส่วน',
  'ให้แก้ไขก่อนตรวจรับ',
  'ไม่ผ่านการตรวจรับ',
];

export const ATTACHMENT_CATEGORIES: AttachmentCategory[] = [
  'general',
  'tor',
  'order',
  'acceptance',
  'voucher',
];

export const PAGE_TITLES: Record<PageId, [string, string]> = {
  dashboard: [
    'ภาพรวมงานจัดซื้อจัดจ้าง',
    'ติดตามโครงการ งบประมาณ และงานที่ต้องดำเนินการในที่เดียว',
  ],
  inbox: [
    'กล่องงานของฉัน',
    'งานที่มอบหมายให้บัญชีผู้ใช้ปัจจุบัน · ไม่รวมเสร็จสิ้นและยกเลิก',
  ],
  register: [
    'ทะเบียนโครงการทั้งหมด',
    'จัดการข้อมูลโครงการ เอกสาร และประวัติการดำเนินงาน',
  ],
  overdue: [
    'งานเกินกำหนด',
    'งานคงค้างที่เลยกำหนดเสร็จ ตามวันที่ในเขตเวลา Asia/Bangkok',
  ],
  excel: [
    'นำเข้า / ส่งออก Excel',
    'รองรับทะเบียนโครงการแบบ Upsert · เพิ่มรายการใหม่หรืออัปเดตตามรหัสโครงการ',
  ],
};

export const NAV_ITEMS: Array<{
  id: PageId;
  label: string;
  dividerBefore?: boolean;
}> = [
  { id: 'dashboard', label: 'ภาพรวม' },
  { id: 'inbox', label: 'กล่องงานของฉัน' },
  { id: 'register', label: 'ทะเบียนโครงการทั้งหมด' },
  { id: 'overdue', label: 'งานเกินกำหนด' },
  { id: 'excel', label: 'นำเข้า / ส่งออก Excel', dividerBefore: true },
];

export const PROJECT_TABS: Array<{
  id: ProjectTabId;
  label: string;
  heading: string;
  description: string;
}> = [
  {
    id: 'general',
    label: 'ข้อมูลทั่วไป',
    heading: 'ข้อมูลทั่วไปของโครงการ',
    description: 'กรอกข้อมูลพื้นฐาน งบประมาณ และรายละเอียดโครงการ',
  },
  {
    id: 'tor',
    label: 'TOR และราคากลาง',
    heading: 'ข้อมูลการจัดทำ TOR และราคากลาง',
    description: 'บันทึกคำสั่งแต่งตั้ง คณะกรรมการจัดทำแบบรูปรายการและกำหนดราคากลาง',
  },
  {
    id: 'order',
    label: 'สั่งซื้อสั่งจ้าง',
    heading: 'สั่งซื้อสั่งจ้าง',
    description: 'ข้อมูลใบสั่งซื้อ / สั่งจ้าง และผู้ขายหรือผู้รับจ้าง',
  },
  {
    id: 'acceptance',
    label: 'ตั้งกรรมการและตรวจรับ',
    heading: 'ตั้งคณะกรรมการและตรวจรับ',
    description: 'บันทึกคำสั่งแต่งตั้งคณะกรรมการตรวจรับ และผลการตรวจรับแต่ละครั้ง',
  },
  {
    id: 'voucher',
    label: 'ฎีกา',
    heading: 'ฎีกา',
    description: 'ข้อมูลเอกสารฎีกาและการเบิกจ่าย',
  },
];

export const TABLE_COLUMNS: Array<{
  key: SortKey;
  label: string;
  width: number;
}> = [
  { key: 'code', label: 'เลขทะเบียน', width: 118 },
  { key: 'year', label: 'ปีงบฯ', width: 76 },
  { key: 'title', label: 'ชื่อโครงการ / หน่วยงาน', width: 280 },
  { key: 'docNo', label: 'เลขที่เอกสาร', width: 120 },
  { key: 'docDate', label: 'วันที่เอกสาร', width: 110 },
  { key: 'budget', label: 'งบประมาณ (บาท)', width: 130 },
  { key: 'agreed', label: 'วงเงินตกลง (บาท)', width: 130 },
  { key: 'responsibleName', label: 'ผู้รับผิดชอบ', width: 145 },
  { key: 'step', label: 'ขั้นตอน', width: 165 },
  { key: 'status', label: 'สถานะ', width: 135 },
  { key: 'due', label: 'กำหนดเสร็จ', width: 112 },
];

export const DEFAULT_STEP_NAMES: string[] = [
  'รับคำขอซื้อ/ขอจ้าง',
  'เตรียมรายละเอียดและเอกสาร',
  'เสนอขออนุมัติดำเนินการ',
  'ดำเนินการจัดซื้อจัดจ้าง',
  'จัดทำสัญญา / ใบสั่ง',
  'ส่งมอบและตรวจรับ',
  'เตรียมเอกสารเบิกจ่าย',
  'ปิดงาน',
];

export function createDefaultSteps(): WorkflowStep[] {
  return DEFAULT_STEP_NAMES.map((name, i) => ({
    id: `s${i + 1}`,
    name,
    next: [
      ...(i > 0 ? [`s${i}`] : []),
      ...(i < DEFAULT_STEP_NAMES.length - 1 ? [`s${i + 2}`] : []),
    ],
    roles: ['admin'],
    required: [],
    condition: 'ใช้กับโครงการตัวอย่างทุกประเภท',
    documents: [],
  }));
}

export function createSeedState(): ProcurementState {
  return {
    version: 2,
    steps: createDefaultSteps(),
    rows: [],
  };
}

export const DEFAULT_VIEW_FILTER: ViewFilter = {
  year: '',
  status: '',
  q: '',
  sort: 'code',
  dir: 'desc',
};

export function createExampleRecord(firstStepId: string): ProjectRecord {
  return {
    id: 'example',
    code: 'ตัวอย่าง-2570-001',
    year: 2570,
    title: 'ตัวอย่างจัดซื้อวัสดุสำนักงาน (ลบตัวอย่างก่อนใช้จริง)',
    department: DEFAULT_DEPARTMENT,
    type: 'ซื้อ',
    method: 'เฉพาะเจาะจง',
    fund: 'งบประมาณรายจ่าย',
    budget: 50000,
    reference: 49000,
    agreed: 48000,
    responsibleName: 'ชื่อผู้รับผิดชอบตัวอย่าง',
    assignee: 'admin',
    vendor: 'ผู้ขายตัวอย่าง',
    start: '2026-11-01',
    due: '',
    docNo: 'PO-001',
    docDate: '2026-11-04',
    notes: 'รายละเอียดโครงการตัวอย่าง',
    status: 'รอดำเนินการ',
    step: firstStepId,
    ack: false,
    files: [],
    stageData: {},
    history: [],
    projectDetails: {
      torOrderNo: '142/2570',
      torOrderDate: '2026-11-02',
      torPreparedDate: '2026-11-03',
      torMembers: [
        {
          name: 'กรรมการ TOR ตัวอย่าง',
          position: 'นายช่าง',
          role: 'ประธานกรรมการ',
        },
      ],
      committeeNo: '185/2570',
      committeeDate: '2026-11-05',
      acceptanceMembers: [
        {
          name: 'กรรมการตรวจรับตัวอย่าง',
          position: 'เจ้าหน้าที่',
          role: 'กรรมการ',
        },
      ],
      acceptanceRounds: [
        {
          round: 1,
          date: '2026-11-10',
          result: 'ตรวจรับถูกต้องครบถ้วน',
          notes: 'ผลตรวจรับตัวอย่าง',
        },
      ],
      voucherNo: 'V-001',
      voucherDate: '2026-11-11',
      voucherAmount: 48000,
      paymentDate: '2026-11-12',
      voucherNotes: 'รายละเอียดฎีกาตัวอย่าง',
    },
  };
}
