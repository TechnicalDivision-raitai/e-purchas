export type UserRole = 'admin' | 'staff';

export interface UserAccount {
  id: string;
  name: string;
  role: UserRole;
}

export type PageId =
  | 'dashboard'
  | 'inbox'
  | 'register'
  | 'overdue'
  | 'saraban'
  | 'excel';

export type ProjectTabId =
  | 'general'
  | 'tor'
  | 'order'
  | 'acceptance'
  | 'voucher';

export type ProjectStatus =
  | 'รอจัดทำTOR และราคากลาง'
  | 'อยู่ระหว่างสั่งซื้อสั่งจ้าง'
  | 'รอดำเนินการ'
  | 'กำลังดำเนินการ'
  | 'รออนุมัติ'
  | 'ส่งกลับแก้ไข'
  | 'พักงาน'
  | 'เสร็จสิ้น'
  | 'ยกเลิก';

export type ProjectType = 'ซื้อ' | 'จ้าง' | 'อื่น ๆ';

export type CommitteeRole = 'ประธานกรรมการ' | 'กรรมการ' | 'กรรมการและเลขานุการ';

export type AcceptanceResult =
  | 'ตรวจรับถูกต้องครบถ้วน'
  | 'ตรวจรับบางส่วน'
  | 'ให้แก้ไขก่อนตรวจรับ'
  | 'ไม่ผ่านการตรวจรับ';

export type AttachmentCategory = 'general' | 'tor' | 'order' | 'acceptance' | 'voucher';

export interface WorkflowStep {
  id: string;
  name: string;
  next: string[];
  roles: UserRole[];
  required: Array<keyof ProjectRecord>;
  condition?: string;
  documents?: string[];
}

export interface CommitteeMember {
  sequence?: number;
  name: string;
  position: string;
  role: CommitteeRole;
}

export interface AcceptanceRound {
  sequence?: number;
  round: number;
  date: string;
  result: AcceptanceResult | '';
  notes: string;
}

export interface DeliveryRound {
  sequence?: number;
  round: number;
  docNo: string;
  date: string;
  notes: string;
}

export interface VoucherEntry {
  sequence?: number;
  round: number;
  voucherNo: string;
  voucherDate: string;
  voucherAmount: number | '';
  paymentDate: string;
  voucherNotes: string;
}

export interface AttachmentFile {
  id: string;
  name: string;
  type: string;
  size: number;
  category: AttachmentCategory;
  data?: string; // Data URL (data:...;base64,...) for local/offline fallback
  url?: string; // Google Drive webViewLink / download URL
  driveFileId?: string;
}

export interface StageDataEntry {
  docNo: string;
  docDate: string;
  start: string;
  due: string;
  finished: string;
}

export interface HistoryEntry {
  at: string;
  by: string;
  action: string;
}

export interface ProjectDetails {
  torOrderNo?: string;
  torOrderDate?: string;
  torPreparedDate?: string;
  torDate?: string;
  referenceDate?: string;
  torNo?: string;
  torAuthor?: string;
  torNotes?: string;
  torMembers?: CommitteeMember[];
  deliveryDue?: string;
  orderNotes?: string;
  installmentCount?: number | '';
  cancelledRounds?: number[];
  installmentCancelReason?: string;
  committeeNo?: string;
  committeeDate?: string;
  committeeNames?: string;
  acceptanceNo?: string;
  acceptanceDate?: string;
  acceptanceNotes?: string;
  acceptanceMembers?: CommitteeMember[];
  deliveryRounds?: DeliveryRound[];
  acceptanceRounds?: AcceptanceRound[];
  voucherEntries?: VoucherEntry[];
  voucherNo?: string;
  voucherDate?: string;
  voucherAmount?: number | '';
  paymentDate?: string;
  voucherNotes?: string;
}

export interface ProjectRecord {
  id: string;
  code: string;
  year: number;
  title: string;
  department: string;
  responsibleName: string;
  type: ProjectType;
  method: string;
  fund: string;
  budget: number;
  reference: number;
  agreed: number;
  assignee: string;
  vendor: string;
  start: string;
  due: string;
  docNo: string;
  docDate: string;
  notes: string;
  status: ProjectStatus;
  step: string;
  ack: boolean;
  ackAt?: string;
  statusUpdatedAt?: string;
  manualStatusOverride?: boolean;
  projectDetails: ProjectDetails;
  stageData: Record<string, StageDataEntry>;
  files: AttachmentFile[];
  history: HistoryEntry[];
}

export interface ProcurementState {
  version: number;
  steps: WorkflowStep[];
  rows: ProjectRecord[];
}

export type SortDirection = 'asc' | 'desc';

export type SortKey =
  | 'code'
  | 'year'
  | 'title'
  | 'vendor'
  | 'docNo'
  | 'docDate'
  | 'budget'
  | 'agreed'
  | 'responsibleName'
  | 'step'
  | 'status'
  | 'due';

export interface ViewFilter {
  year: string;
  status: string;
  q: string;
  sort: SortKey;
  dir: SortDirection;
}

export interface FinancialSums {
  budget: number;
  reference: number;
  agreed: number;
  voucher: number;
}

export interface ImportErrorItem {
  sheet: string;
  row: number;
  code: string;
  message: string;
}

export interface ImportPreviewItem {
  record: ProjectRecord;
  mode: 'insert' | 'update';
  existingId?: string;
  hasAttachmentRows: boolean;
}

export interface ImportPlan {
  items: ImportPreviewItem[];
  good: ProjectRecord[];
  insertCount: number;
  updateCount: number;
  errors: ImportErrorItem[];
  badProjects: number;
  years: Record<number, number>;
  totalRows: number;
  targetYear: string;
}

export type SyncState = 'idle' | 'syncing' | 'synced' | 'local' | 'error';

export type SarabanDocCategory =
  | 'tor_order'
  | 'tor_approval'
  | 'ref_price'
  | 'disbursement';

export type SarabanQueueStatus = 'pending' | 'approved' | 'rejected';

export interface SarabanAttachment {
  fileName: string;
  fileUrl: string;
  fileSize?: number;
  mimeType?: string;
}

export interface SarabanQueuePayload {
  assigneeName?: string;
  notes?: string;
  torAuthor?: string;
  details?: string;
  refPrice?: number;
  installment?: number;
  amount?: number;
  status?: 'pending' | 'paid';
  voucherNo?: string;
}

export interface SarabanQueueItem {
  queueId: string;
  idempotencyKey: string;
  procurementId: string;
  projectCode: string;
  fiscalYear: number;
  docCategory: SarabanDocCategory;
  bookNo: string;
  bookDate: string;
  subject: string;
  payload: SarabanQueuePayload;
  attachment?: SarabanAttachment | null;
  queueStatus: SarabanQueueStatus;
  reviewedBy: string;
  reviewedAt: string;
  rejectReason: string;
  createdAt: string;
  submittedBy: string;
}
