import { STORAGE_KEY } from '../data/constants';
import type { CommitteeMember, ProjectRecord } from '../types/procurement';

export const PERSON_POSITIONS_STORAGE_KEY = `${STORAGE_KEY}-person-positions`;

export interface PersonPositionRecord {
  name: string;
  position: string;
  updatedAt: number;
}

export type PersonPositionStore = Record<string, PersonPositionRecord>;

export function normalizePersonName(name: string | undefined | null): string {
  return String(name || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizePersonKey(name: string | undefined | null): string {
  return normalizePersonName(name).toLowerCase();
}

export function loadPersonPositionOverrides(): PersonPositionStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(PERSON_POSITIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const result: PersonPositionStore = {};
    for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
      if (!val || typeof val !== 'object') continue;
      const entry = val as Partial<PersonPositionRecord>;
      const cleanName = normalizePersonName(entry.name || key);
      const cleanPos = normalizePersonName(entry.position);
      const normKey = normalizePersonKey(cleanName);
      if (!normKey || !cleanPos) continue;
      result[normKey] = {
        name: cleanName,
        position: cleanPos,
        updatedAt: Number(entry.updatedAt) || 0,
      };
    }
    return result;
  } catch {
    return {};
  }
}

export function persistPersonPositionOverrides(store: PersonPositionStore): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PERSON_POSITIONS_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore localStorage quota errors
  }
}

export function savePersonPositionOverrides(
  entries: Array<{ name: string; position: string }>,
  updatedAt: number = Date.now(),
): PersonPositionStore {
  const current = loadPersonPositionOverrides();
  let changed = false;

  for (const item of entries) {
    const cleanName = normalizePersonName(item.name);
    const cleanPos = normalizePersonName(item.position);
    const key = normalizePersonKey(cleanName);
    if (!key || !cleanPos) continue;

    current[key] = {
      name: cleanName,
      position: cleanPos,
      updatedAt,
    };
    changed = true;
  }

  if (changed) {
    persistPersonPositionOverrides(current);
  }
  return current;
}

function getProjectRecencyMs(project: ProjectRecord): number {
  const history = project.history || [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const t = Date.parse(history[i]?.at || '');
    if (Number.isFinite(t)) return t;
  }
  if (project.statusUpdatedAt) {
    const t = Date.parse(project.statusUpdatedAt);
    if (Number.isFinite(t)) return t;
  }
  if (project.start) {
    const t = Date.parse(project.start);
    if (Number.isFinite(t)) return t;
  }
  const yearCe = Number(project.year) > 2400 ? Number(project.year) - 543 : Number(project.year);
  if (Number.isFinite(yearCe) && yearCe > 1900) {
    return Date.UTC(yearCe, 0, 1);
  }
  return 0;
}

export function buildPersonPositionMap(
  rows: ProjectRecord[],
  draftMembers: CommitteeMember[] = [],
  overrides: PersonPositionStore = loadPersonPositionOverrides(),
): Map<string, string> {
  const best = new Map<string, { position: string; updatedAt: number }>();

  const consider = (name: string | undefined, position: string | undefined, ts: number) => {
    const key = normalizePersonKey(name);
    const cleanPos = normalizePersonName(position);
    if (!key || !cleanPos) return;
    const prev = best.get(key);
    if (!prev || ts >= prev.updatedAt) {
      best.set(key, { position: cleanPos, updatedAt: ts });
    }
  };

  // 1) รวบรวมประวัติชื่อ -> ตำแหน่งจากทุกโครงการ โดยเรียงตามเวลาอัปเดต (โครงการที่ใหม่กว่าทับของเก่ากว่า)
  const indexedRows = rows.map((row, idx) => ({
    row,
    idx,
    ts: getProjectRecencyMs(row),
  }));
  indexedRows.sort((a, b) => a.ts - b.ts || a.idx - b.idx);

  for (const { row, ts } of indexedRows) {
    for (const m of row.projectDetails?.torMembers || []) {
      consider(m.name, m.position, ts);
    }
    for (const m of row.projectDetails?.acceptanceMembers || []) {
      consider(m.name, m.position, ts);
    }
  }

  // 2) เติมจากรายชื่อในฟอร์มที่กำลังแก้ไข (กรณีเป็นชื่อใหม่ที่ยังไม่เคยบันทึกมาก่อน)
  for (const m of draftMembers) {
    const key = normalizePersonKey(m.name);
    const cleanPos = normalizePersonName(m.position);
    if (!key || !cleanPos) continue;
    if (!best.has(key)) {
      best.set(key, { position: cleanPos, updatedAt: 0 });
    }
  }

  // 3) ยึดตำแหน่งที่ผู้ใช้แก้ไขล่าสุดเป็นลำดับแรก (เมื่อ updatedAt ใหม่กว่าหรือเท่ากับประวัติโครงการ)
  for (const [key, rec] of Object.entries(overrides)) {
    const normKey = normalizePersonKey(rec.name || key);
    const cleanPos = normalizePersonName(rec.position);
    if (!normKey || !cleanPos) continue;
    const prev = best.get(normKey);
    if (!prev || rec.updatedAt >= prev.updatedAt) {
      best.set(normKey, { position: cleanPos, updatedAt: rec.updatedAt });
    }
  }

  const map = new Map<string, string>();
  for (const [key, entry] of best.entries()) {
    map.set(key, entry.position);
  }
  return map;
}

export function lookupPersonPosition(
  map: Map<string, string>,
  name: string | undefined | null,
): string {
  const key = normalizePersonKey(name);
  if (!key) return '';
  return map.get(key) || '';
}
