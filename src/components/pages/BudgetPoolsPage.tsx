import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FolderTree,
  Layers,
  Pencil,
  Plus,
  ShoppingBag,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  BUDGET_GROUP_PRESETS,
  BUDGET_GROUP_TO_CATEGORIES,
  BUDGET_PLAN_PRESETS,
  BUDGET_WORK_PRESETS,
  DEFAULT_DEPARTMENT,
} from '../../data/constants';
import {
  calculateBudgetPoolUsageList,
  findBudgetPoolOverlapWarnings,
  findDuplicatePoolGroups,
  getProjectPoolCommitment,
  validateBudgetPool,
  type BudgetPoolUsage,
} from '../../domain/budgetPools';
import {
  findParentCategoryForSubCategory,
  formatBudgetHierarchyPath,
  getEffectiveExpenseCatalog,
  getSubCategoriesForCategory,
  suggestPoolNameFromSubCategory,
  UNSPECIFIED_EXPENSE_CATEGORY,
} from '../../domain/expenseCategories';
import { getTotalVoucherAmount } from '../../domain/procurement';
import { useProcurement } from '../../storage/useProcurementStore';
import type { BudgetPool } from '../../types/procurement';
import { currentFiscalYear, getFiscalYearOptions, uid } from '../../utils/date';
import { formatMoney } from '../../utils/format';
import {
  AutoSuggestInput,
  collectNormalizedSuggestions,
} from '../common/AutoSuggestInput';
import { StatusBadge } from '../common/StatusBadge';
import { ExpenseCategoriesModal } from '../modals/ExpenseCategoriesModal';

interface BudgetPoolsPageProps {
  onCreatePurchaseFromPool: (poolId: string) => void;
  onViewProject: (id: string) => void;
  onEditProject: (id: string) => void;
}

interface PoolDraft {
  id: string;
  year: number;
  code: string;
  planName: string;
  workName: string;
  budgetType: string;
  expenseCategory: string;
  expenseSubCategory: string;
  name: string;
  fund: string;
  department: string;
  allocatedBudget: string;
  notes: string;
}

function createEmptyPoolDraft(defaultYear: number): PoolDraft {
  return {
    id: '',
    year: defaultYear,
    code: '',
    planName: '',
    workName: '',
    budgetType: 'งบดำเนินงาน',
    expenseCategory: 'ค่าวัสดุ',
    expenseSubCategory: '',
    name: '',
    fund: 'งบประมาณรายจ่าย',
    department: DEFAULT_DEPARTMENT,
    allocatedBudget: '',
    notes: '',
  };
}

export function BudgetPoolsPage({
  onCreatePurchaseFromPool,
  onViewProject,
  onEditProject,
}: BudgetPoolsPageProps) {
  const {
    state,
    user,
    viewFilter,
    saveBudgetPool,
    deleteBudgetPool,
    showToast,
  } = useProcurement();

  const isAdmin = user.role === 'admin';
  const budgetPools = state.budgetPools || [];

  const [expandedPoolIds, setExpandedPoolIds] = useState<Record<string, boolean>>({});
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPoolId, setEditingPoolId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PoolDraft>(() =>
    createEmptyPoolDraft(
      viewFilter.year ? Number(viewFilter.year) : currentFiscalYear(),
    ),
  );
  const [formError, setFormError] = useState('');
  const [confirmOverlapSave, setConfirmOverlapSave] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BudgetPoolUsage | null>(null);
  const [confirmUnlinkOnDelete, setConfirmUnlinkOnDelete] = useState(false);

  useEffect(() => {
    setConfirmOverlapSave(false);
  }, [
    modalOpen,
    draft.name,
    draft.year,
    draft.planName,
    draft.workName,
    draft.budgetType,
  ]);

  const expenseCatalog = useMemo(
    () =>
      getEffectiveExpenseCatalog(
        state.expenseCategories,
        state.rows,
        budgetPools,
      ),
    [state.expenseCategories, state.rows, budgetPools],
  );

  const planSuggestions = useMemo(
    () =>
      collectNormalizedSuggestions([
        ...BUDGET_PLAN_PRESETS,
        ...budgetPools.map((p) => p.planName),
        ...state.rows.map((r) => r.planName),
      ]),
    [budgetPools, state.rows],
  );

  const workSuggestions = useMemo(
    () =>
      collectNormalizedSuggestions([
        ...BUDGET_WORK_PRESETS,
        ...budgetPools
          .filter(
            (p) =>
              !draft.planName.trim() ||
              !p.planName ||
              p.planName.trim().toLowerCase() ===
                draft.planName.trim().toLowerCase(),
          )
          .map((p) => p.workName),
        ...budgetPools.map((p) => p.workName),
        ...state.rows.map((r) => r.workName),
      ]),
    [budgetPools, state.rows, draft.planName],
  );

  const budgetTypeSuggestions = useMemo(
    () =>
      collectNormalizedSuggestions([
        ...BUDGET_GROUP_PRESETS,
        ...budgetPools.map((p) => p.budgetType),
        ...state.rows.map((r) => r.budgetType),
      ]),
    [budgetPools, state.rows],
  );

  const mainCategorySuggestions = useMemo(() => {
    const preferred =
      BUDGET_GROUP_TO_CATEGORIES[draft.budgetType.trim()] || [];
    return collectNormalizedSuggestions([
      ...preferred,
      ...expenseCatalog.map((g) => g.name),
    ]);
  }, [expenseCatalog, draft.budgetType]);

  const draftSubCategorySuggestions = useMemo(
    () => getSubCategoriesForCategory(expenseCatalog, draft.expenseCategory),
    [expenseCatalog, draft.expenseCategory],
  );

  const allUsages = useMemo(
    () =>
      calculateBudgetPoolUsageList(
        budgetPools,
        state.rows,
        viewFilter.year,
        viewFilter.q,
      ),
    [budgetPools, state.rows, viewFilter.year, viewFilter.q],
  );

  const duplicateAnalysis = useMemo(
    () => findDuplicatePoolGroups(budgetPools),
    [budgetPools],
  );

  const draftLiveChecks = useMemo(() => {
    if (!modalOpen) {
      return { duplicateErrors: [] as string[], overlapWarnings: [] as ReturnType<typeof findBudgetPoolOverlapWarnings> };
    }
    const previewPool: Partial<BudgetPool> = {
      year: Number(draft.year) || currentFiscalYear(),
      code: draft.code.trim(),
      planName: draft.planName.trim(),
      workName: draft.workName.trim(),
      budgetType: draft.budgetType.trim(),
      expenseCategory: draft.expenseCategory.trim(),
      expenseSubCategory: draft.expenseSubCategory.trim(),
      name: draft.name.trim(),
      allocatedBudget: Number(draft.allocatedBudget) || 1,
    };
    const duplicateErrors = validateBudgetPool(
      previewPool,
      budgetPools,
      editingPoolId || undefined,
    ).filter((err) => err.includes('ซ้ำ') || err.includes('มีอยู่แล้ว'));
    const overlapWarnings = findBudgetPoolOverlapWarnings(
      previewPool,
      budgetPools,
      editingPoolId || undefined,
    );
    return { duplicateErrors, overlapWarnings };
  }, [modalOpen, draft, budgetPools, editingPoolId]);

  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of allUsages) {
      const cat = u.pool.expenseCategory?.trim() || UNSPECIFIED_EXPENSE_CATEGORY;
      map.set(cat, (map.get(cat) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === UNSPECIFIED_EXPENSE_CATEGORY) return 1;
      if (b[0] === UNSPECIFIED_EXPENSE_CATEGORY) return -1;
      return b[1] - a[1];
    });
  }, [allUsages]);

  const usages = useMemo(() => {
    if (!categoryFilter) return allUsages;
    return allUsages.filter((u) => {
      const cat = u.pool.expenseCategory?.trim() || UNSPECIFIED_EXPENSE_CATEGORY;
      return cat === categoryFilter;
    });
  }, [allUsages, categoryFilter]);

  const fundSuggestions = useMemo(
    () =>
      collectNormalizedSuggestions([
        'งบประมาณรายจ่าย',
        'เงินอุดหนุนทั่วไป',
        'เงินสะสม',
        ...state.rows.map((r) => r.fund),
        ...budgetPools.map((p) => p.fund),
      ]),
    [state.rows, budgetPools],
  );

  const summary = useMemo(() => {
    const totalAllocated = usages.reduce(
      (s, u) => s + Math.max(0, Number(u.pool.allocatedBudget || 0)),
      0,
    );
    const totalAgreed = usages.reduce((s, u) => s + u.agreedAmount, 0);
    const totalReserved = usages.reduce((s, u) => s + u.reservedAmount, 0);
    const totalUsed = usages.reduce((s, u) => s + u.usedAmount, 0);
    const totalVoucher = usages.reduce((s, u) => s + u.voucherAmount, 0);
    const totalRemaining = totalAllocated - totalUsed;
    const totalPurchases = usages.reduce((s, u) => s + u.eligibleCount, 0);
    const overBudgetCount = usages.filter((u) => u.isOverBudget).length;
    return {
      totalAllocated,
      totalAgreed,
      totalReserved,
      totalUsed,
      totalVoucher,
      totalRemaining,
      totalPurchases,
      overBudgetCount,
    };
  }, [usages]);

  const toggleExpand = (poolId: string) => {
    setExpandedPoolIds((prev) => ({ ...prev, [poolId]: !prev[poolId] }));
  };

  const openCreateModal = () => {
    if (!isAdmin) return;
    setEditingPoolId(null);
    setDraft(
      createEmptyPoolDraft(
        viewFilter.year ? Number(viewFilter.year) : currentFiscalYear(),
      ),
    );
    setFormError('');
    setConfirmOverlapSave(false);
    setModalOpen(true);
  };

  const openEditModal = (pool: BudgetPool) => {
    if (!isAdmin) return;
    setEditingPoolId(pool.id);
    setDraft({
      id: pool.id,
      year: pool.year,
      code: pool.code || '',
      planName: pool.planName || '',
      workName: pool.workName || '',
      budgetType: pool.budgetType || '',
      expenseCategory: pool.expenseCategory || '',
      expenseSubCategory: pool.expenseSubCategory || '',
      name: pool.name,
      fund: pool.fund || '',
      department: pool.department || DEFAULT_DEPARTMENT,
      allocatedBudget: String(pool.allocatedBudget ?? ''),
      notes: pool.notes || '',
    });
    setFormError('');
    setConfirmOverlapSave(false);
    setModalOpen(true);
  };

  const handleSavePool = (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    const payload: BudgetPool = {
      id: editingPoolId || `pool-${uid()}`,
      year: Number(draft.year) || currentFiscalYear(),
      code: draft.code.trim(),
      planName: draft.planName.trim() || undefined,
      workName: draft.workName.trim() || undefined,
      budgetType: draft.budgetType.trim() || undefined,
      expenseCategory: draft.expenseCategory.trim() || undefined,
      expenseSubCategory: draft.expenseSubCategory.trim() || undefined,
      name: draft.name.trim(),
      fund: draft.fund.trim() || 'งบประมาณรายจ่าย',
      department: draft.department.trim() || DEFAULT_DEPARTMENT,
      allocatedBudget: Number(draft.allocatedBudget) || 0,
      notes: draft.notes.trim(),
    };

    const errors = validateBudgetPool(
      payload,
      budgetPools,
      editingPoolId || undefined,
    );
    if (errors.length > 0) {
      setFormError(errors.join('\n'));
      return;
    }

    const overlapWarnings = findBudgetPoolOverlapWarnings(
      payload,
      budgetPools,
      editingPoolId || undefined,
    );
    if (overlapWarnings.length > 0 && !confirmOverlapSave) {
      setFormError(
        'กรุณาตรวจสอบรายการหมวดวงเงินงบประมาณที่มีชื่อคล้ายหรือซ้ำกันด้านบน และติ๊กยืนยันก่อนบันทึก',
      );
      return;
    }

    const ok = saveBudgetPool(payload);
    if (ok) {
      showToast(
        editingPoolId
          ? `บันทึกการแก้ไขวงเงิน "${payload.name}" แล้ว`
          : `เพิ่มวงเงินงบประมาณ "${payload.name}" แล้ว`,
      );
      setModalOpen(false);
    }
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    const name = deleteTarget.pool.name;
    if (deleteBudgetPool(deleteTarget.pool.id)) {
      showToast(`ลบหมวดวงเงิน "${name}" แล้ว`);
      setDeleteTarget(null);
    }
  };

  const overallRemainingPct =
    summary.totalAllocated > 0
      ? Math.max(0, (summary.totalRemaining / summary.totalAllocated) * 100)
      : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[10px] border border-[#b8d0eb] bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-[#3c5c82]">
            <span>หมวด BUDGET DATA</span>
            <span className="grid h-8 w-8 place-items-center rounded-md bg-[#dbe9fc] text-[#144fa6]">
              <Layers className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="font-mono-num text-[28px] font-semibold tracking-tight text-[#0d2747]">
              {usages.length}
            </span>
            <span className="text-xs text-[#597494]">หมวด</span>
          </div>
          <p className="mt-2 text-[11px] text-[#557191]">
            เชื่อมโยงการทยอยซื้อแล้ว{' '}
            <strong className="font-mono-num font-semibold text-[#144fa6]">
              {summary.totalPurchases}
            </strong>{' '}
            รายการ
          </p>
        </article>

        <article className="rounded-[10px] border border-[#b8d0eb] bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-[#3c5c82]">
            <span>วงเงินตั้งไว้รวม</span>
            <span className="grid h-8 w-8 place-items-center rounded-md bg-[#e1edfc] text-[#114594]">
              <Wallet className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-1.5">
            <span className="font-mono-num text-[24px] font-semibold tracking-tight text-[#0d2747]">
              {formatMoney(summary.totalAllocated)}
            </span>
            <span className="text-xs text-[#597494]">บาท</span>
          </div>
          <p className="mt-2 text-[11px] text-[#557191]">
            ฐานงบประมาณกลางประจำปีของโครงการจัดซื้อจัดจ้างทั้งหมด
          </p>
        </article>

        <article className="rounded-[10px] border border-[#b8d0eb] bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-[#3c5c82]">
            <span>ใช้ไปแล้ว (ตกลง + กันวงเงิน)</span>
            <span className="grid h-8 w-8 place-items-center rounded-md bg-[#fff2dc] text-[#a66d0d]">
              <ShoppingBag className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-1.5">
            <span className="font-mono-num text-[24px] font-semibold tracking-tight text-[#0d2747]">
              {formatMoney(summary.totalUsed)}
            </span>
            <span className="text-xs text-[#597494]">บาท</span>
          </div>
          <p className="mt-2 text-[11px] text-[#557191] tabular-nums">
            ตกลงแล้ว ฿ {formatMoney(summary.totalAgreed)}
            {summary.totalReserved > 0
              ? ` · กันวงเงิน ฿ ${formatMoney(summary.totalReserved)}`
              : ''}
          </p>
        </article>

        <article className="rounded-[10px] border border-[#b8d0eb] bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-[#3c5c82]">
            <span>วงเงินคงเหลือรวม</span>
            <span
              className={`grid h-8 w-8 place-items-center rounded-md ${
                summary.totalRemaining < 0 || summary.overBudgetCount > 0
                  ? 'bg-[#ffe8e8] text-[#b53636]'
                  : 'bg-[#dff5eb] text-[#13734f]'
              }`}
            >
              {summary.totalRemaining < 0 || summary.overBudgetCount > 0 ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <Wallet className="h-4 w-4" />
              )}
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-1.5">
            <span
              className={`font-mono-num text-[24px] font-semibold tracking-tight ${
                summary.totalRemaining < 0 ? 'text-[#b52c2c]' : 'text-[#0f6b47]'
              }`}
            >
              {formatMoney(summary.totalRemaining)}
            </span>
            <span className="text-xs text-[#597494]">บาท</span>
          </div>
          <p className="mt-2 text-[11px] text-[#557191] tabular-nums">
            {summary.overBudgetCount > 0 ? (
              <span className="font-semibold text-[#b52c2c]">
                มี {summary.overBudgetCount} หมวดเกินวงเงินตั้งไว้
              </span>
            ) : (
              `คงเหลือ ${overallRemainingPct.toFixed(1)}% · เบิกจ่ายฎีกาแล้ว ฿ ${formatMoney(summary.totalVoucher)}`
            )}
          </p>
        </article>
      </div>

      <section className="overflow-hidden rounded-[10px] border border-[#b8d0eb] bg-white shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#c2d8f0] bg-gradient-to-r from-[#eef4fc] to-[#ddeafa] px-5 py-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-[14px] font-semibold text-[#12396b]">
                รายการหมวด BUDGET DATA
              </h2>
              <span className="rounded border border-[#a9c5e6] bg-white px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[#194b8e]">
                {usages.length} หมวด
              </span>
            </div>
            <p className="mt-1 text-[11px] text-[#4c6a8d]">
              แยกวงเงินตามลำดับ แผนงาน › งาน › งบ › หมวด › ประเภทค่าใช้จ่าย · กันยอดจากราคากลางและคืนส่วนต่างอัตโนมัติเมื่อบันทึกวงเงินตกลง
            </p>
          </div>

          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setCategoryModalOpen(true)}
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#9fc0e6] bg-white px-3 py-2 text-xs font-semibold text-[#134a96] transition hover:border-[#6da3df] hover:bg-[#e7f1fc]"
              >
                <FolderTree className="h-3.5 w-3.5" />
                จัดการหมวดค่าใช้จ่าย
              </button>
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#0d4294] bg-gradient-to-r from-[#0f489e] to-[#1972c9] px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:from-[#0b387d] hover:to-[#135ba4]"
              >
                <Plus className="h-3.5 w-3.5" />
                เพิ่ม BUDGET DATA
              </button>
            </div>
          )}
        </div>

        {categoryCounts.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-[#dbe8f6] bg-[#f7fbff] px-5 py-3">
            <span className="mr-1 text-[11px] font-semibold text-[#47678a]">
              หมวดค่าใช้จ่าย:
            </span>
            <button
              type="button"
              onClick={() => setCategoryFilter('')}
              className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition ${
                categoryFilter === ''
                  ? 'border-[#1150a6] bg-[#1150a6] text-white'
                  : 'border-[#c5daf0] bg-white text-[#2b4d75] hover:bg-[#edf4fc]'
              }`}
            >
              ทั้งหมด ({allUsages.length})
            </button>
            {categoryCounts.map(([cat, count]) => (
              <button
                key={cat}
                type="button"
                onClick={() =>
                  setCategoryFilter((prev) => (prev === cat ? '' : cat))
                }
                className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition ${
                  categoryFilter === cat
                    ? 'border-[#1150a6] bg-[#1150a6] text-white'
                    : 'border-[#c5daf0] bg-white text-[#2b4d75] hover:bg-[#edf4fc]'
                }`}
              >
                {cat} ({count})
              </button>
            ))}
          </div>
        )}

        <div className="p-5">
          {duplicateAnalysis.exactDuplicateGroups.length > 0 && (
            <div className="mb-4 rounded-xl border border-[#e6a8a8] bg-[#fff5f5] px-4 py-3 text-xs text-[#9b2c2c]">
              <div className="flex items-center gap-1.5 font-bold text-[#a62626]">
                <AlertTriangle className="h-4 w-4 shrink-0 text-[#c93434]" />
                ตรวจพบรายการงบประมาณที่มีชื่อหรือรหัสซ้ำซ้อนใน BUDGET DATA
              </div>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[11px]">
                {duplicateAnalysis.exactDuplicateGroups.map((g, idx) => (
                  <li key={idx}>
                    <b>{g.reason}</b> ({g.pools.length} รายการ:{' '}
                    {g.pools
                      .map((p) => `“${p.name}” ฿${formatMoney(p.allocatedBudget)}`)
                      .join(', ')}
                    )
                  </li>
                ))}
              </ul>
            </div>
          )}

          {duplicateAnalysis.similarNameGroups.length > 0 && (
            <div className="mb-4 rounded-xl border border-[#ebd09c] bg-[#fffaf0] px-4 py-3 text-xs text-[#7c4d0c]">
              <div className="flex items-center gap-1.5 font-bold text-[#8a5308]">
                <AlertTriangle className="h-4 w-4 shrink-0 text-[#c27803]" />
                พบชื่อหมวดวงเงินงบประมาณที่คล้ายกันในระบบ (กรุณาตรวจสอบว่าใช่ประเภทเดียวกันหรือไม่)
              </div>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[11px]">
                {duplicateAnalysis.similarNameGroups.map((g, idx) => (
                  <li key={idx}>
                    <b>ปีงบฯ {g.year}:</b>{' '}
                    {g.pools
                      .map((p) => {
                        const hierarchy = formatBudgetHierarchyPath(p);
                        return `“${p.name}”${hierarchy ? ` [${hierarchy}]` : ''} ฿${formatMoney(p.allocatedBudget)}`;
                      })
                      .join(' · ')}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {usages.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#b6cde6] bg-[#f5f9fe] px-6 py-12 text-center">
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-[#dcebfa] text-[#1455b3]">
                <Wallet className="h-5 w-5" />
              </span>
              <h3 className="mt-3 text-sm font-semibold text-[#143763]">
                ยังไม่มีรายการ BUDGET DATA
              </h3>
              <p className="mt-1 max-w-[560px] text-xs leading-relaxed text-[#4f6d90]">
                สร้างหมวดวงเงินงบประมาณประจำปี (แผนงาน / งาน / งบ / หมวด / ประเภทค่าใช้จ่าย)
                ก่อนบันทึกโครงการจัดซื้อจัดจ้าง เพื่อให้โครงการทุกงานผูกตัดยอดจากหมวดงบประมาณของปีนั้นอย่างเป็นระบบ
              </p>
              {isAdmin && (
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#0f489e] to-[#1972c9] px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:from-[#0b387d] hover:to-[#135ba4]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  สร้างหมวดวงเงินแรก
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {usages.map((usage) => {
                const { pool } = usage;
                const expanded = Boolean(expandedPoolIds[pool.id]);
                const allocated = Math.max(0, Number(pool.allocatedBudget || 0));
                const agreedPct =
                  allocated > 0
                    ? Math.min(100, (usage.agreedAmount / allocated) * 100)
                    : 0;
                const reservedPct =
                  allocated > 0
                    ? Math.min(
                        Math.max(0, 100 - agreedPct),
                        (usage.reservedAmount / allocated) * 100,
                      )
                    : 0;

                return (
                  <article
                    key={pool.id}
                    className={`overflow-hidden rounded-xl border bg-white transition ${
                      usage.isOverBudget
                        ? 'border-[#e6a8a8]'
                        : 'border-[#bdd3ec]'
                    }`}
                  >
                    <div className="p-4 sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded border border-[#a9c5e6] bg-[#edf4fc] px-2 py-0.5 font-mono-num text-[11px] font-semibold text-[#154b94]">
                              ปีงบฯ {pool.year}
                            </span>
                            {pool.code && (
                              <span className="font-mono-num text-[11px] font-semibold text-[#3f628a]">
                                {pool.code}
                              </span>
                            )}
                            {(pool.planName ||
                              pool.workName ||
                              pool.budgetType ||
                              pool.expenseCategory ||
                              pool.expenseSubCategory) && (
                              <span className="rounded border border-[#bfdbfe] bg-[#eff6ff] px-2 py-0.5 text-[10.5px] font-semibold text-[#1d4ed8]">
                                {formatBudgetHierarchyPath(pool)}
                              </span>
                            )}
                            {duplicateAnalysis.exactDuplicateIds.has(pool.id) && (
                              <span className="inline-flex items-center gap-1 rounded border border-[#f0b4b4] bg-[#fff0f0] px-2 py-0.5 text-[10.5px] font-semibold text-[#b52c2c]">
                                <AlertTriangle className="h-3 w-3" />
                                ชื่อ/รหัสซ้ำซ้อน
                              </span>
                            )}
                            {!duplicateAnalysis.exactDuplicateIds.has(pool.id) &&
                              duplicateAnalysis.similarIds.has(pool.id) && (
                                <span className="inline-flex items-center gap-1 rounded border border-[#ebd09c] bg-[#fff8e8] px-2 py-0.5 text-[10.5px] font-semibold text-[#8a5308]">
                                  <AlertTriangle className="h-3 w-3" />
                                  ชื่อคล้ายหมวดอื่น
                                </span>
                              )}
                            {usage.isOverBudget && (
                              <span className="inline-flex items-center gap-1 rounded border border-[#f0b4b4] bg-[#fff0f0] px-2 py-0.5 text-[10.5px] font-semibold text-[#b52c2c]">
                                <AlertTriangle className="h-3 w-3" />
                                เกินวงเงินที่ตั้งไว้
                              </span>
                            )}
                          </div>

                          <h3 className="mt-1.5 text-[15px] font-bold text-[#0f2c52]">
                            {pool.name}
                          </h3>
                          <p className="mt-0.5 text-[11.5px] text-[#4c6a8d]">
                            {pool.department || DEFAULT_DEPARTMENT} ·{' '}
                            {pool.fund || 'งบประมาณรายจ่าย'}
                            {pool.notes ? ` · ${pool.notes}` : ''}
                          </p>
                        </div>

                        {isAdmin && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onCreatePurchaseFromPool(pool.id)}
                              className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-[#0d4294] bg-gradient-to-r from-[#0f489e] to-[#1972c9] px-3 py-1.5 text-[11.5px] font-semibold text-white shadow-xs transition hover:from-[#0b387d] hover:to-[#135ba4]"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              ซื้อในวงเงินนี้
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditModal(pool)}
                              className="inline-flex items-center gap-1 rounded-md border border-[#9fc0e6] bg-[#edf4fc] px-2.5 py-1.5 text-[11.5px] font-semibold text-[#134a96] transition hover:bg-[#dcebfa]"
                            >
                              <Pencil className="h-3 w-3" />
                              แก้ไข
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmUnlinkOnDelete(false);
                                setDeleteTarget(usage);
                              }}
                              aria-label={`ลบหมวดวงเงิน ${pool.name}`}
                              className="rounded-md border border-[#edb8b8] bg-white p-1.5 text-[#a82c2c] transition hover:bg-[#ffebeb]"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="mt-4">
                        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                          <span className="font-medium text-[#37587e]">
                            ความคืบหน้าการใช้วงเงิน ({usage.eligibleCount} รายการที่นับยอด
                            {usage.linkedProjects.length > usage.eligibleCount
                              ? ` · ไม่นับพัก/ยกเลิก ${usage.linkedProjects.length - usage.eligibleCount}`
                              : ''}
                            )
                          </span>
                          <span
                            className={`font-mono-num font-semibold ${
                              usage.isOverBudget
                                ? 'text-[#b52c2c]'
                                : usage.utilizationPct >= 85
                                  ? 'text-[#a66d0d]'
                                  : 'text-[#144fa6]'
                            }`}
                          >
                            ใช้ไป {usage.utilizationPct.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex h-2.5 w-full overflow-hidden rounded bg-[#dce9f7]">
                          {usage.isOverBudget ? (
                            <div
                              className="h-full w-full bg-[#c93434]"
                              title="ยอดใช้เกินวงเงินตั้งไว้"
                            />
                          ) : (
                            <>
                              <div
                                className="h-full bg-gradient-to-r from-[#0f489e] to-[#1e7ee0] transition-all"
                                style={{ width: `${agreedPct}%` }}
                                title={`ตกลงซื้อแล้ว ฿ ${formatMoney(usage.agreedAmount)}`}
                              />
                              {reservedPct > 0 && (
                                <div
                                  className="h-full bg-[#e39c2b] transition-all"
                                  style={{ width: `${reservedPct}%` }}
                                  title={`กันวงเงินขอซื้อ ฿ ${formatMoney(usage.reservedAmount)}`}
                                />
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                        <div className="rounded-lg border border-[#d4e4f5] bg-[#f6fafe] px-3 py-2.5">
                          <div className="text-[10.5px] font-medium text-[#4d6c8f]">
                            วงเงินตั้งไว้ทั้งปี
                          </div>
                          <div className="mt-0.5 font-mono-num text-[14px] font-bold text-[#0f2c52]">
                            ฿ {formatMoney(allocated)}
                          </div>
                        </div>

                        <div className="rounded-lg border border-[#d4e4f5] bg-[#f6fafe] px-3 py-2.5">
                          <div className="flex items-center gap-1.5 text-[10.5px] font-medium text-[#4d6c8f]">
                            <span className="inline-block h-2 w-2 rounded-xs bg-[#1455b3]" />
                            ตกลงซื้อแล้ว
                          </div>
                          <div className="mt-0.5 font-mono-num text-[14px] font-bold text-[#144fa6]">
                            ฿ {formatMoney(usage.agreedAmount)}
                          </div>
                        </div>

                        <div className="rounded-lg border border-[#d4e4f5] bg-[#f6fafe] px-3 py-2.5">
                          <div className="flex items-center gap-1.5 text-[10.5px] font-medium text-[#4d6c8f]">
                            <span className="inline-block h-2 w-2 rounded-xs bg-[#e39c2b]" />
                            กันวงเงิน (ราคากลาง)
                          </div>
                          <div className="mt-0.5 font-mono-num text-[14px] font-bold text-[#a66d0d]">
                            ฿ {formatMoney(usage.reservedAmount)}
                          </div>
                        </div>

                        <div
                          className={`rounded-lg border px-3 py-2.5 ${
                            usage.isOverBudget
                              ? 'border-[#f0b4b4] bg-[#fff5f5]'
                              : 'border-[#b7e2cf] bg-[#f1fbf6]'
                          }`}
                        >
                          <div className="text-[10.5px] font-medium text-[#4d6c8f]">
                            วงเงินคงเหลือ
                          </div>
                          <div
                            className={`mt-0.5 font-mono-num text-[14px] font-bold ${
                              usage.isOverBudget
                                ? 'text-[#b52c2c]'
                                : 'text-[#0f6b47]'
                            }`}
                          >
                            ฿ {formatMoney(usage.remainingAmount)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-[#e0ebf7] pt-3 text-[11px]">
                        <span className="text-[#4f6d90] tabular-nums">
                          เบิกจ่ายฎีกาแล้ว:{' '}
                          <strong className="font-mono-num font-semibold text-[#173c6b]">
                            ฿ {formatMoney(usage.voucherAmount)}
                          </strong>
                        </span>

                        <button
                          type="button"
                          onClick={() => toggleExpand(pool.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-[#b6cde6] bg-[#f4f8fe] px-2.5 py-1 text-[11px] font-semibold text-[#144b96] transition hover:bg-[#e3effc]"
                        >
                          {expanded ? (
                            <>
                              ซ่อนรายการซื้อ ({usage.linkedProjects.length})
                              <ChevronUp className="h-3.5 w-3.5" />
                            </>
                          ) : (
                            <>
                              ดูรายการซื้อในวงเงินนี้ ({usage.linkedProjects.length})
                              <ChevronDown className="h-3.5 w-3.5" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {expanded && (
                      <div className="border-t border-[#cde0f3] bg-[#f6fafe] p-4">
                        {usage.linkedProjects.length === 0 ? (
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#547294]">
                            <span>ยังไม่มีรายการจัดซื้อที่ตัดจากวงเงินนี้</span>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => onCreatePurchaseFromPool(pool.id)}
                                className="font-semibold text-[#0f58ad] hover:underline"
                              >
                                ＋ บันทึกรายการซื้อครั้งแรกในวงเงินนี้
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="overflow-x-auto rounded-lg border border-[#bdd3ec] bg-white">
                            <table className="w-full min-w-[700px] border-collapse text-left text-[11.5px]">
                              <thead>
                                <tr className="border-b border-[#c5daf0] bg-[#e5f0fc] text-[#163c6b]">
                                  <th className="px-3 py-2 font-semibold">เลขทะเบียน</th>
                                  <th className="px-3 py-2 font-semibold">รายการจัดซื้อ</th>
                                  <th className="px-3 py-2 text-right font-semibold">ราคากลาง</th>
                                  <th className="px-3 py-2 text-right font-semibold">ตกลงซื้อ</th>
                                  <th className="px-3 py-2 text-right font-semibold">ตัดวงเงินจริง</th>
                                  <th className="px-3 py-2 text-right font-semibold">ฎีกาเบิกจ่าย</th>
                                  <th className="px-3 py-2 text-center font-semibold">สถานะ</th>
                                  <th className="px-3 py-2 text-center font-semibold">จัดการ</th>
                                </tr>
                              </thead>
                              <tbody>
                                {usage.linkedProjects.map((proj) => {
                                  const commit = getProjectPoolCommitment(proj);
                                  const voucherAmt = getTotalVoucherAmount(
                                    proj.projectDetails,
                                  );
                                  return (
                                    <tr
                                      key={proj.id}
                                      className="border-b border-[#e2ecf7] last:border-b-0 hover:bg-[#f2f7fe]"
                                    >
                                      <td className="px-3 py-2.5 font-mono-num font-semibold text-[#134a96]">
                                        {proj.code}
                                      </td>
                                      <td className="px-3 py-2.5">
                                        <div className="font-medium text-[#132f52]">
                                          {proj.title}
                                        </div>
                                        {proj.vendor && (
                                          <div className="text-[10.5px] text-[#5c7899]">
                                            ผู้ขาย: {proj.vendor}
                                          </div>
                                        )}
                                      </td>
                                      <td className="px-3 py-2.5 text-right font-mono-num text-[#4a6688]">
                                        {proj.reference > 0
                                          ? formatMoney(proj.reference)
                                          : '—'}
                                      </td>
                                      <td className="px-3 py-2.5 text-right font-mono-num font-medium text-[#144fa6]">
                                        {proj.agreed > 0
                                          ? formatMoney(proj.agreed)
                                          : '—'}
                                      </td>
                                      <td className="px-3 py-2.5 text-right font-mono-num font-semibold text-[#0f2c52]">
                                        {formatMoney(commit.usedAmount)}
                                      </td>
                                      <td className="px-3 py-2.5 text-right font-mono-num text-[#13734f]">
                                        {voucherAmt > 0
                                          ? formatMoney(voucherAmt)
                                          : '—'}
                                      </td>
                                      <td className="px-3 py-2.5 text-center">
                                        <StatusBadge status={proj.status} />
                                      </td>
                                      <td className="px-3 py-2.5 text-center">
                                        <div className="flex items-center justify-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() => onViewProject(proj.id)}
                                            className="rounded border border-[#aec7e4] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#173d6b] hover:bg-[#e1edfb]"
                                          >
                                            ดู
                                          </button>
                                          {isAdmin && (
                                            <button
                                              type="button"
                                              onClick={() => onEditProject(proj.id)}
                                              className="rounded border border-[#9fc0e6] bg-[#edf4fc] px-2 py-0.5 text-[11px] font-semibold text-[#10499c] hover:bg-[#dcebfa]"
                                            >
                                              แก้ไข
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="budget-pool-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#061830]/75 p-3 backdrop-blur-[2px] sm:p-5"
        >
          <div className="flex max-h-[90dvh] w-full max-w-[680px] flex-col overflow-hidden rounded-2xl border border-[#2b6cb5] bg-[#f8fbff] shadow-2xl">
            <div className="flex shrink-0 items-center justify-between gap-3 bg-gradient-to-r from-[#092954] via-[#0f448a] to-[#1666ba] px-5 py-4 text-white">
              <div>
                <h3 id="budget-pool-modal-title" className="text-base font-bold">
                  {editingPoolId ? 'แก้ไข BUDGET DATA' : 'เพิ่ม BUDGET DATA'}
                </h3>
                <p className="mt-0.5 text-[11px] text-[#b8dcff]">
                  จำแนกตามลำดับขั้น 5 ระดับ: แผนงาน › งาน › งบ › หมวด › ประเภทค่าใช้จ่าย
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="ปิดหน้าต่าง"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/25 bg-white/10 text-white hover:bg-white/20"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={handleSavePool}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              <div className="rounded-xl border border-[#c6daf0] bg-[#f4f8fe] p-3.5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="text-[11.5px] font-bold text-[#143d70]">
                    ลำดับขั้นงบประมาณ (5 ระดับ)
                  </span>
                  <button
                    type="button"
                    onClick={() => setCategoryModalOpen(true)}
                    className="text-[11px] font-semibold text-[#1355b0] hover:underline"
                  >
                    ตั้งค่าหมวด / เพิ่มประเภทค่าใช้จ่าย
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                    1. แผนงาน
                    <div className="mt-1.5">
                      <AutoSuggestInput
                        maxLength={200}
                        placeholder="เช่น แผนงานอุตสาหกรรมและการโยธา"
                        value={draft.planName}
                        suggestions={planSuggestions}
                        onChangeValue={(nextVal) =>
                          setDraft((p) => ({ ...p, planName: nextVal }))
                        }
                        className="min-h-[38px] w-full rounded-lg border border-[#a8c4e4] bg-white px-3 py-2 text-xs font-normal text-[#132d4c]"
                      />
                    </div>
                  </label>

                  <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                    2. งาน
                    <div className="mt-1.5">
                      <AutoSuggestInput
                        maxLength={200}
                        placeholder="เช่น งานบริหารงานทั่วไปเกี่ยวกับอุตสาหกรรมและการโยธา"
                        value={draft.workName}
                        suggestions={workSuggestions}
                        onChangeValue={(nextVal) =>
                          setDraft((p) => ({ ...p, workName: nextVal }))
                        }
                        className="min-h-[38px] w-full rounded-lg border border-[#a8c4e4] bg-white px-3 py-2 text-xs font-normal text-[#132d4c]"
                      />
                    </div>
                  </label>

                  <label className="block text-[11.5px] font-semibold text-[#1d4069] sm:col-span-2">
                    3. งบ
                    <div className="mt-1.5">
                      <AutoSuggestInput
                        maxLength={120}
                        placeholder="เช่น งบดำเนินงาน, งบลงทุน, งบบุคลากร"
                        value={draft.budgetType}
                        suggestions={budgetTypeSuggestions}
                        onChangeValue={(nextVal) =>
                          setDraft((p) => ({ ...p, budgetType: nextVal }))
                        }
                        className="min-h-[38px] w-full rounded-lg border border-[#a8c4e4] bg-white px-3 py-2 text-xs font-normal text-[#132d4c]"
                      />
                    </div>
                  </label>

                  <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                    4. หมวด
                    <div className="mt-1.5">
                      <AutoSuggestInput
                        maxLength={120}
                        placeholder="เช่น ค่าวัสดุ, ค่าครุภัณฑ์, ค่าใช้สอย"
                        value={draft.expenseCategory}
                        suggestions={mainCategorySuggestions}
                        onChangeValue={(nextCat) =>
                          setDraft((p) => {
                            const validSubs = getSubCategoriesForCategory(
                              expenseCatalog,
                              nextCat,
                            );
                            const keepSub =
                              !nextCat.trim() ||
                              validSubs.length === 0 ||
                              validSubs.some(
                                (s) =>
                                  s.toLowerCase() ===
                                  p.expenseSubCategory.trim().toLowerCase(),
                              );
                            return {
                              ...p,
                              expenseCategory: nextCat,
                              expenseSubCategory: keepSub
                                ? p.expenseSubCategory
                                : '',
                            };
                          })
                        }
                        className="min-h-[38px] w-full rounded-lg border border-[#a8c4e4] bg-white px-3 py-2 text-xs font-normal text-[#132d4c]"
                      />
                    </div>
                  </label>

                  <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                    5. ประเภทค่าใช้จ่าย
                    <div className="mt-1.5">
                      <AutoSuggestInput
                        maxLength={150}
                        placeholder="เช่น วัสดุก่อสร้าง, วัสดุสำนักงาน"
                        value={draft.expenseSubCategory}
                        suggestions={draftSubCategorySuggestions}
                        onChangeValue={(nextSub) =>
                          setDraft((p) => {
                            const inferredParent =
                              !p.expenseCategory.trim() && nextSub.trim()
                                ? findParentCategoryForSubCategory(
                                    expenseCatalog,
                                    nextSub,
                                  )
                                : null;
                            const nextCat = inferredParent || p.expenseCategory;
                            const autoName = suggestPoolNameFromSubCategory(
                              nextCat,
                              nextSub,
                            );
                            const prevAutoName = suggestPoolNameFromSubCategory(
                              p.expenseCategory,
                              p.expenseSubCategory,
                            );
                            const shouldUpdateName =
                              !p.name.trim() || p.name.trim() === prevAutoName;
                            return {
                              ...p,
                              expenseCategory: nextCat,
                              expenseSubCategory: nextSub,
                              name:
                                shouldUpdateName && nextSub.trim()
                                  ? autoName
                                  : p.name,
                            };
                          })
                        }
                        className="min-h-[38px] w-full rounded-lg border border-[#a8c4e4] bg-white px-3 py-2 text-xs font-normal text-[#132d4c]"
                      />
                    </div>
                  </label>
                </div>

                {draftSubCategorySuggestions.length > 0 && (
                  <div className="mt-3">
                    <div className="mb-1.5 text-[10.5px] font-medium text-[#4a688a]">
                      เลือกประเภทย่อยด่วนในหมวด{' '}
                      <b className="text-[#123d73]">
                        {draft.expenseCategory || 'ทั้งหมด'}
                      </b>
                      :
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {draftSubCategorySuggestions.slice(0, 10).map((sub) => (
                        <button
                          key={sub}
                          type="button"
                          onClick={() =>
                            setDraft((p) => {
                              const inferredParent =
                                !p.expenseCategory.trim()
                                  ? findParentCategoryForSubCategory(
                                      expenseCatalog,
                                      sub,
                                    )
                                  : null;
                              const nextCat = inferredParent || p.expenseCategory;
                              const prevAuto = suggestPoolNameFromSubCategory(
                                p.expenseCategory,
                                p.expenseSubCategory,
                              );
                              const nextAuto = suggestPoolNameFromSubCategory(
                                nextCat,
                                sub,
                              );
                              return {
                                ...p,
                                expenseCategory: nextCat,
                                expenseSubCategory: sub,
                                name:
                                  !p.name.trim() || p.name.trim() === prevAuto
                                    ? nextAuto
                                    : p.name,
                              };
                            })
                          }
                          className={`rounded-md border px-2 py-1 text-[11px] font-medium transition ${
                            draft.expenseSubCategory === sub
                              ? 'border-[#1251a8] bg-[#dbeafd] font-semibold text-[#0d3e85]'
                              : 'border-[#c5daf0] bg-white text-[#2f5178] hover:bg-[#edf4fc]'
                          }`}
                        >
                          {sub}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                  ปีงบประมาณ พ.ศ. *
                  <select
                    value={draft.year}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, year: Number(e.target.value) }))
                    }
                    className="mt-1.5 min-h-[38px] w-full rounded-lg border border-[#a8c4e4] bg-white px-3 py-2 text-xs font-normal text-[#132d4c]"
                  >
                    {getFiscalYearOptions(draft.year).map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                  รหัสหมวดวงเงิน (ไม่บังคับ)
                  <input
                    type="text"
                    maxLength={60}
                    placeholder="เช่น งป.69-วัสดุสนง."
                    value={draft.code}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, code: e.target.value }))
                    }
                    className="mt-1.5 min-h-[38px] w-full rounded-lg border border-[#a8c4e4] bg-white px-3 py-2 text-xs font-normal text-[#132d4c]"
                  />
                </label>

                <label className="col-span-full block text-[11.5px] font-semibold text-[#1d4069]">
                  ชื่อหมวดวงเงินงบประมาณ *
                  <input
                    type="text"
                    required
                    maxLength={250}
                    placeholder="เช่น ค่าวัสดุสำนักงาน, ค่าวัสดุก่อสร้าง, ค่าวัสดุไฟฟ้าและวิทยุ"
                    value={draft.name}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, name: e.target.value }))
                    }
                    className="mt-1.5 min-h-[38px] w-full rounded-lg border border-[#a8c4e4] bg-white px-3 py-2 text-xs font-normal text-[#132d4c]"
                  />
                </label>

                <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                  วงเงินตั้งไว้ทั้งปี (บาท) *
                  <input
                    type="number"
                    required
                    min={1}
                    step="0.01"
                    placeholder="เช่น 150000"
                    value={draft.allocatedBudget}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        allocatedBudget: e.target.value,
                      }))
                    }
                    className="mt-1.5 min-h-[38px] w-full rounded-lg border border-[#a8c4e4] bg-white px-3 py-2 font-mono-num text-xs font-normal text-[#132d4c]"
                  />
                </label>

                <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                  แหล่งงบประมาณ
                  <div className="mt-1.5">
                    <AutoSuggestInput
                      value={draft.fund}
                      suggestions={fundSuggestions}
                      onChangeValue={(nextVal) =>
                        setDraft((p) => ({ ...p, fund: nextVal }))
                      }
                      className="min-h-[38px] w-full rounded-lg border border-[#a8c4e4] bg-white px-3 py-2 text-xs font-normal text-[#132d4c]"
                    />
                  </div>
                </label>

                <label className="col-span-full block text-[11.5px] font-semibold text-[#1d4069]">
                  หน่วยงาน / กอง
                  <input
                    type="text"
                    maxLength={150}
                    value={draft.department}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, department: e.target.value }))
                    }
                    className="mt-1.5 min-h-[38px] w-full rounded-lg border border-[#a8c4e4] bg-white px-3 py-2 text-xs font-normal text-[#132d4c]"
                  />
                </label>

                <label className="col-span-full block text-[11.5px] font-semibold text-[#1d4069]">
                  หมายเหตุเพิ่มเติม
                  <textarea
                    rows={2}
                    maxLength={500}
                    placeholder="รายละเอียดเพิ่มเติม เช่น โครงการตามข้อบัญญัติ หรือหมายเหตุประกอบหมวดงบประมาณ"
                    value={draft.notes}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, notes: e.target.value }))
                    }
                    className="mt-1.5 w-full rounded-lg border border-[#a8c4e4] bg-white px-3 py-2 text-xs font-normal text-[#132d4c]"
                  />
                </label>
              </div>

              {(draftLiveChecks.duplicateErrors.length > 0 ||
                draftLiveChecks.overlapWarnings.length > 0) && (
                <div className="space-y-2">
                  {draftLiveChecks.duplicateErrors.length > 0 && (
                    <div className="rounded-lg border border-[#f0b4b4] bg-[#fff3f3] px-3 py-2 text-[11.5px] font-medium text-[#b52c2c]">
                      {draftLiveChecks.duplicateErrors.map((msg, i) => (
                        <div key={i}>• {msg}</div>
                      ))}
                    </div>
                  )}
                  {draftLiveChecks.overlapWarnings.length > 0 && (
                    <div className="space-y-2 rounded-lg border border-[#e3b96c] bg-[#fff8e8] p-3 text-[11.5px] text-[#7c4d0c]">
                      <div className="flex items-center gap-1.5 font-bold text-[#8a5308]">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-[#c27803]" />
                        แจ้งเตือนเพื่อตรวจสอบก่อนบันทึก
                      </div>
                      {draftLiveChecks.overlapWarnings.map((w, i) => (
                        <div key={i} className="space-y-1">
                          <div>• {w.message}</div>
                          <ul className="list-disc space-y-0.5 pl-5 text-[11px] text-[#6d4309]">
                            {w.pools.map((p) => {
                              const hierarchy = formatBudgetHierarchyPath(p);
                              return (
                                <li key={p.id}>
                                  <b>{p.name}</b>
                                  {hierarchy ? ` (${hierarchy})` : ''} · วงเงิน ฿
                                  {formatMoney(p.allocatedBudget)}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ))}
                      <label className="mt-1 flex cursor-pointer items-start gap-2 rounded-md border border-[#e3b96c] bg-white px-2.5 py-2 text-[11.5px] font-semibold text-[#6b3f04]">
                        <input
                          type="checkbox"
                          checked={confirmOverlapSave}
                          onChange={(e) => {
                            setConfirmOverlapSave(e.target.checked);
                            if (e.target.checked) setFormError('');
                          }}
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#b45309]"
                        />
                        <span>
                          ตรวจสอบแล้ว ไม่ใช่หมวดเดียวกัน ยืนยันต้องการบันทึก
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              )}

              {formError && (
                <div
                  role="alert"
                  className="rounded-lg border border-[#f0b4b4] bg-[#fff0f0] px-3 py-2 text-xs whitespace-pre-line text-[#b52c2c]"
                >
                  {formError}
                </div>
              )}
              </div>

              <div className="flex shrink-0 justify-end gap-2 border-t border-[#c6daf0] bg-[#eef5fd] px-5 py-3.5">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-[#afc8e4] bg-white px-4 py-2 text-xs font-semibold text-[#274469] hover:bg-[#edf4fc]"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-gradient-to-r from-[#0f489e] to-[#1972c9] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:from-[#0b387d] hover:to-[#135ba4]"
                >
                  {editingPoolId ? 'บันทึกการแก้ไข' : 'บันทึก BUDGET DATA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-pool-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#061830]/70 p-4 backdrop-blur-[2px]"
        >
          <div className="w-full max-w-[460px] rounded-xl border border-[#9fc0e6] bg-white p-5 shadow-2xl">
            <h3 id="delete-pool-title" className="text-sm font-bold text-[#0f2a4a]">
              ยืนยันการลบ BUDGET DATA
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-[#365375]">
              ต้องการลบหมวดวงเงิน <b>{deleteTarget.pool.name}</b> (ปีงบฯ{' '}
              {deleteTarget.pool.year}) ออกจากระบบหรือไม่?
            </p>
            {deleteTarget.linkedProjects.length > 0 && (
              <div className="mt-3 space-y-2.5 rounded-lg border border-[#edb8b8] bg-[#fff5f5] p-3 text-xs text-[#8f2020]">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#b82828]" />
                  <div>
                    <div className="font-semibold">
                      คำเตือน: มี {deleteTarget.linkedProjects.length} โครงการผูกอยู่กับหมวดนี้
                    </div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-[#703030]">
                      รายการโครงการจะไม่ถูกลบ แต่จะถูกปลดความเชื่อมโยงออกเป็น{' '}
                      <b>ยังไม่ผูก BUDGET DATA</b> (จะต้องเข้าไปเลือกหมวด BUDGET DATA ใหม่ในหน้าแก้ไขโครงการ):{' '}
                      <span className="font-mono-num font-semibold">
                        {deleteTarget.linkedProjects
                          .slice(0, 6)
                          .map((p) => p.code)
                          .join(', ')}
                        {deleteTarget.linkedProjects.length > 6
                          ? ` และอีก ${deleteTarget.linkedProjects.length - 6} รายการ`
                          : ''}
                      </span>
                    </p>
                  </div>
                </div>
                <label className="flex cursor-pointer items-center gap-2 border-t border-[#f3d0d0] pt-2 text-[11.5px] font-semibold text-[#6e1c1c]">
                  <input
                    type="checkbox"
                    checked={confirmUnlinkOnDelete}
                    onChange={(e) => setConfirmUnlinkOnDelete(e.target.checked)}
                    className="h-3.5 w-3.5 shrink-0 accent-[#b82828]"
                  />
                  รับทราบและยืนยันปลดความเชื่อมโยงทั้ง {deleteTarget.linkedProjects.length} โครงการ
                </label>
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setConfirmUnlinkOnDelete(false);
                }}
                className="rounded-lg border border-[#afc8e4] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#274469] hover:bg-[#edf4fc]"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={
                  deleteTarget.linkedProjects.length > 0 && !confirmUnlinkOnDelete
                }
                onClick={handleConfirmDelete}
                className="rounded-lg bg-[#b82828] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#961d1d] disabled:cursor-not-allowed disabled:opacity-45"
              >
                ยืนยันลบหมวดวงเงิน
              </button>
            </div>
          </div>
        </div>
      )}
      <ExpenseCategoriesModal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
      />
    </div>
  );
}
