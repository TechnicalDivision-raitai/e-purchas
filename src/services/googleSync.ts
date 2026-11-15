import type {
  AttachmentCategory,
  ProcurementState,
  ProjectRecord,
  WorkflowStep,
} from '../types/procurement';

export const DEFAULT_GOOGLE_SCRIPT_URL: string =
  (import.meta.env.VITE_GOOGLE_SCRIPT_URL as string | undefined)?.trim() ||
  'https://script.google.com/macros/s/AKfycbxSQAaWvVcrjEEnYUFnX3A8t4DBKS1m5fdfFZ8y7qJK1b75urBE7Dlcxi_OZEuYzT3m/exec';

export const DEFAULT_DRIVE_FOLDER_ID: string =
  (import.meta.env.VITE_DRIVE_FOLDER_ID as string | undefined)?.trim() || '';

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
  data?: {
    rows?: ProjectRecord[];
    projects?: ProjectRecord[];
    steps?: WorkflowStep[];
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

  if (!Array.isArray(rows) && !Array.isArray(steps)) {
    return null;
  }

  return {
    ...(Array.isArray(rows) ? { rows } : {}),
    ...(Array.isArray(steps) && steps.length > 0 ? { steps } : {}),
  };
}

export async function syncProjectsToGoogleSheet(
  state: ProcurementState,
): Promise<boolean> {
  if (!DEFAULT_GOOGLE_SCRIPT_URL) return false;

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
      rows: state.rows,
      projects: state.rows,
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
