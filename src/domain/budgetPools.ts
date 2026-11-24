import type { BudgetPool, BudgetTransfer, ProjectRecord } from '../types/procurement';
import { normalizeCodeKey } from '../utils/format';
import { isFinancialEligible } from './excel';
import { getTotalVoucherAmount } from './procurement';

export interface ProjectPoolCommitment {
  agreedAmount: number;
  reservedAmount: number;
  usedAmount: number;
  voucherAmount: number;
}

export interface BudgetPoolUsage {
  pool: BudgetPool;
  linkedProjects: ProjectRecord[];
  eligibleCount: number;
  agreedAmount: number;
  reservedAmount: number;
  usedAmount: number;
  voucherAmount: number;
  remainingAmount: number;
  utilizationPct: number;
  isOverBudget: boolean;
}

export interface CombinedFinancialOverview {
  standaloneCount: number;
  standaloneBudget: number;
  standaloneAgreed: number;
  standaloneVoucher: number;
  poolCount: number;
  poolLinkedPurchaseCount: number;
  poolAllocatedBudget: number;
  poolAgreed: number;
  poolReserved: number;
  poolUsed: number;
  poolRemaining: number;
  poolVoucher: number;
  totalBudget: number;
  totalAgreed: number;
  totalReserved: number;
  totalCommitted: number;
  totalRemaining: number;
  totalVoucher: number;
}

/**
 * Calculates how much a single drawdown purchase consumes from its BudgetPool:
 * - Excluded statuses ('พักงาน', 'ยกเลิก') consume 0.
 * - Once an agreed/contract amount (วงเงินตกลง) > 0 is recorded, that actual agreed amount
 *   replaces the reference price so any savings automatically return to the pool.
 * - While agreed === 0 (before purchase order), the reference price (ราคากลาง)
 *   is counted as reserved (กันวงเงินไว้).
 */
export function getProjectPoolCommitment(
  project: Pick<ProjectRecord, 'status' | 'reference' | 'agreed' | 'projectDetails'>,
): ProjectPoolCommitment {
  if (!isFinancialEligible(project)) {
    return {
      agreedAmount: 0,
      reservedAmount: 0,
      usedAmount: 0,
      voucherAmount: 0,
    };
  }

  const agreedAmount = Math.max(0, Number(project.agreed || 0));
  const referenceAmount = Math.max(0, Number(project.reference || 0));
  const reservedAmount = agreedAmount > 0 ? 0 : referenceAmount;
  const usedAmount = agreedAmount > 0 ? agreedAmount : reservedAmount;
  const voucherAmount = getTotalVoucherAmount(project.projectDetails);

  return {
    agreedAmount,
    reservedAmount,
    usedAmount,
    voucherAmount,
  };
}

export function calculateBudgetPoolUsage(
  pool: BudgetPool,
  allRows: ProjectRecord[],
  excludeProjectId?: string,
): BudgetPoolUsage {
  const linkedProjects = allRows.filter(
    (r) =>
      r.budgetPoolId === pool.id &&
      (!excludeProjectId || r.id !== excludeProjectId),
  );

  let eligibleCount = 0;
  let agreedAmount = 0;
  let reservedAmount = 0;
  let usedAmount = 0;
  let voucherAmount = 0;

  for (const project of linkedProjects) {
    if (!isFinancialEligible(project)) continue;
    eligibleCount += 1;
    const commitment = getProjectPoolCommitment(project);
    agreedAmount += commitment.agreedAmount;
    reservedAmount += commitment.reservedAmount;
    usedAmount += commitment.usedAmount;
    voucherAmount += commitment.voucherAmount;
  }

  const allocated = Math.max(0, Number(pool.allocatedBudget || 0));
  const remainingAmount = allocated - usedAmount;
  const utilizationPct = allocated > 0 ? (usedAmount / allocated) * 100 : 0;

  return {
    pool,
    linkedProjects,
    eligibleCount,
    agreedAmount,
    reservedAmount,
    usedAmount,
    voucherAmount,
    remainingAmount,
    utilizationPct,
    isOverBudget: remainingAmount < -0.005,
  };
}

export function calculateBudgetPoolUsageList(
  pools: BudgetPool[],
  allRows: ProjectRecord[],
  fiscalYear?: string,
  searchQuery?: string,
): BudgetPoolUsage[] {
  const q = String(searchQuery || '').trim().toLowerCase();
  const filteredPools = pools
    .filter((p) => {
      if (fiscalYear && Number(p.year) !== Number(fiscalYear)) return false;
      if (q) {
        const hay = [
          p.code,
          p.name,
          p.planName,
          p.workName,
          p.budgetType,
          p.expenseCategory,
          p.expenseSubCategory,
          p.fund,
          p.department,
          p.notes,
        ]
          .map((v) => String(v || '').toLowerCase())
          .join(' ');
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      return a.name.localeCompare(b.name, 'th');
    });

  return filteredPools.map((pool) => calculateBudgetPoolUsage(pool, allRows));
}

/**
 * Computes combined financial summary across standalone projects and lump-sum BudgetPools
 * without double-counting drawdown purchases' requested budgets against their parent pool.
 */
export function calculateCombinedFinancialOverview(
  filteredRows: ProjectRecord[],
  allRows: ProjectRecord[],
  budgetPools: BudgetPool[],
  fiscalYear?: string,
  searchQuery?: string,
): CombinedFinancialOverview {
  const poolById = new Map(budgetPools.map((p) => [p.id, p]));
  const eligibleFiltered = filteredRows.filter(isFinancialEligible);

  const standaloneRows = eligibleFiltered.filter(
    (r) => !r.budgetPoolId || !poolById.has(r.budgetPoolId),
  );
  const linkedFilteredRows = eligibleFiltered.filter(
    (r) => Boolean(r.budgetPoolId) && poolById.has(r.budgetPoolId!),
  );

  const standaloneBudget = standaloneRows.reduce(
    (sum, r) => sum + Math.max(0, Number(r.budget || 0)),
    0,
  );
  const standaloneAgreed = standaloneRows.reduce(
    (sum, r) => sum + Math.max(0, Number(r.agreed || 0)),
    0,
  );
  const standaloneVoucher = standaloneRows.reduce(
    (sum, r) => sum + getTotalVoucherAmount(r.projectDetails),
    0,
  );

  const q = String(searchQuery || '').trim().toLowerCase();
  const linkedPoolIdsInFiltered = new Set(
    linkedFilteredRows.map((r) => r.budgetPoolId!).filter(Boolean),
  );

  const relevantPools = budgetPools.filter((p) => {
    if (fiscalYear && Number(p.year) !== Number(fiscalYear)) return false;
    if (!q) return true;
    if (linkedPoolIdsInFiltered.has(p.id)) return true;
    const hay = [
      p.code,
      p.name,
      p.planName,
      p.workName,
      p.budgetType,
      p.expenseCategory,
      p.expenseSubCategory,
      p.fund,
      p.department,
      p.notes,
    ]
      .map((v) => String(v || '').toLowerCase())
      .join(' ');
    return hay.includes(q);
  });

  const poolUsages = relevantPools.map((pool) =>
    calculateBudgetPoolUsage(pool, allRows),
  );

  const poolAllocatedBudget = poolUsages.reduce(
    (sum, u) => sum + Math.max(0, Number(u.pool.allocatedBudget || 0)),
    0,
  );
  const poolAgreed = poolUsages.reduce((sum, u) => sum + u.agreedAmount, 0);
  const poolReserved = poolUsages.reduce((sum, u) => sum + u.reservedAmount, 0);
  const poolUsed = poolUsages.reduce((sum, u) => sum + u.usedAmount, 0);
  const poolVoucher = poolUsages.reduce((sum, u) => sum + u.voucherAmount, 0);
  const poolRemaining = poolAllocatedBudget - poolUsed;
  const poolLinkedPurchaseCount = poolUsages.reduce(
    (sum, u) => sum + u.eligibleCount,
    0,
  );

  const totalBudget = standaloneBudget + poolAllocatedBudget;
  const totalAgreed = standaloneAgreed + poolAgreed;
  const totalReserved = poolReserved;
  const totalCommitted = totalAgreed + totalReserved;
  const totalRemaining = totalBudget - totalCommitted;
  const totalVoucher = standaloneVoucher + poolVoucher;

  return {
    standaloneCount: standaloneRows.length,
    standaloneBudget,
    standaloneAgreed,
    standaloneVoucher,
    poolCount: poolUsages.length,
    poolLinkedPurchaseCount,
    poolAllocatedBudget,
    poolAgreed,
    poolReserved,
    poolUsed,
    poolRemaining,
    poolVoucher,
    totalBudget,
    totalAgreed,
    totalReserved,
    totalCommitted,
    totalRemaining,
    totalVoucher,
  };
}

function normalizeBudgetKey(value: string | undefined | null): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

const THAI_BUDGET_PREFIXES = [
  'รายการจัดซื้อ',
  'รายการจัดจ้าง',
  'ค่าใช้จ่าย',
  'รายจ่าย',
  'จัดซื้อ',
  'จัดจ้าง',
  'โครงการ',
  'รายการ',
  'ค่า',
  'งาน',
  'เงิน',
  'ซื้อ',
  'จ้าง',
];

function normalizeBudgetNameStem(value: string | undefined | null): {
  compact: string;
  stem: string;
  core: string;
} {
  const compact = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-_/.,()[\]{}'"`“”‘’]+/g, '');

  let stem = compact;
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of THAI_BUDGET_PREFIXES) {
      if (stem.startsWith(prefix) && stem.length - prefix.length >= 3) {
        stem = stem.slice(prefix.length);
        changed = true;
        break;
      }
    }
  }

  const core = stem.replace(/(และ|หรือ|เพื่อ|เกี่ยวกับ|สำหรับ|ด้าน)/g, '');
  return { compact, stem, core: core.length >= 3 ? core : stem };
}

function getBigramDiceSimilarity(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const bigramsA = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.slice(i, i + 2);
    bigramsA.set(bg, (bigramsA.get(bg) || 0) + 1);
  }
  let intersection = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.slice(i, i + 2);
    const count = bigramsA.get(bg) || 0;
    if (count > 0) {
      intersection += 1;
      bigramsA.set(bg, count - 1);
    }
  }
  return (2 * intersection) / (a.length - 1 + (b.length - 1));
}

export function areBudgetPoolNamesSimilar(a: string, b: string): boolean {
  const keyA = normalizeBudgetKey(a);
  const keyB = normalizeBudgetKey(b);
  if (!keyA || !keyB || keyA === keyB) return false;

  const normA = normalizeBudgetNameStem(a);
  const normB = normalizeBudgetNameStem(b);
  if (!normA.stem || !normB.stem) return false;

  // 1) Exact match after stripping prefixes/punctuation (e.g. ค่าวัสดุสำนักงาน vs วัสดุสำนักงาน)
  if (normA.stem === normB.stem || normA.core === normB.core) {
    return true;
  }

  // 2) Meaningful containment (e.g. วัสดุสำนักงาน vs ค่าวัสดุสำนักงานและเครื่องเขียน)
  const shorter =
    normA.core.length <= normB.core.length ? normA.core : normB.core;
  const longer =
    normA.core.length <= normB.core.length ? normB.core : normA.core;
  if (
    shorter.length >= 5 &&
    longer.includes(shorter) &&
    shorter.length / longer.length >= 0.45
  ) {
    return true;
  }

  // 3) Thai bigram similarity (e.g. ค่าวัสดุไฟฟ้าและวิทยุ vs ค่าวัสดุไฟฟ้าวิทยุ)
  if (normA.core.length >= 5 && normB.core.length >= 5) {
    return getBigramDiceSimilarity(normA.core, normB.core) >= 0.72;
  }

  return false;
}

export interface BudgetPoolOverlapWarning {
  type: 'same_name_other_scope' | 'similar_name';
  pools: BudgetPool[];
  message: string;
}

export interface DuplicatePoolAnalysis {
  exactDuplicateGroups: Array<{ reason: string; pools: BudgetPool[] }>;
  similarNameGroups: Array<{ year: number; pools: BudgetPool[] }>;
  exactDuplicateIds: Set<string>;
  similarIds: Set<string>;
}

export function validateBudgetPool(
  draft: Partial<BudgetPool>,
  existingPools: BudgetPool[],
  editingId?: string,
): string[] {
  const errors: string[] = [];
  const name = String(draft.name || '')
    .trim()
    .replace(/\s+/g, ' ');
  const code = String(draft.code || '')
    .trim()
    .replace(/\s+/g, ' ');
  const year = Number(draft.year);
  const allocated = Number(draft.allocatedBudget);

  if (!name) {
    errors.push('กรุณาระบุชื่อหมวดวงเงินงบประมาณ (เช่น ค่าวัสดุสำนักงาน)');
  }
  if (!Number.isInteger(year) || year < 2500 || year > 2650) {
    errors.push('ปีงบประมาณต้องอยู่ระหว่าง พ.ศ. 2500–2650');
  }
  if (!Number.isFinite(allocated) || allocated <= 0) {
    errors.push('วงเงินงบประมาณที่ตั้งไว้ต้องมากกว่า 0 บาท');
  }

  if (code) {
    const dupCode = existingPools.find(
      (p) =>
        p.id !== editingId &&
        Number(p.year) === year &&
        normalizeCodeKey(p.code) === normalizeCodeKey(code),
    );
    if (dupCode) {
      errors.push(`รหัสหมวดวงเงิน "${code}" ซ้ำกับรายการที่มีอยู่ในปีงบฯ ${year}`);
    }
  }

  const draftNameKey = normalizeBudgetKey(name);
  const draftPlan = normalizeBudgetKey(draft.planName);
  const draftWork = normalizeBudgetKey(draft.workName);
  const draftBudgetType = normalizeBudgetKey(draft.budgetType);
  const draftCat = normalizeBudgetKey(draft.expenseCategory);
  const draftSub = normalizeBudgetKey(draft.expenseSubCategory);

  const dupName = existingPools.find(
    (p) =>
      p.id !== editingId &&
      Number(p.year) === year &&
      normalizeBudgetKey(p.name) === draftNameKey &&
      normalizeBudgetKey(p.planName) === draftPlan &&
      normalizeBudgetKey(p.workName) === draftWork &&
      normalizeBudgetKey(p.budgetType) === draftBudgetType,
  );
  if (dupName) {
    errors.push(`ชื่อหมวดวงเงิน "${name}" มีอยู่แล้วในแผนงาน/งาน/งบเดียวกันของปีงบฯ ${year}`);
  } else if (draftNameKey && (draftCat || draftSub)) {
    const dupLegacyName = existingPools.find((p) => {
      if (p.id === editingId || Number(p.year) !== year) return false;
      if (normalizeBudgetKey(p.name) !== draftNameKey) return false;
      const pPlan = normalizeBudgetKey(p.planName);
      const pWork = normalizeBudgetKey(p.workName);
      const eitherMissingPlanWork = (!pPlan && !pWork) || (!draftPlan && !draftWork);
      if (!eitherMissingPlanWork) return false;
      return (
        normalizeBudgetKey(p.expenseCategory) === draftCat &&
        normalizeBudgetKey(p.expenseSubCategory) === draftSub
      );
    });
    if (dupLegacyName) {
      errors.push(
        `พบชื่อหมวดวงเงิน "${name}" ในรายจ่าย/ประเภทรายจ่ายเดียวกันของปีงบฯ ${year} แล้ว (กรุณาแก้ไขรายการเดิมแทนการเพิ่มใหม่)`,
      );
    }
  }

  return errors;
}

export function findBudgetPoolOverlapWarnings(
  draft: Partial<BudgetPool>,
  existingPools: BudgetPool[],
  editingId?: string,
): BudgetPoolOverlapWarning[] {
  const warnings: BudgetPoolOverlapWarning[] = [];
  const year = Number(draft.year);
  if (!Number.isInteger(year)) return warnings;

  const rawName = String(draft.name || '').trim();
  const draftName = normalizeBudgetKey(rawName);
  if (!draftName) return warnings;

  const draftPlan = normalizeBudgetKey(draft.planName);
  const draftWork = normalizeBudgetKey(draft.workName);
  const draftBudgetType = normalizeBudgetKey(draft.budgetType);

  const othersInYear = existingPools.filter(
    (p) => p.id !== editingId && Number(p.year) === year,
  );

  const sameNameDifferentScope = othersInYear.filter(
    (p) =>
      normalizeBudgetKey(p.name) === draftName &&
      (normalizeBudgetKey(p.planName) !== draftPlan ||
        normalizeBudgetKey(p.workName) !== draftWork ||
        normalizeBudgetKey(p.budgetType) !== draftBudgetType),
  );
  if (sameNameDifferentScope.length > 0) {
    warnings.push({
      type: 'same_name_other_scope',
      pools: sameNameDifferentScope,
      message: `มีชื่อหมวด “${rawName}” อยู่แล้ว ${sameNameDifferentScope.length} รายการในปีงบฯ ${year} (ในแผนงาน/งานอื่น) — โปรดตรวจสอบก่อนยืนยัน`,
    });
  }

  const similarPools = othersInYear.filter((p) =>
    areBudgetPoolNamesSimilar(rawName, p.name),
  );
  if (similarPools.length > 0) {
    const similarNames = similarPools.map((p) => `“${p.name}”`).join(', ');
    warnings.push({
      type: 'similar_name',
      pools: similarPools,
      message: `พบชื่อหมวดวงเงินงบประมาณที่คล้ายกันในปีงบฯ ${year}: ${similarNames} — อาจเป็นประเภทรายจ่ายเดียวกัน กรุณาตรวจสอบก่อนบันทึก`,
    });
  }

  return warnings;
}

export function findDuplicatePoolGroups(
  pools: BudgetPool[],
): DuplicatePoolAnalysis {
  const byCodeKey = new Map<string, BudgetPool[]>();
  const byExactScopeKey = new Map<string, BudgetPool[]>();

  for (const p of pools) {
    const year = Number(p.year) || 0;
    const codeKey = normalizeCodeKey(p.code);
    if (codeKey) {
      const k = `${year}::${codeKey}`;
      const list = byCodeKey.get(k) || [];
      list.push(p);
      byCodeKey.set(k, list);
    }

    const nameKey = normalizeBudgetKey(p.name);
    const planKey = normalizeBudgetKey(p.planName);
    const workKey = normalizeBudgetKey(p.workName);
    const budgetTypeKey = normalizeBudgetKey(p.budgetType);

    if (nameKey) {
      const k = `${year}::${nameKey}::${planKey}::${workKey}::${budgetTypeKey}`;
      const list = byExactScopeKey.get(k) || [];
      list.push(p);
      byExactScopeKey.set(k, list);
    }
  }

  const exactDuplicateGroups: Array<{ reason: string; pools: BudgetPool[] }> = [];
  const exactDuplicateIds = new Set<string>();

  for (const list of byCodeKey.values()) {
    if (list.length > 1) {
      exactDuplicateGroups.push({
        reason: `รหัสหมวด "${list[0].code}" ซ้ำในปีงบฯ ${list[0].year}`,
        pools: list,
      });
      list.forEach((p) => exactDuplicateIds.add(p.id));
    }
  }
  for (const list of byExactScopeKey.values()) {
    if (list.length > 1) {
      exactDuplicateGroups.push({
        reason: `ชื่อหมวด "${list[0].name}" ซ้ำในปีงบฯ ${list[0].year}`,
        pools: list,
      });
      list.forEach((p) => exactDuplicateIds.add(p.id));
    }
  }

  // Group pools with similar names in the same fiscal year via connected components
  const similarNameGroups: Array<{ year: number; pools: BudgetPool[] }> = [];
  const similarIds = new Set<string>();
  const poolsByYear = new Map<number, BudgetPool[]>();
  for (const p of pools) {
    const y = Number(p.year) || 0;
    const list = poolsByYear.get(y) || [];
    list.push(p);
    poolsByYear.set(y, list);
  }

  for (const [year, yearList] of poolsByYear.entries()) {
    const visited = new Set<string>();
    for (let i = 0; i < yearList.length; i++) {
      const start = yearList[i];
      if (visited.has(start.id)) continue;
      const component: BudgetPool[] = [start];
      visited.add(start.id);
      const queue: BudgetPool[] = [start];

      while (queue.length > 0) {
        const curr = queue.shift()!;
        for (const candidate of yearList) {
          if (visited.has(candidate.id)) continue;
          if (areBudgetPoolNamesSimilar(curr.name, candidate.name)) {
            visited.add(candidate.id);
            component.push(candidate);
            queue.push(candidate);
          }
        }
      }

      if (component.length > 1) {
        similarNameGroups.push({ year, pools: component });
        component.forEach((p) => similarIds.add(p.id));
      }
    }
  }

  return {
    exactDuplicateGroups,
    similarNameGroups,
    exactDuplicateIds,
    similarIds,
  };
}

export interface PoolTransferSummary {
  transferredIn: number;
  transferredOut: number;
  externalIn: number;
  netTransfer: number;
  count: number;
}

export function calculatePoolTransferSummary(
  poolId: string,
  transfers: BudgetTransfer[] = [],
): PoolTransferSummary {
  let transferredIn = 0;
  let transferredOut = 0;
  let externalIn = 0;
  let count = 0;

  for (const t of transfers) {
    const amt = Math.max(0, Number(t.amount || 0));
    if (amt <= 0) continue;
    let matched = false;
    if (t.toPoolId === poolId) {
      if (t.transferType === 'from_external') {
        externalIn += amt;
      } else {
        transferredIn += amt;
      }
      matched = true;
    }
    if (t.transferType === 'between_pools' && t.fromPoolId === poolId) {
      transferredOut += amt;
      matched = true;
    }
    if (matched) count += 1;
  }

  return {
    transferredIn,
    transferredOut,
    externalIn,
    netTransfer: transferredIn + externalIn - transferredOut,
    count,
  };
}

export function filterBudgetTransfers(
  transfers: BudgetTransfer[] = [],
  fiscalYear?: string,
  searchQuery?: string,
): BudgetTransfer[] {
  const q = String(searchQuery || '').trim().toLowerCase();
  return [...transfers]
    .filter((t) => {
      if (fiscalYear && Number(t.year) !== Number(fiscalYear)) return false;
      if (q) {
        const hay = [
          t.docNo,
          t.fromPoolName,
          t.externalSource,
          t.toPoolName,
          t.reason,
          t.createdBy,
          t.transferDate,
        ]
          .map((v) => String(v || '').toLowerCase())
          .join(' ');
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const dateCmp = String(b.transferDate || '').localeCompare(
        String(a.transferDate || ''),
      );
      if (dateCmp !== 0) return dateCmp;
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
}

export interface BudgetTransferValidationResult {
  errors: string[];
  sourcePool?: BudgetPool;
  sourceUsage?: BudgetPoolUsage;
  targetPool?: BudgetPool;
  targetUsage?: BudgetPoolUsage;
}

export function validateBudgetTransfer(
  draft: Partial<BudgetTransfer>,
  pools: BudgetPool[],
  allRows: ProjectRecord[],
): BudgetTransferValidationResult {
  const errors: string[] = [];
  const year = Number(draft.year);
  const amount = Number(draft.amount);
  const transferType = draft.transferType || 'between_pools';

  if (!Number.isInteger(year) || year < 2500 || year > 2650) {
    errors.push('ปีงบประมาณต้องอยู่ระหว่าง พ.ศ. 2500–2650');
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    errors.push('จำนวนเงินที่โอนต้องมากกว่า 0 บาท');
  }
  if (!String(draft.transferDate || '').trim()) {
    errors.push('กรุณาระบุวันที่โอนเงินงบประมาณ');
  }

  const targetPool = draft.toPoolId
    ? pools.find((p) => p.id === draft.toPoolId)
    : undefined;
  if (!targetPool) {
    errors.push('กรุณาเลือกหมวดงบปลายทางที่จะรับโอนเข้า');
  } else if (Number(targetPool.year) !== year) {
    errors.push(`หมวดงบปลายทาง "${targetPool.name}" ไม่ได้อยู่ในปีงบฯ ${year}`);
  }

  const targetUsage = targetPool
    ? calculateBudgetPoolUsage(targetPool, allRows)
    : undefined;

  let sourcePool: BudgetPool | undefined;
  let sourceUsage: BudgetPoolUsage | undefined;

  if (transferType === 'between_pools') {
    sourcePool = draft.fromPoolId
      ? pools.find((p) => p.id === draft.fromPoolId)
      : undefined;
    if (!sourcePool) {
      errors.push('กรุณาเลือกหมวดงบต้นทางที่จะโอนลดออก');
    } else {
      if (Number(sourcePool.year) !== year) {
        errors.push(`หมวดงบต้นทาง "${sourcePool.name}" ไม่ได้อยู่ในปีงบฯ ${year}`);
      }
      if (targetPool && sourcePool.id === targetPool.id) {
        errors.push('หมวดงบต้นทางและหมวดงบปลายทางต้องไม่ใช่หมวดเดียวกัน');
      }
      sourceUsage = calculateBudgetPoolUsage(sourcePool, allRows);
      if (Number.isFinite(amount) && amount > 0) {
        if (amount - sourceUsage.remainingAmount > 0.005) {
          errors.push(
            `วงเงินคงเหลือของหมวดต้นทาง "${sourcePool.name}" ไม่เพียงพอ (คงเหลือ ${sourceUsage.remainingAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท)`,
          );
        } else if (amount - Number(sourcePool.allocatedBudget || 0) > 0.005) {
          errors.push('จำนวนเงินที่โอนเกินวงเงินตั้งไว้ของหมวดต้นทาง');
        }
      }
    }
  } else {
    const ext = String(draft.externalSource || '').trim();
    if (!ext) {
      errors.push('กรุณาระบุแหล่งงบประมาณต้นทาง (เช่น งบกลาง, เงินสะสม)');
    }
  }

  return {
    errors,
    sourcePool,
    sourceUsage,
    targetPool,
    targetUsage,
  };
}

