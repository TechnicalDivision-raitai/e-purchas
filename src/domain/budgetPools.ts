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
        const hay = [p.code, p.name, p.fund, p.department, p.notes]
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
    const hay = [p.code, p.name, p.fund, p.department, p.notes]
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

export function validateBudgetPool(
  draft: Partial<BudgetPool>,
  existingPools: BudgetPool[],
  editingId?: string,
): string[] {
  const errors: string[] = [];
  const name = String(draft.name || '').trim();
  const code = String(draft.code || '').trim();
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

  const dupName = existingPools.find(
    (p) =>
      p.id !== editingId &&
      Number(p.year) === year &&
      p.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (dupName) {
    errors.push(`ชื่อหมวดวงเงิน "${name}" มีอยู่แล้วในปีงบฯ ${year}`);
  }

  return errors;
}
