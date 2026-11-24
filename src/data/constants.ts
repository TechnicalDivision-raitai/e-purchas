import type {
  AcceptanceResult,
  AttachmentCategory,
  CommitteeRole,
  ExpenseCategoryGroup,
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
export const MAX_PROJECT_ATTACHMENT_BYTES = 50 * 1024 * 1024;
export const MAX_IMPORT_FILE_BYTES = 50 * 1024 * 1024;
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
  'รอจัดทำTOR และราคากลาง',
  'อยู่ระหว่างสั่งซื้อสั่งจ้าง',
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
    'แสดงโครงการที่เริ่มบันทึกข้อมูลในแท็บ 2. TOR และราคากลาง แล้ว · ไม่รวมเสร็จสิ้นและยกเลิก',
  ],
  register: [
    'ทะเบียนโครงการทั้งหมด',
    'จัดการข้อมูลโครงการ เอกสาร และประวัติการดำเนินงาน',
  ],
  budgets: [
    'BUDGET DATA',
    'กำหนดวงเงินงบประมาณประจำปีแบบ 5 ระดับ (แผนงาน / งาน / งบ / หมวด / ประเภทค่าใช้จ่าย) และติดตามยอดใช้จ่ายคงเหลือ',
  ],
  overdue: [
    'งานเกินกำหนด',
    'งานคงค้างที่เลยกำหนดเสร็จ ตามวันที่ในเขตเวลา Asia/Bangkok',
  ],
  saraban: [
    'รับข้อมูลจากระบบสารบรรณ',
    'คิวเอกสารเชื่อมโยง 4 หมวดหมู่: ขออนุมัติ (ข้อมูลทั่วไป), แต่งตั้ง กก. TOR, จัดทำ TOR และราคากลาง, และฎีกาเบิกจ่าย (2-Way Sync)',
  ],
  excel: [
    'นำเข้า / ส่งออก Excel',
    'รองรับทะเบียนโครงการแบบ Upsert · เพิ่มรายการใหม่หรืออัปเดตตามรหัสโครงการ',
  ],
};

export const DEFAULT_EXPENSE_CATEGORIES: ExpenseCategoryGroup[] = [
  {
    id: 'cat-materials',
    name: 'ค่าวัสดุ',
    subCategories: [
      'วัสดุสำนักงาน',
      'วัสดุไฟฟ้าและวิทยุ',
      'วัสดุก่อสร้าง',
      'วัสดุเชื้อเพลิงและหล่อลื่น',
      'วัสดุงานบ้านงานครัว',
      'วัสดุยานพาหนะและขนส่ง',
      'วัสดุคอมพิวเตอร์',
      'วัสดุการเกษตร',
      'วัสดุโฆษณาและเผยแพร่',
      'วัสดุเครื่องแต่งกาย',
      'วัสดุอื่น ๆ',
    ],
  },
  {
    id: 'cat-equipment',
    name: 'ค่าครุภัณฑ์',
    subCategories: [
      'ครุภัณฑ์สำนักงาน',
      'ครุภัณฑ์คอมพิวเตอร์หรืออิเล็กทรอนิกส์',
      'ครุภัณฑ์ยานพาหนะและขนส่ง',
      'ครุภัณฑ์ก่อสร้าง',
      'ครุภัณฑ์ไฟฟ้าและวิทยุ',
      'ครุภัณฑ์การเกษตร',
      'ครุภัณฑ์สำรวจ',
      'ครุภัณฑ์โฆษณาและเผยแพร่',
      'ครุภัณฑ์โรงงาน',
      'ครุภัณฑ์อื่น ๆ',
    ],
  },
  {
    id: 'cat-services',
    name: 'ค่าใช้สอย',
    subCategories: [
      'ค่าบำรุงรักษาและซ่อมแซม',
      'ค่าจ้างเหมาบริการ',
      'ค่าเช่าทรัพย์สิน',
      'รายจ่ายเกี่ยวเนื่องกับการปฏิบัติราชการ',
      'ค่าใช้สอยอื่น ๆ',
    ],
  },
  {
    id: 'cat-construction',
    name: 'ค่าที่ดินและสิ่งก่อสร้าง',
    subCategories: [
      'งานก่อสร้างทาง / ถนน',
      'งานก่อสร้างอาคาร',
      'งานก่อสร้างระบบระบายน้ำ / ประปา',
      'งานปรับปรุงและต่อเติมสิ่งก่อสร้าง',
      'ค่าที่ดินและสิ่งก่อสร้างอื่น ๆ',
    ],
  },
  {
    id: 'cat-compensation',
    name: 'ค่าตอบแทน',
    subCategories: [
      'ค่าตอบแทนผู้ปฏิบัติราชการอันเป็นประโยชน์แก่องค์กรปกครองส่วนท้องถิ่น',
      'ค่าตอบแทนการปฏิบัติงานนอกเวลาราชการ',
      'ค่าเช่าบ้านข้าราชการ/พนักงานส่วนท้องถิ่น',
      'ค่าตอบแทนอื่น ๆ',
    ],
  },
  {
    id: 'cat-utilities',
    name: 'ค่าสาธารณูปโภค',
    subCategories: [
      'ค่าไฟฟ้า',
      'ค่าน้ำประปา',
      'ค่าโทรศัพท์ / อินเทอร์เน็ต',
      'ค่าบริการไปรษณีย์',
    ],
  },
];

export const BUDGET_PLAN_PRESETS: string[] = [
  'แผนงานอุตสาหกรรมและการโยธา',
  'แผนงานเคหะและชุมชน',
  'แผนงานบริหารงานทั่วไป',
  'แผนงานการเกษตร',
  'แผนงานสร้างความเข้มแข็งของชุมชน',
  'แผนงานสาธารณสุข',
  'แผนงานการศึกษา',
  'แผนงานการศาสนา วัฒนธรรม และนันทนาการ',
  'แผนงานรักษาความสงบภายใน',
  'แผนงานงบกลาง',
];

export const BUDGET_WORK_PRESETS: string[] = [
  'งานบริหารงานทั่วไปเกี่ยวกับอุตสาหกรรมและการโยธา',
  'งานก่อสร้าง',
  'งานบริหารงานทั่วไปเกี่ยวกับเคหะและชุมชน',
  'งานไฟฟ้าถนน',
  'งานกำจัดขยะมูลฝอยและสิ่งปฏิกูล',
  'งานบริหารทั่วไป',
  'งานวางแผนสถิติและวิชาการ',
  'งานส่งเสริมการเกษตร',
  'งานป้องกันและบรรเทาสาธารณภัย',
  'งานงบกลาง',
];

export const BUDGET_GROUP_PRESETS: string[] = [
  'งบดำเนินงาน',
  'งบลงทุน',
  'งบบุคลากร',
  'งบเงินอุดหนุน',
  'งบกลาง',
];

export const BUDGET_GROUP_TO_CATEGORIES: Record<string, string[]> = {
  งบดำเนินงาน: ['ค่าตอบแทน', 'ค่าใช้สอย', 'ค่าวัสดุ', 'ค่าสาธารณูปโภค'],
  งบลงทุน: ['ค่าครุภัณฑ์', 'ค่าที่ดินและสิ่งก่อสร้าง'],
  งบบุคลากร: ['เงินเดือน (ฝ่ายการเมือง)', 'เงินเดือน (ฝ่ายประจำ)'],
  งบเงินอุดหนุน: ['เงินอุดหนุน'],
  งบกลาง: ['งบกลาง'],
};

export const BUDGET_POOL_PRESETS: string[] = [
  'ค่าวัสดุสำนักงาน',
  'ค่าวัสดุก่อสร้าง',
  'ค่าวัสดุไฟฟ้าและวิทยุ',
  'ค่าวัสดุเชื้อเพลิงและหล่อลื่น',
  'ค่าวัสดุงานบ้านงานครัว',
  'ค่าวัสดุยานพาหนะและขนส่ง',
  'ค่าบำรุงรักษาและซ่อมแซม',
];

export const SARABAN_ALLOWED_CATEGORIES = [
  'general_approval',
  'tor_order',
  'tor_approval',
  'ref_price',
  'disbursement',
] as const;

export const SARABAN_PRIMARY_CATEGORIES = [
  'general_approval',
  'tor_order',
  'tor_approval',
  'disbursement',
] as const;

export const SARABAN_CATEGORY_META: Record<
  (typeof SARABAN_ALLOWED_CATEGORIES)[number],
  {
    label: string;
    groupLabel: string;
    targetTab: ProjectTabId;
  }
> = {
  general_approval: {
    label: 'ขออนุมัติ (ข้อมูลทั่วไป)',
    groupLabel: 'ข้อมูลทั่วไป',
    targetTab: 'general',
  },
  tor_order: {
    label: 'แต่งตั้งผู้รับผิดชอบ TOR และราคากลาง',
    groupLabel: 'จัดทำ TOR',
    targetTab: 'tor',
  },
  tor_approval: {
    label: 'จัดทำ TOR และราคากลาง',
    groupLabel: 'จัดทำ TOR',
    targetTab: 'tor',
  },
  ref_price: {
    label: 'จัดทำ TOR และราคากลาง (ราคากลาง)',
    groupLabel: 'ราคากลาง',
    targetTab: 'tor',
  },
  disbursement: {
    label: 'ฎีกาเบิกจ่ายเงิน',
    groupLabel: 'ฎีกาเบิกจ่าย',
    targetTab: 'voucher',
  },
};

export const NAV_ITEMS: Array<{
  id: PageId;
  label: string;
  dividerBefore?: boolean;
}> = [
  { id: 'dashboard', label: 'ภาพรวม' },
  { id: 'inbox', label: 'กล่องงานของฉัน' },
  { id: 'register', label: 'ทะเบียนโครงการทั้งหมด' },
  { id: 'budgets', label: 'BUDGET DATA' },
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
    description: 'กรอกข้อมูลพื้นฐาน เลือกหมวดงบประมาณประจำปี (BUDGET DATA) และรายละเอียดโครงการ',
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
    label: 'การส่งมอบและการตรวจรับ',
    heading: 'การส่งมอบและการตรวจรับ',
    description: 'บันทึกคำสั่งแต่งตั้งคณะกรรมการตรวจรับ การส่งมอบงาน และผลการตรวจรับแต่ละครั้ง',
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
  width: string;
  sortable?: boolean;
}> = [
  { key: 'code', label: 'เลขทะเบียน', width: '10%', sortable: true },
  { key: 'year', label: 'ปีงบฯ', width: '6%', sortable: true },
  { key: 'title', label: 'ชื่อโครงการ / หน่วยงาน', width: '24%', sortable: true },
  { key: 'responsibleName', label: 'ผู้รับผิดชอบ', width: '11%', sortable: false },
  { key: 'agreed', label: 'วงเงินตกลง (บาท)', width: '11%', sortable: false },
  { key: 'vendor', label: 'ผู้ขาย / ผู้รับจ้าง', width: '15%', sortable: false },
  { key: 'status', label: 'สถานะ', width: '11%', sortable: false },
];

export const DEFAULT_STEP_NAMES: string[] = PROJECT_TABS.map(
  (tab, idx) => `${idx + 1}. ${tab.label}`,
);

export function createDefaultSteps(): WorkflowStep[] {
  const allIds = DEFAULT_STEP_NAMES.map((_, i) => `s${i + 1}`);
  return DEFAULT_STEP_NAMES.map((name, i) => {
    const id = `s${i + 1}`;
    return {
      id,
      name,
      next: allIds.filter((otherId) => otherId !== id),
      roles: ['admin'],
      required: [],
      condition: 'อ้างอิงตามแท็บหลักของโครงการ',
      documents: [],
    };
  });
}

export function createSeedState(): ProcurementState {
  return {
    version: 2,
    steps: createDefaultSteps(),
    rows: [],
    budgetPools: [],
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
    status: 'รอจัดทำTOR และราคากลาง',
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
