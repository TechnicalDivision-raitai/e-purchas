import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Layers,
  Pencil,
  Plus,
  ShoppingBag,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { BUDGET_POOL_PRESETS, DEFAULT_DEPARTMENT } from '../../data/constants';
import {
  calculateBudgetPoolUsageList,
  getProjectPoolCommitment,
  validateBudgetPool,
  type BudgetPoolUsage,
} from '../../domain/budgetPools';
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

interface BudgetPoolsPageProps {
  onCreatePurchaseFromPool: (poolId: string) => void;
  onViewProject: (id: string) => void;
  onEditProject: (id: string) => void;
}

interface PoolDraft {
  id: string;
  year: number;
  code: string;
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
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPoolId, setEditingPoolId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PoolDraft>(() =>
    createEmptyPoolDraft(
      viewFilter.year ? Number(viewFilter.year) : currentFiscalYear(),
    ),
  );
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<BudgetPoolUsage | null>(null);

  const usages = useMemo(
    () =>
      calculateBudgetPoolUsageList(
        budgetPools,
        state.rows,
        viewFilter.year,
        viewFilter.q,
      ),
    [budgetPools, state.rows, viewFilter.year, viewFilter.q],
  );

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
    setModalOpen(true);
  };

  const openEditModal = (pool: BudgetPool) => {
    if (!isAdmin) return;
    setEditingPoolId(pool.id);
    setDraft({
      id: pool.id,
      year: pool.year,
      code: pool.code || '',
      name: pool.name,
      fund: pool.fund || '',
      department: pool.department || DEFAULT_DEPARTMENT,
      allocatedBudget: String(pool.allocatedBudget ?? ''),
      notes: pool.notes || '',
    });
    setFormError('');
    setModalOpen(true);
  };

  const handleSavePool = (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    const payload: BudgetPool = {
      id: editingPoolId || `pool-${uid()}`,
      year: Number(draft.year) || currentFiscalYear(),
      code: draft.code.trim(),
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
            ตั้งเป็นงบก้อนใหญ่ ไม่นับซ้ำกับการซื้อแต่ละครั้ง
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
              เหมาะสำหรับวัสดุสำนักงาน วัสดุก่อสร้าง หรือหมวดที่ตั้งงบก้อนใหญ่แล้วทยอยซื้อเป็นครั้งคราว · เมื่อบันทึกวงเงินตกลงซื้อแล้ว ระบบจะคืนส่วนต่างกลับเข้ายอดคงเหลืออัตโนมัติ
            </p>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#0d4294] bg-gradient-to-r from-[#0f489e] to-[#1972c9] px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:from-[#0b387d] hover:to-[#135ba4]"
            >
              <Plus className="h-3.5 w-3.5" />
              เพิ่ม BUDGET DATA
            </button>
          )}
        </div>

        <div className="p-5">
          {usages.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#b6cde6] bg-[#f5f9fe] px-6 py-12 text-center">
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-[#dcebfa] text-[#1455b3]">
                <Wallet className="h-5 w-5" />
              </span>
              <h3 className="mt-3 text-sm font-semibold text-[#143763]">
                ยังไม่มีรายการ BUDGET DATA
              </h3>
              <p className="mt-1 max-w-[520px] text-xs leading-relaxed text-[#4f6d90]">
                สร้างหมวดวงเงินก้อนใหญ่ เช่น ค่าวัสดุสำนักงาน หรือ ค่าวัสดุก่อสร้าง
                เพื่อให้สามารถผูกใบจัดซื้อแต่ละครั้งเข้ามาตัดยอดจากวงเงินนี้ได้โดยไม่ทำให้ยอดงบประมาณในหน้าภาพรวมนับซ้ำ
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
                              onClick={() => setDeleteTarget(usage)}
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
                            กันวงเงินขอซื้อ
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
                                  <th className="px-3 py-2 text-right font-semibold">ขอซื้อครั้งนี้</th>
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
                                        {formatMoney(proj.budget)}
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#061830]/75 p-4 backdrop-blur-[2px]"
        >
          <div className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-[#2b6cb5] bg-[#f8fbff] shadow-2xl">
            <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-[#092954] via-[#0f448a] to-[#1666ba] px-5 py-4 text-white">
              <div>
                <h3 id="budget-pool-modal-title" className="text-base font-bold">
                  {editingPoolId ? 'แก้ไข BUDGET DATA' : 'เพิ่ม BUDGET DATA'}
                </h3>
                <p className="mt-0.5 text-[11px] text-[#b8dcff]">
                  ตั้งวงเงินก้อนใหญ่ประจำปีเพื่อรองรับการทยอยซื้อวัสดุหรือรายการย่อยเป็นครั้งคราว
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="ปิดหน้าต่าง"
                className="grid h-8 w-8 place-items-center rounded-lg border border-white/25 bg-white/10 text-white hover:bg-white/20"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSavePool} className="space-y-4 p-5">
              <div>
                <div className="mb-1.5 text-[11px] font-semibold text-[#2c4c73]">
                  เลือกชื่อหมวดที่ใช้บ่อย (คลิกเพื่อเติมอัตโนมัติ)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {BUDGET_POOL_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDraft((p) => ({ ...p, name: preset }))}
                      className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${
                        draft.name === preset
                          ? 'border-[#1251a8] bg-[#dbeafd] font-semibold text-[#0d3e85]'
                          : 'border-[#bdd3ec] bg-white text-[#2f5178] hover:bg-[#edf4fc]'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
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
                    placeholder="เช่น ค่าวัสดุสำนักงาน, ค่าวัสดุก่อสร้าง"
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
                  หมายเหตุ / แผนงาน
                  <textarea
                    rows={2}
                    maxLength={500}
                    placeholder="รายละเอียดเพิ่มเติม เช่น แผนงานเคหะและชุมชน หมวดค่าวัสดุ"
                    value={draft.notes}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, notes: e.target.value }))
                    }
                    className="mt-1.5 w-full rounded-lg border border-[#a8c4e4] bg-white px-3 py-2 text-xs font-normal text-[#132d4c]"
                  />
                </label>
              </div>

              {formError && (
                <div
                  role="alert"
                  className="rounded-lg border border-[#f0b4b4] bg-[#fff0f0] px-3 py-2 text-xs whitespace-pre-line text-[#b52c2c]"
                >
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-2 border-t border-[#d6e4f4] pt-4">
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
          <div className="w-full max-w-[420px] rounded-xl border border-[#9fc0e6] bg-white p-5 shadow-2xl">
            <h3 id="delete-pool-title" className="text-sm font-bold text-[#0f2a4a]">
              ยืนยันการลบ BUDGET DATA
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-[#365375]">
              ต้องการลบหมวดวงเงิน <b>{deleteTarget.pool.name}</b> (ปีงบฯ{' '}
              {deleteTarget.pool.year}) ออกจากระบบหรือไม่?
              {deleteTarget.linkedProjects.length > 0 && (
                <>
                  <br />
                  <span className="mt-1 inline-block text-[#a66d0d]">
                    หมายเหตุ: รายการจัดซื้อที่เชื่อมอยู่{' '}
                    {deleteTarget.linkedProjects.length} รายการ จะไม่ถูกลบ
                    แต่จะถูกเปลี่ยนกลับเป็นรายการเดี่ยว
                  </span>
                </>
              )}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-[#afc8e4] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#274469] hover:bg-[#edf4fc]"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="rounded-lg bg-[#b82828] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#961d1d]"
              >
                ยืนยันลบหมวดวงเงิน
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
