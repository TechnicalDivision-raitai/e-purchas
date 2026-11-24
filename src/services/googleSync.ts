import { SARABAN_ALLOWED_CATEGORIES } from '../data/constants';
import type {
  AttachmentCategory,
  BudgetPool,
  ExpenseCategoryGroup,
  ProcurementState,
  ProjectRecord,
  SarabanDocCategory,
  SarabanQueueItem,
  SarabanQueueStatus,
  WorkflowStep,
} from '../types/procurement';

export const DEFAULT_GOOGLE_SCRIPT_URL: string =
  (import.meta.env.VITE_GOOGLE_SCRIPT_URL as string | undefined)?.trim() ||
  'https://script.google.com/macros/s/AKfycbxSQAaWvVcrjEEnYUFnX3A8t4DBKS1m5fdfFZ8y7qJK1b75urBE7Dlcxi_OZEuYzT3m/exec';

export const DEFAULT_DRIVE_FOLDER_ID: string =
  (import.meta.env.VITE_DRIVE_FOLDER_ID as string | undefined)?.trim() ||
  '1wyP35kgPzxgKWJN8nggjc4b6QIfsvcNN';

export const PROCUREMENT_SHEET_NAME = 'ทะเบียนจัดซื้อจัดจ้าง';

export function isGoogleSyncConfigured(): boolean {
  return Boolean(DEFAULT_GOOGLE_SCRIPT_URL);
}

interface GoogleSheetPullResponse {
  status?: string;
  success?: boolean;
  projects?: ProjectRecord[];
  rows?: ProjectRecord[];
  steps?: WorkflowStep[];
  budgetPools?: BudgetPool[];
  expenseCategories?: ExpenseCategoryGroup[];
  data?: {
    rows?: ProjectRecord[];
    projects?: ProjectRecord[];
    steps?: WorkflowStep[];
    budgetPools?: BudgetPool[];
    expenseCategories?: ExpenseCategoryGroup[];
  };
  error?: string;
  message?: string;
}

interface DriveUploadResponse {
  status?: string;
  success?: boolean;
  url?: string;
  webViewLink?: string;
  fileUrl?: string;
  fileId?: string;
  id?: string;
  error?: string;
  message?: string;
}

export async function fetchProjectsFromGoogleSheet(): Promise<Partial<ProcurementState> | null> {
  if (!DEFAULT_GOOGLE_SCRIPT_URL) return null;

  const url = new URL(DEFAULT_GOOGLE_SCRIPT_URL);
  url.searchParams.set('action', 'fetch');
  url.searchParams.set('sheetName', PROCUREMENT_SHEET_NAME);

  const response = await fetch(url.toString(), {
    method: 'GET',
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`ดึงข้อมูล Google Sheet ไม่สำเร็จ (HTTP ${response.status})`);
  }

  const payload = (await response.json()) as GoogleSheetPullResponse;
  if (payload.error) {
    throw new Error(payload.error);
  }

  const rows =
    payload.rows ||
    payload.projects ||
    payload.data?.rows ||
    payload.data?.projects;

  const steps = payload.steps || payload.data?.steps;
  const budgetPools = payload.budgetPools || payload.data?.budgetPools;
  const expenseCategories =
    payload.expenseCategories || payload.data?.expenseCategories;

  if (
    !Array.isArray(rows) &&
    !Array.isArray(steps) &&
    !Array.isArray(budgetPools) &&
    !Array.isArray(expenseCategories)
  ) {
    return null;
  }

  return {
    ...(Array.isArray(rows) ? { rows } : {}),
    ...(Array.isArray(steps) && steps.length > 0 ? { steps } : {}),
    ...(Array.isArray(budgetPools) ? { budgetPools } : {}),
    ...(Array.isArray(expenseCategories) && expenseCategories.length > 0
      ? { expenseCategories }
      : {}),
  };
}

export async function syncProjectsToGoogleSheet(
  state: ProcurementState,
): Promise<boolean> {
  if (!DEFAULT_GOOGLE_SCRIPT_URL) return false;

  const sanitizedRows = state.rows.map((row) => ({
    ...row,
    files: (row.files || []).map((f) => {
      if (f.data && f.data.length > 35000) {
        const { data: _omitted, ...rest } = f;
        return rest;
      }
      return f;
    }),
  }));

  const response = await fetch(DEFAULT_GOOGLE_SCRIPT_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({
      action: 'sync',
      sheetName: PROCUREMENT_SHEET_NAME,
      version: state.version,
      steps: state.steps,
      rows: sanitizedRows,
      projects: sanitizedRows,
      budgetPools: state.budgetPools || [],
      ...(Array.isArray(state.expenseCategories) && state.expenseCategories.length > 0
        ? { expenseCategories: state.expenseCategories }
        : {}),
      syncedAt: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    throw new Error(`ซิงค์ Google Sheet ไม่สำเร็จ (HTTP ${response.status})`);
  }

  const payload = (await response.json()) as GoogleSheetPullResponse;
  if (payload.error || payload.success === false || payload.status === 'error') {
    throw new Error(payload.error || payload.message || 'ซิงค์ข้อมูลไม่สำเร็จ');
  }

  return true;
}

export async function uploadFileToGoogleDrive(
  file: File,
  base64Content: string,
  category: AttachmentCategory,
  projectCode: string,
): Promise<{ url: string; driveFileId?: string } | null> {
  if (!DEFAULT_GOOGLE_SCRIPT_URL) return null;

  const response = await fetch(DEFAULT_GOOGLE_SCRIPT_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({
      action: 'uploadFile',
      folderId: DEFAULT_DRIVE_FOLDER_ID,
      category,
      projectCode,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      base64Data: base64Content,
    }),
  });

  if (!response.ok) {
    throw new Error(`อัปโหลดไฟล์ขึ้น Google Drive ไม่สำเร็จ (HTTP ${response.status})`);
  }

  const payload = (await response.json()) as DriveUploadResponse;
  if (payload.error || payload.success === false || payload.status === 'error') {
    throw new Error(payload.error || payload.message || 'อัปโหลดไฟล์ไม่สำเร็จ');
  }

  const fileUrl = payload.url || payload.webViewLink || payload.fileUrl;
  if (!fileUrl) return null;

  return {
    url: fileUrl,
    driveFileId: payload.fileId || payload.id,
  };
}

interface SarabanQueueResponse {
  status?: string;
  success?: boolean;
  pendingCount?: number;
  data?: Array<Partial<SarabanQueueItem>>;
  error?: string;
  message?: string;
}

function isAllowedSarabanCategory(cat: unknown): cat is SarabanDocCategory {
  return SARABAN_ALLOWED_CATEGORIES.includes(cat as SarabanDocCategory);
}

export async function fetchSarabanQueue(
  queueStatus: SarabanQueueStatus | 'all' = 'all',
): Promise<{ pendingCount: number; data: SarabanQueueItem[] }> {
  if (!DEFAULT_GOOGLE_SCRIPT_URL) {
    return { pendingCount: 0, data: [] };
  }

  const url = new URL(DEFAULT_GOOGLE_SCRIPT_URL);
  url.searchParams.set('action', 'getProcurementQueue');
  url.searchParams.set('queueStatus', queueStatus);
  url.searchParams.set('t', String(Date.now()));

  const response = await fetch(url.toString(), {
    method: 'GET',
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`ดึงคิวจากสารบรรณไม่สำเร็จ (HTTP ${response.status})`);
  }

  const payload = (await response.json()) as SarabanQueueResponse;
  if (payload.error || payload.status === 'error') {
    throw new Error(payload.error || payload.message || 'ดึงคิวจากสารบรรณไม่สำเร็จ');
  }

  const rawList = Array.isArray(payload.data) ? payload.data : [];
  const data: SarabanQueueItem[] = rawList
    .filter((item) => isAllowedSarabanCategory(item.docCategory))
    .map((item) => ({
      queueId: String(item.queueId || ''),
      idempotencyKey: String(item.idempotencyKey || ''),
      procurementId: String(item.procurementId || ''),
      projectCode: String(item.projectCode || ''),
      fiscalYear: Number(item.fiscalYear || 0),
      docCategory: item.docCategory as SarabanDocCategory,
      bookNo: String(item.bookNo || ''),
      bookDate: String(item.bookDate || '').slice(0, 10),
      subject: String(item.subject || ''),
      payload: item.payload || {},
      attachment: item.attachment || null,
      queueStatus: (item.queueStatus || 'pending') as SarabanQueueStatus,
      reviewedBy: String(item.reviewedBy || ''),
      reviewedAt: String(item.reviewedAt || ''),
      rejectReason: String(item.rejectReason || ''),
      createdAt: String(item.createdAt || ''),
      submittedBy: String(item.submittedBy || ''),
    }));

  const pendingCount =
    typeof payload.pendingCount === 'number'
      ? payload.pendingCount
      : data.filter((item) => item.queueStatus === 'pending').length;

  return { pendingCount, data };
}

export async function reviewSarabanQueueItem(params: {
  queueId: string;
  idempotencyKey?: string;
  queueStatus: 'approved' | 'rejected';
  reviewedBy: string;
  rejectReason?: string;
}): Promise<boolean> {
  if (!DEFAULT_GOOGLE_SCRIPT_URL) return false;

  const response = await fetch(DEFAULT_GOOGLE_SCRIPT_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({
      action: 'reviewProcurementQueue',
      queueId: params.queueId,
      idempotencyKey: params.idempotencyKey || '',
      queueStatus: params.queueStatus,
      reviewedBy: params.reviewedBy,
      reviewedAt: new Date().toISOString(),
      rejectReason: params.rejectReason || '',
    }),
  });

  if (!response.ok) {
    throw new Error(`อัปเดตสถานะคิวสารบรรณไม่สำเร็จ (HTTP ${response.status})`);
  }

  const payload = (await response.json()) as SarabanQueueResponse;
  if (payload.error || payload.status === 'error') {
    throw new Error(
      payload.error || payload.message || 'อัปเดตสถานะคิวสารบรรณไม่สำเร็จ',
    );
  }

  return true;
}

export async function deleteSarabanQueueItem(
  queueId: string,
  idempotencyKey?: string,
): Promise<boolean> {
  if (!DEFAULT_GOOGLE_SCRIPT_URL) return false;

  const response = await fetch(DEFAULT_GOOGLE_SCRIPT_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({
      action: 'deleteProcurementQueue',
      queueId,
      idempotencyKey: idempotencyKey || '',
    }),
  });

  if (!response.ok) {
    throw new Error(`ลบคิวจากสารบรรณไม่สำเร็จ (HTTP ${response.status})`);
  }

  const payload = (await response.json()) as SarabanQueueResponse & {
    deleted?: boolean;
  };
  if (payload.error || payload.status === 'error') {
    throw new Error(payload.error || payload.message || 'ลบคิวจากสารบรรณไม่สำเร็จ');
  }

  return true;
}
