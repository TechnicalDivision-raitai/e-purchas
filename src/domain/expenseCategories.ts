import { DEFAULT_EXPENSE_CATEGORIES } from '../data/constants';
import type {
  BudgetPool,
  ExpenseCategoryGroup,
  ProjectRecord,
} from '../types/procurement';
import type { BudgetPoolUsage } from './budgetPools';
import { isFinancialEligible } from './excel';
import { getTotalVoucherAmount } from './procurement';

export const UNSPECIFIED_EXPENSE_CATEGORY = 'ยังไม่ระบุหมวดค่าใช้จ่าย';
export const UNSPECIFIED_EXPENSE_SUBCATEGORY = 'ไม่ระบุประเภทย่อย';

function normalizeLabel(value: string | undefined | null): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Returns the active 2-level expense catalog combining:
 * 1) User-managed custom catalog (if present) or default Thai municipal presets
 * 2) Any extra categories / sub-categories already entered on existing projects or BUDGET DATA pools
 */
export function getEffectiveExpenseCatalog(
  customCatalog: ExpenseCategoryGroup[] | undefined,
  rows: ProjectRecord[] = [],
  budgetPools: BudgetPool[] = [],
): ExpenseCategoryGroup[] {
  const baseSource =
    Array.isArray(customCatalog) && customCatalog.length > 0
      ? customCatalog
      : DEFAULT_EXPENSE_CATEGORIES;

  const groups: ExpenseCategoryGroup[] = [];
  const byNameLower = new Map<string, ExpenseCategoryGroup>();

  const ensureGroup = (nameRaw: string, preferredId?: string): ExpenseCategoryGroup | null => {
    const clean = normalizeLabel(nameRaw);
    if (!clean) return null;
    const key = clean.toLowerCase();
    const existing = byNameLower.get(key);
    if (existing) return existing;
    const created: ExpenseCategoryGroup = {
      id: preferredId || `cat-${groups.length + 1}-${clean}`,
      name: clean,
      subCategories: [],
    };
    groups.push(created);
    byNameLower.set(key, created);
    return created;
  };

  const addSub = (group: ExpenseCategoryGroup, subRaw: string | undefined) => {
    const cleanSub = normalizeLabel(subRaw);
    if (!cleanSub) return;
    const exists = group.subCategories.some(
      (s) => s.toLowerCase() === cleanSub.toLowerCase(),
    );
    if (!exists) {
      group.subCategories.push(cleanSub);
    }
  };

  for (const item of baseSource) {
    const g = ensureGroup(item.name, item.id);
    if (!g) continue;
    for (const sub of item.subCategories || []) {
      addSub(g, sub);
    }
  }

  for (const pool of budgetPools) {
    const g = ensureGroup(pool.expenseCategory || '');
    if (g && pool.expenseSubCategory) {
      addSub(g, pool.expenseSubCategory);
    }
  }

  for (const row of rows) {
    const g = ensureGroup(row.expenseCategory || '');
    if (g && row.expenseSubCategory) {
      addSub(g, row.expenseSubCategory);
    }
  }

  return groups;
}

export function getSubCategoriesForCategory(
  catalog: ExpenseCategoryGroup[],
  categoryName: string | undefined,
): string[] {
  const clean = normalizeLabel(categoryName).toLowerCase();
  if (!clean) {
    // If no main category chosen yet, return unique list of all sub-categories
    const seen = new Set<string>();
    const all: string[] = [];
    for (const group of catalog) {
      for (const sub of group.subCategories) {
        const key = sub.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          all.push(sub);
        }
      }
    }
    return all;
  }

  const matched = catalog.find((g) => g.name.toLowerCase() === clean);
  return matched ? [...matched.subCategories] : [];
}

export function findParentCategoryForSubCategory(
  catalog: ExpenseCategoryGroup[],
  subCategoryName: string | undefined,
): string | null {
  const clean = normalizeLabel(subCategoryName).toLowerCase();
  if (!clean) return null;
  const matched = catalog.find((g) =>
    g.subCategories.some((s) => s.toLowerCase() === clean),
  );
  return matched ? matched.name : null;
}

export function resolveProjectExpenseClassification(
  project: Pick<
    ProjectRecord,
    'expenseCategory' | 'expenseSubCategory' | 'budgetPoolId'
  >,
  poolById: Map<string, BudgetPool>,
): { category: string; subCategory: string } {
  const linkedPool = project.budgetPoolId
    ? poolById.get(project.budgetPoolId)
    : undefined;

  const category =
    normalizeLabel(project.expenseCategory) ||
    normalizeLabel(linkedPool?.expenseCategory);
  const subCategory =
    normalizeLabel(project.expenseSubCategory) ||
    normalizeLabel(linkedPool?.expenseSubCategory);

  return { category, subCategory };
}

export function formatExpenseClassification(
  category: string | undefined,
  subCategory: string | undefined,
): string {
  const c = normalizeLabel(category);
  const s = normalizeLabel(subCategory);
  if (c && s) return `${c} › ${s}`;
  return c || s || '';
}

export function suggestPoolNameFromSubCategory(
  category: string | undefined,
  subCategory: string | undefined,
): string {
  const sub = normalizeLabel(subCategory);
  if (!sub) return normalizeLabel(category);
  if (sub.startsWith('ค่า') || sub.startsWith('งาน') || sub.startsWith('รายจ่าย')) {
    return sub;
  }
  return `ค่า${sub}`;
}

export interface ExpenseSubCategoryPoolRef {
  id: string;
  year: number;
  code: string;
  name: string;
}

export interface ExpenseSubCategorySummary {
  name: string;
  budget: number;
  agreed: number;
  reserved: number;
  voucher: number;
  projectCount: number;
  poolCount: number;
  years: number[];
  pools: ExpenseSubCategoryPoolRef[];
}

export interface ExpenseCategorySummary {
  name: string;
  isUnspecified: boolean;
  budget: number;
  agreed: number;
  reserved: number;
  voucher: number;
  projectCount: number;
  poolCount: number;
  subCategories: ExpenseSubCategorySummary[];
}

/**
 * Aggregates budgets, agreed amounts, reserved amounts, and counts into a
 * 2-level hierarchy: หมวดค่าใช้จ่าย -> ประเภทย่อย
 * without double-counting drawdown purchases against their parent BUDGET DATA pool.
 */
export function buildExpenseHierarchySummary(
  filteredRows: ProjectRecord[],
  poolUsages: BudgetPoolUsage[],
  allBudgetPools: BudgetPool[],
): ExpenseCategorySummary[] {
  const poolById = new Map(allBudgetPools.map((p) => [p.id, p]));
  const eligibleRows = filteredRows.filter(isFinancialEligible);

  interface MutableCategory {
    name: string;
    isUnspecified: boolean;
    budget: number;
    agreed: number;
    reserved: number;
    voucher: number;
    projectCount: number;
    poolCount: number;
    subs: Map<string, ExpenseSubCategorySummary>;
  }

  const map = new Map<string, MutableCategory>();

  const getOrCreate = (
    catRaw: string,
    subRaw: string,
  ): { cat: MutableCategory; sub: ExpenseSubCategorySummary } => {
    const cleanCat = normalizeLabel(catRaw);
    const isUnspecified = !cleanCat;
    const catName = cleanCat || UNSPECIFIED_EXPENSE_CATEGORY;
    const subName = normalizeLabel(subRaw) || UNSPECIFIED_EXPENSE_SUBCATEGORY;

    let cat = map.get(catName);
    if (!cat) {
      cat = {
        name: catName,
        isUnspecified,
        budget: 0,
        agreed: 0,
        reserved: 0,
        voucher: 0,
        projectCount: 0,
        poolCount: 0,
        subs: new Map(),
      };
      map.set(catName, cat);
    }

    let sub = cat.subs.get(subName);
    if (!sub) {
      sub = {
        name: subName,
        budget: 0,
        agreed: 0,
        reserved: 0,
        voucher: 0,
        projectCount: 0,
        poolCount: 0,
        years: [],
        pools: [],
      };
      cat.subs.set(subName, sub);
    }

    return { cat, sub };
  };

  const addYear = (sub: ExpenseSubCategorySummary, rawYear: unknown) => {
    const yearNum = Number(rawYear);
    if (Number.isFinite(yearNum) && yearNum > 0 && !sub.years.includes(yearNum)) {
      sub.years.push(yearNum);
    }
  };

  // 1) Standalone projects (not linked to a BUDGET DATA pool)
  for (const row of eligibleRows) {
    if (row.budgetPoolId && poolById.has(row.budgetPoolId)) continue;
    const { category, subCategory } = resolveProjectExpenseClassification(
      row,
      poolById,
    );
    const { cat, sub } = getOrCreate(category, subCategory);
    const budget = Math.max(0, Number(row.budget || 0));
    const agreed = Math.max(0, Number(row.agreed || 0));
    const voucher = getTotalVoucherAmount(row.projectDetails);

    cat.budget += budget;
    cat.agreed += agreed;
    cat.voucher += voucher;
    cat.projectCount += 1;

    sub.budget += budget;
    sub.agreed += agreed;
    sub.voucher += voucher;
    sub.projectCount += 1;
    addYear(sub, row.year);
  }

  // 2) BUDGET DATA pools (counted once at pool level, including their linked drawdown usage)
  for (const usage of poolUsages) {
    const { pool } = usage;
    const { cat, sub } = getOrCreate(
      pool.expenseCategory || '',
      pool.expenseSubCategory || '',
    );
    const allocated = Math.max(0, Number(pool.allocatedBudget || 0));

    cat.budget += allocated;
    cat.agreed += usage.agreedAmount;
    cat.reserved += usage.reservedAmount;
    cat.voucher += usage.voucherAmount;
    cat.poolCount += 1;
    cat.projectCount += usage.eligibleCount;

    sub.budget += allocated;
    sub.agreed += usage.agreedAmount;
    sub.reserved += usage.reservedAmount;
    sub.voucher += usage.voucherAmount;
    sub.poolCount += 1;
    sub.projectCount += usage.eligibleCount;
    addYear(sub, pool.year);
    sub.pools.push({
      id: pool.id,
      year: Number(pool.year) || 0,
      code: String(pool.code || '').trim(),
      name: String(pool.name || '').trim(),
    });
  }

  return Array.from(map.values())
    .map((c) => ({
      name: c.name,
      isUnspecified: c.isUnspecified,
      budget: c.budget,
      agreed: c.agreed,
      reserved: c.reserved,
      voucher: c.voucher,
      projectCount: c.projectCount,
      poolCount: c.poolCount,
      subCategories: Array.from(c.subs.values())
        .map((sub) => ({
          ...sub,
          years: [...sub.years].sort((a, b) => b - a),
        }))
        .sort((a, b) => {
          if (a.name === UNSPECIFIED_EXPENSE_SUBCATEGORY) return 1;
          if (b.name === UNSPECIFIED_EXPENSE_SUBCATEGORY) return -1;
          if (b.budget !== a.budget) return b.budget - a.budget;
          return a.name.localeCompare(b.name, 'th');
        }),
    }))
    .sort((a, b) => {
      if (a.isUnspecified !== b.isUnspecified) return a.isUnspecified ? 1 : -1;
      if (b.budget !== a.budget) return b.budget - a.budget;
      return a.name.localeCompare(b.name, 'th');
    });
}
