import type { BudgetPool, ProjectRecord } from '../types/procurement';
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

export interface BudgetPoolOverlapWarning {
  type: 'same_name_other_scope' | 'same_hierarchy';
  pools: BudgetPool[];
  message: string;
}

export interface DuplicatePoolAnalysis {
  exactDuplicateGroups: Array<{ reason: string; pools: BudgetPool[] }>;
  hierarchyOverlapGroups: Array<{ pathLabel: string; pools: BudgetPool[] }>;
  exactDuplicateIds: Set<string>;
  overlapIds: Set<string>;
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
        `พบชื่อหมวดวงเงิน "${name}" ในหมวด/ประเภทค่าใช้จ่ายเดียวกันของปีงบฯ ${year} แล้ว (กรุณาแก้ไขรายการเดิมแทนการเพิ่มใหม่)`,
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

  const draftName = normalizeBudgetKey(draft.name);
  const draftPlan = normalizeBudgetKey(draft.planName);
  const draftWork = normalizeBudgetKey(draft.workName);
  const draftBudgetType = normalizeBudgetKey(draft.budgetType);
  const draftCat = normalizeBudgetKey(draft.expenseCategory);
  const draftSub = normalizeBudgetKey(draft.expenseSubCategory);

  const othersInYear = existingPools.filter(
    (p) => p.id !== editingId && Number(p.year) === year,
  );

  if (draftName) {
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
        message: `มีชื่อหมวด "${String(draft.name || '').trim()}" อยู่แล้ว ${sameNameDifferentScope.length} รายการในปีงบฯ ${year} (ในแผนงาน/งานอื่น) — โปรดตรวจสอบว่าไม่ใช่งบประมาณซ้ำกัน`,
      });
    }
  }

  if (draftCat && draftSub) {
    const sameHierarchy = othersInYear.filter(
      (p) =>
        normalizeBudgetKey(p.planName) === draftPlan &&
        normalizeBudgetKey(p.workName) === draftWork &&
        normalizeBudgetKey(p.budgetType) === draftBudgetType &&
        normalizeBudgetKey(p.expenseCategory) === draftCat &&
        normalizeBudgetKey(p.expenseSubCategory) === draftSub &&
        normalizeBudgetKey(p.name) !== draftName,
    );
    if (sameHierarchy.length > 0) {
      const existingNames = sameHierarchy
        .map((p) => `“${p.name}”`)
        .join(', ');
      warnings.push({
        type: 'same_hierarchy',
        pools: sameHierarchy,
        message: `ลำดับขั้น 5 ระดับนี้มีวงเงินตั้งไว้แล้วในปีงบฯ ${year}: ${existingNames} — หากเป็นงบคนละรายการย่อยสามารถบันทึกต่อได้ แต่หากเป็นงบเดียวกันควรแก้ไขรายการเดิมเพื่อไม่ให้นับวงเงินซ้ำ`,
      });
    }
  }

  return warnings;
}

export function findDuplicatePoolGroups(
  pools: BudgetPool[],
): DuplicatePoolAnalysis {
  const byCodeKey = new Map<string, BudgetPool[]>();
  const byExactScopeKey = new Map<string, BudgetPool[]>();
  const byHierarchyKey = new Map<string, { pathLabel: string; pools: BudgetPool[] }>();

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
    const catKey = normalizeBudgetKey(p.expenseCategory);
    const subKey = normalizeBudgetKey(p.expenseSubCategory);

    if (nameKey) {
      const k = `${year}::${nameKey}::${planKey}::${workKey}::${budgetTypeKey}`;
      const list = byExactScopeKey.get(k) || [];
      list.push(p);
      byExactScopeKey.set(k, list);
    }

    if (catKey && subKey) {
      const k = `${year}::${planKey}::${workKey}::${budgetTypeKey}::${catKey}::${subKey}`;
      const existing = byHierarchyKey.get(k);
      const pathLabel = [
        p.planName,
        p.workName,
        p.budgetType,
        p.expenseCategory,
        p.expenseSubCategory,
      ]
        .map((v) => String(v || '').trim())
        .filter(Boolean)
        .join(' › ');
      if (existing) {
        existing.pools.push(p);
      } else {
        byHierarchyKey.set(k, { pathLabel, pools: [p] });
      }
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

  const hierarchyOverlapGroups: Array<{ pathLabel: string; pools: BudgetPool[] }> = [];
  const overlapIds = new Set<string>();
  for (const entry of byHierarchyKey.values()) {
    if (entry.pools.length > 1) {
      const allExactSame = entry.pools.every((p) => exactDuplicateIds.has(p.id));
      if (!allExactSame) {
        hierarchyOverlapGroups.push(entry);
        entry.pools.forEach((p) => overlapIds.add(p.id));
      }
    }
  }

  return {
    exactDuplicateGroups,
    hierarchyOverlapGroups,
    exactDuplicateIds,
    overlapIds,
  };
}
