import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  FolderTree,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { STATUSES } from '../../data/constants';
import {
  calculateBudgetPoolUsageList,
  calculateCombinedFinancialOverview,
} from '../../domain/budgetPools';
import {
  buildExpenseHierarchySummary,
  formatExpenseClassification,
  getEffectiveExpenseCatalog,
  resolveProjectExpenseClassification,
  UNSPECIFIED_EXPENSE_CATEGORY,
  UNSPECIFIED_EXPENSE_SUBCATEGORY,
} from '../../domain/expenseCategories';
import { getStepName } from '../../domain/procurement';
import { useProcurement } from '../../storage/useProcurementStore';
import type { ProjectRecord, ProjectStatus } from '../../types/procurement';
import { currentFiscalYear } from '../../utils/date';
import { formatMoney } from '../../utils/format';
import { ExpenseCategoriesModal } from '../modals/ExpenseCategoriesModal';

interface DashboardPageProps {
  onViewProject: (id: string) => void;
  onEditProject: (id: string) => void;
  onCreateProject: () => void;
  onCreatePurchaseFromPool: (poolId: string) => void;
}

interface StatusBucket {
  id: string;
  label: string;
  color: string;
  statuses: ProjectStatus[];
}

const STATUS_BUCKETS: StatusBucket[] = [
  {
    id: 'prepare',
    label: 'รอ TOR / รออนุมัติ',
    color: '#f59e0b',
    statuses: ['รอจัดทำTOR และราคากลาง', 'รอดำเนินการ', 'รออนุมัติ'],
  },
  {
    id: 'in_progress',
    label: 'อยู่ระหว่างดำเนินการ',
    color: '#10b981',
    statuses: ['อยู่ระหว่างสั่งซื้อสั่งจ้าง', 'กำลังดำเนินการ'],
  },
  {
    id: 'completed',
    label: 'เสร็จสิ้น',
    color: '#2563eb',
    statuses: ['เสร็จสิ้น'],
  },
  {
    id: 'revision',
    label: 'ส่งกลับแก้ไข',
    color: '#e11d48',
    statuses: ['ส่งกลับแก้ไข'],
  },
  {
    id: 'paused',
    label: 'พักงาน / ยกเลิก',
    color: '#94a3b8',
    statuses: ['พักงาน', 'ยกเลิก'],
  },
];

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'เสร็จสิ้น':
      return 'bg-[#dbeafe] text-[#1d4ed8] border border-[#bfdbfe]';
    case 'อยู่ระหว่างสั่งซื้อสั่งจ้าง':
    case 'กำลังดำเนินการ':
      return 'bg-[#d1fae5] text-[#047857] border border-[#a7f3d0]';
    case 'รออนุมัติ':
    case 'รอจัดทำTOR และราคากลาง':
    case 'รอดำเนินการ':
      return 'bg-[#fef3c7] text-[#b45309] border border-[#fde68a]';
    case 'ส่งกลับแก้ไข':
      return 'bg-[#ffe4e6] text-[#be123c] border border-[#fecdd3]';
    default:
      return 'bg-[#f1f5f9] text-[#475569] border border-[#cbd5e1]';
  }
}

function getProjectProgressPercent(
  project: ProjectRecord,
  steps: Array<{ id: string }>,
): number {
  if (project.status === 'เสร็จสิ้น') return 100;
  if (project.status === 'ยกเลิก') return 0;
  const totalSteps = Math.max(1, steps.length);
  const stepIndex = steps.findIndex((s) => s.id === project.step);
  if (stepIndex < 0) return 20;
  if (stepIndex === totalSteps - 1) return 90;
  return Math.min(90, Math.round(((stepIndex + 1) / totalSteps) * 100));
}

function getDisplayBudget(project: ProjectRecord): number {
  if (project.budgetPoolId) {
    return Number(project.reference || 0);
  }
  return Number(project.budget || 0);
}

export function DashboardPage({
  onViewProject,
  onCreateProject,
  onCreatePurchaseFromPool,
}: DashboardPageProps) {
  const {
    state,
    user,
    viewFilter,
    filteredRows,
    navigate,
    updateViewFilter,
    refreshFromStorage,
  } = useProcurement();

  const [fundScope, setFundScope] = useState<string>('');
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<string>('');
  const [hoveredBucketId, setHoveredBucketId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<
    Record<string, boolean>
  >({});
  const [categoryModalOpen, setCategoryModalOpen] = useState<boolean>(false);

  const isAdmin = user.role === 'admin';
  const budgetPools = state.budgetPools || [];
  const poolById = useMemo(
    () => new Map(budgetPools.map((p) => [p.id, p])),
    [budgetPools],
  );

  const expenseCatalog = useMemo(
    () =>
      getEffectiveExpenseCatalog(
        state.expenseCategories,
        state.rows,
        budgetPools,
      ),
    [state.expenseCategories, state.rows, budgetPools],
  );

  // Available fiscal years for filter dropdown
  const availableYears = useMemo(() => {
    return [
      ...new Set([
        currentFiscalYear(),
        ...state.rows.map((r) => Number(r.year)),
        ...budgetPools.map((p) => Number(p.year)),
        ...(viewFilter.year ? [Number(viewFilter.year)] : []),
      ]),
    ]
      .filter((y) => Number.isFinite(y) && y > 0)
      .sort((a, b) => b - a);
  }, [state.rows, budgetPools, viewFilter.year]);

  // Distinct funding sources for dropdown
  const fundSources = useMemo(() => {
    return [
      ...new Set([
        ...state.rows.map((r) => String(r.fund || '').trim()),
        ...budgetPools.map((p) => String(p.fund || '').trim()),
      ]),
    ].filter(Boolean);
  }, [state.rows, budgetPools]);

  // Apply local funding/mode and expense category filter on top of global filteredRows
  const dashboardRows = useMemo(() => {
    return filteredRows.filter((r) => {
      if (fundScope === '__STANDALONE__' && r.budgetPoolId) return false;
      if (fundScope === '__BUDGET_DATA__' && !r.budgetPoolId) return false;
      if (
        fundScope &&
        fundScope !== '__STANDALONE__' &&
        fundScope !== '__BUDGET_DATA__' &&
        String(r.fund || '').trim() !== fundScope
      ) {
        return false;
      }
      if (expenseCategoryFilter) {
        const { category } = resolveProjectExpenseClassification(r, poolById);
        const effectiveCat = category || UNSPECIFIED_EXPENSE_CATEGORY;
        if (effectiveCat !== expenseCategoryFilter) return false;
      }
      return true;
    });
  }, [filteredRows, fundScope, expenseCategoryFilter, poolById]);

  const scopedBudgetPools = useMemo(() => {
    return budgetPools.filter((p) => {
      if (fundScope === '__STANDALONE__') return false;
      if (
        fundScope &&
        fundScope !== '__BUDGET_DATA__' &&
        String(p.fund || '').trim() !== fundScope
      ) {
        return false;
      }
      if (expenseCategoryFilter) {
        const effectiveCat =
          String(p.expenseCategory || '').trim() || UNSPECIFIED_EXPENSE_CATEGORY;
        if (effectiveCat !== expenseCategoryFilter) return false;
      }
      return true;
    });
  }, [budgetPools, fundScope, expenseCategoryFilter]);

  const overview = useMemo(
    () =>
      calculateCombinedFinancialOverview(
        dashboardRows,
        state.rows,
        scopedBudgetPools,
        viewFilter.year,
        viewFilter.q,
      ),
    [dashboardRows, state.rows, scopedBudgetPools, viewFilter.year, viewFilter.q],
  );

  const poolUsages = useMemo(
    () =>
      calculateBudgetPoolUsageList(
        scopedBudgetPools,
        state.rows,
        viewFilter.year,
        viewFilter.q,
      ),
    [scopedBudgetPools, state.rows, viewFilter.year, viewFilter.q],
  );

  const expenseHierarchy = useMemo(
    () => buildExpenseHierarchySummary(dashboardRows, poolUsages, budgetPools),
    [dashboardRows, poolUsages, budgetPools],
  );

  const totalSubCategoryCount = useMemo(
    () =>
      expenseHierarchy.reduce((sum, cat) => sum + cat.subCategories.length, 0),
    [expenseHierarchy],
  );

  // Card 1: Status proportion buckets (mutually exclusive, always sum to 100%)
  const statusSegments = useMemo(() => {
    const total = dashboardRows.length;
    const assignedIds = new Set<string>();

    const list = STATUS_BUCKETS.map((bucket) => {
      const matched = dashboardRows.filter((r) => {
        if (bucket.statuses.includes(r.status)) {
          assignedIds.add(r.id);
          return true;
        }
        return false;
      });
      const count = matched.length;
      return {
        ...bucket,
        count,
        pct: total > 0 ? (count / total) * 100 : 0,
      };
    });

    // Catch any unexpected custom status into "prepare" bucket
    const unmatched = dashboardRows.filter((r) => !assignedIds.has(r.id));
    if (unmatched.length > 0 && list[0]) {
      list[0].count += unmatched.length;
      list[0].pct = total > 0 ? (list[0].count / total) * 100 : 0;
    }

    return list;
  }, [dashboardRows]);

  // Card 2: Sub-category spending comparison (agreed + reserved) from expenseHierarchy
  const subCategoryComparison = useMemo(() => {
    const items: Array<{
      key: string;
      label: string;
      categoryName: string;
      subName: string;
      isUnspecified: boolean;
      budget: number;
      agreed: number;
      reserved: number;
      spent: number;
      count: number;
    }> = [];

    for (const cat of expenseHierarchy) {
      for (const sub of cat.subCategories) {
        const isUnspecified =
          cat.isUnspecified && sub.name === UNSPECIFIED_EXPENSE_SUBCATEGORY;
        const label = isUnspecified
          ? 'ยังไม่ระบุประเภทย่อย'
          : sub.name === UNSPECIFIED_EXPENSE_SUBCATEGORY
            ? `${cat.name} (ไม่ระบุย่อย)`
            : sub.name;
        const spent = sub.agreed + sub.reserved;
        items.push({
          key: `${cat.name}::${sub.name}`,
          label,
          categoryName: cat.name,
          subName: sub.name,
          isUnspecified,
          budget: sub.budget,
          agreed: sub.agreed,
          reserved: sub.reserved,
          spent,
          count: sub.projectCount > 0 ? sub.projectCount : sub.poolCount,
        });
      }
    }

    items.sort((a, b) => {
      if (a.isUnspecified !== b.isUnspecified) return a.isUnspecified ? 1 : -1;
      if (b.spent !== a.spent) return b.spent - a.spent;
      if (b.budget !== a.budget) return b.budget - a.budget;
      return a.label.localeCompare(b.label, 'th');
    });

    const totalSpent = items.reduce((s, x) => s + x.spent, 0);
    const maxSpent = items.reduce((m, x) => Math.max(m, x.spent), 0);

    const MAX_VISIBLE = 5;
    if (items.length <= MAX_VISIBLE) {
      return {
        rows: items,
        totalSpent,
        maxSpent,
        totalCount: items.length,
      };
    }

    const head = items.slice(0, MAX_VISIBLE - 1);
    const rest = items.slice(MAX_VISIBLE - 1);
    const otherBudget = rest.reduce((s, x) => s + x.budget, 0);
    const otherAgreed = rest.reduce((s, x) => s + x.agreed, 0);
    const otherReserved = rest.reduce((s, x) => s + x.reserved, 0);
    const otherSpent = otherAgreed + otherReserved;
    const otherCount = rest.reduce((s, x) => s + x.count, 0);

    return {
      rows: [
        ...head,
        {
          key: '__OTHER_SUBS__',
          label: `ประเภทย่อยอื่น ๆ (${rest.length} ประเภท)`,
          categoryName: '',
          subName: '',
          isUnspecified: true,
          budget: otherBudget,
          agreed: otherAgreed,
          reserved: otherReserved,
          spent: otherSpent,
          count: otherCount,
        },
      ],
      totalSpent,
      maxSpent: Math.max(maxSpent, otherSpent),
      totalCount: items.length,
    };
  }, [expenseHierarchy]);

  // Card 3: Budget percentages
  const agreedPct = overview.totalBudget
    ? Math.min(100, (overview.totalAgreed / overview.totalBudget) * 100)
    : 0;
  const voucherPct = overview.totalBudget
    ? Math.min(100, (overview.totalVoucher / overview.totalBudget) * 100)
    : 0;

  const latestRows = dashboardRows.slice(0, 5);
  const activeHoveredBucket = hoveredBucketId
    ? statusSegments.find((s) => s.id === hoveredBucketId) || null
    : null;

  const donutRadius = 52;
  const donutCircumference = 2 * Math.PI * donutRadius;

  return (
    <div className="space-y-4">
      {/* 1) Clean Page Header Card (no banner image) */}
      <section className="rounded-2xl border border-[#c6daf0] bg-white px-6 py-4 shadow-[0_2px_10px_rgba(15,42,74,0.04)] sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-bold tracking-tight text-[#0f489e] sm:text-[24px]">
              ภาพรวมงานจัดซื้อจัดจ้าง
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#43648a] sm:text-[13px]">
              <span>สถานะ ความคืบหน้า งบประมาณ และรายละเอียดการจัดซื้อจัดจ้าง</span>
              <span aria-hidden="true" className="text-[#9cb9da]">
                ·
              </span>
              <span className="font-bold text-[#1355b0] tabular-nums">
                {viewFilter.year
                  ? `ปีงบประมาณ พ.ศ. ${viewFilter.year}`
                  : 'ทุกปีงบประมาณ'}
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* 2) 4-Column Filter Strip */}
      <section
        aria-label="ตัวกรองภาพรวม"
        className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"
      >
        <label className="block rounded-xl border border-[#c6daf0] bg-white px-4 py-2.5 shadow-[0_1px_4px_rgba(15,42,74,0.03)] transition focus-within:border-[#1c64c7] focus-within:ring-2 focus-within:ring-[#bfdcff]">
          <span className="block text-[11px] font-semibold text-[#5a7696]">
            หมวดค่าใช้จ่าย
          </span>
          <select
            value={expenseCategoryFilter}
            onChange={(e) => setExpenseCategoryFilter(e.target.value)}
            className="mt-1 block w-full cursor-pointer bg-transparent text-[13px] font-bold text-[#0f2a4a] focus:outline-none"
          >
            <option value="">ทุกหมวดค่าใช้จ่าย</option>
            {expenseCatalog.map((group) => (
              <option key={group.id} value={group.name}>
                {group.name}
              </option>
            ))}
            <option value={UNSPECIFIED_EXPENSE_CATEGORY}>
              {UNSPECIFIED_EXPENSE_CATEGORY}
            </option>
          </select>
        </label>

        <label className="block rounded-xl border border-[#c6daf0] bg-white px-4 py-2.5 shadow-[0_1px_4px_rgba(15,42,74,0.03)] transition focus-within:border-[#1c64c7] focus-within:ring-2 focus-within:ring-[#bfdcff]">
          <span className="block text-[11px] font-semibold text-[#5a7696]">
            หมวดงบประมาณ / แหล่งงบ
          </span>
          <select
            value={fundScope}
            onChange={(e) => setFundScope(e.target.value)}
            className="mt-1 block w-full cursor-pointer bg-transparent text-[13px] font-bold text-[#0f2a4a] focus:outline-none"
          >
            <option value="">ทั้งหมด</option>
            <option value="__STANDALONE__">โครงการเดี่ยวเท่านั้น</option>
            <option value="__BUDGET_DATA__">BUDGET DATA (งบหมวดวัสดุ)</option>
            {fundSources.map((fund) => (
              <option key={fund} value={fund}>
                {fund}
              </option>
            ))}
          </select>
        </label>

        <label className="block rounded-xl border border-[#c6daf0] bg-white px-4 py-2.5 shadow-[0_1px_4px_rgba(15,42,74,0.03)] transition focus-within:border-[#1c64c7] focus-within:ring-2 focus-within:ring-[#bfdcff]">
          <span className="block text-[11px] font-semibold text-[#5a7696]">
            สถานะโครงการ
          </span>
          <select
            value={viewFilter.status}
            onChange={(e) => updateViewFilter({ status: e.target.value })}
            className="mt-1 block w-full cursor-pointer bg-transparent text-[13px] font-bold text-[#0f2a4a] focus:outline-none"
          >
            <option value="">ทั้งหมด</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center justify-between gap-2 rounded-xl border border-[#c6daf0] bg-white px-4 py-2.5 shadow-[0_1px_4px_rgba(15,42,74,0.03)] transition focus-within:border-[#1c64c7] focus-within:ring-2 focus-within:ring-[#bfdcff]">
          <label className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold text-[#5a7696]">
              ปีงบประมาณ
            </span>
            <select
              value={viewFilter.year}
              onChange={(e) => updateViewFilter({ year: e.target.value })}
              className="mt-1 block w-full cursor-pointer bg-transparent text-[13px] font-bold text-[#0f2a4a] focus:outline-none"
            >
              <option value="">ทุกปีงบประมาณ</option>
              {availableYears.map((y) => (
                <option key={y} value={String(y)}>
                  ปีงบประมาณ {y}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={refreshFromStorage}
            title="รีเฟรชข้อมูลล่าสุด"
            aria-label="รีเฟรชข้อมูลล่าสุด"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#d6e5f5] bg-[#f4f8fd] text-[#1453a8] transition hover:border-[#8bb7e8] hover:bg-[#e5f0fc]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </section>

      {/* 3) 3 Blue-Header Executive Summary Cards */}
      <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-3">
        {/* Card 1: สัดส่วนโครงการตามสถานะ */}
        <section className="flex flex-col overflow-hidden rounded-2xl border border-[#c6daf0] bg-white shadow-[0_2px_10px_rgba(15,42,74,0.04)]">
          <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-[#1150a6] to-[#1b6ec9] px-5 py-3.5 text-white">
            <h2 className="text-[14px] font-bold tracking-tight">
              สัดส่วนโครงการตามสถานะ
            </h2>
          </div>

          <div className="flex flex-1 flex-col justify-between p-5">
            <div className="flex flex-col items-center gap-5 sm:flex-row">
              {/* Donut Chart */}
              <div className="relative h-[138px] w-[138px] shrink-0">
                <svg
                  viewBox="0 0 140 140"
                  className="h-full w-full"
                  role="img"
                  aria-label="แผนภูมิสัดส่วนโครงการตามสถานะ"
                >
                  <circle
                    cx="70"
                    cy="70"
                    r={donutRadius}
                    fill="none"
                    stroke="#e6eff8"
                    strokeWidth="18"
                  />

                  {dashboardRows.length > 0 && (
                    <g transform="rotate(-90 70 70)">
                      {(() => {
                        let acc = 0;
                        return statusSegments
                          .filter((seg) => seg.count > 0)
                          .map((seg) => {
                            const segLen =
                              (seg.count / dashboardRows.length) *
                              donutCircumference;
                            const offset = -acc;
                            acc += segLen;
                            const isDimmed =
                              hoveredBucketId !== null &&
                              hoveredBucketId !== seg.id;

                            return (
                              <circle
                                key={seg.id}
                                cx="70"
                                cy="70"
                                r={donutRadius}
                                fill="none"
                                stroke={seg.color}
                                strokeWidth={hoveredBucketId === seg.id ? 21 : 18}
                                strokeDasharray={`${segLen} ${Math.max(
                                  0,
                                  donutCircumference - segLen,
                                )}`}
                                strokeDashoffset={offset}
                                className="cursor-pointer transition-opacity duration-150"
                                style={{ opacity: isDimmed ? 0.3 : 1 }}
                                onMouseEnter={() => setHoveredBucketId(seg.id)}
                                onMouseLeave={() => setHoveredBucketId(null)}
                                onClick={() => {
                                  if (seg.statuses.length === 1) {
                                    updateViewFilter({ status: seg.statuses[0] });
                                    navigate('register');
                                  } else {
                                    navigate('register');
                                  }
                                }}
                              >
                                <title>
                                  {seg.label}: {seg.count} โครงการ (
                                  {seg.pct.toFixed(0)}%)
                                </title>
                              </circle>
                            );
                          });
                      })()}
                    </g>
                  )}
                </svg>

                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
                  {activeHoveredBucket ? (
                    <>
                      <span className="font-mono-num text-[22px] font-bold leading-none text-[#0f2a4a] tabular-nums">
                        {activeHoveredBucket.count}
                      </span>
                      <span className="mt-1 text-[10.5px] font-semibold text-[#47688d] tabular-nums">
                        {activeHoveredBucket.pct.toFixed(0)}%
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="font-mono-num text-[26px] font-bold leading-none text-[#0f2a4a] tabular-nums">
                        {dashboardRows.length}
                      </span>
                      <span className="mt-1 text-[11px] font-medium text-[#526f8f]">
                        โครงการ
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* 5 Grouped Status Rows */}
              <div className="w-full min-w-0 flex-1 space-y-2">
                {statusSegments.map((seg) => (
                  <button
                    key={seg.id}
                    type="button"
                    onMouseEnter={() => setHoveredBucketId(seg.id)}
                    onMouseLeave={() => setHoveredBucketId(null)}
                    onClick={() => {
                      if (seg.statuses.length === 1) {
                        updateViewFilter({ status: seg.statuses[0] });
                      }
                      navigate('register');
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-left transition-colors ${
                      hoveredBucketId === seg.id
                        ? 'bg-[#edf4fc]'
                        : 'hover:bg-[#f5f9fe]'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-3 w-2.5 shrink-0 rounded-[3px]"
                        style={{ backgroundColor: seg.color }}
                      />
                      <span className="truncate text-[12px] font-medium text-[#1b3a5c]">
                        {seg.label}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono-num text-[12px] font-bold text-[#0f2a4a] tabular-nums">
                      {seg.count}{' '}
                      <span className="font-normal text-[11px] text-[#6d87a4]">
                        ({seg.pct.toFixed(0)}%)
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between rounded-xl border border-[#dce8f6] bg-[#f1f6fc] px-4 py-2.5 text-xs font-bold text-[#14355c]">
              <span>รวมทั้งหมด</span>
              <span className="font-mono-num text-[#1150a6] tabular-nums">
                {dashboardRows.length} โครงการ
              </span>
            </div>
          </div>
        </section>

        {/* Card 2: เปรียบเทียบตามประเภทย่อย */}
        <section className="flex flex-col overflow-hidden rounded-2xl border border-[#c6daf0] bg-white shadow-[0_2px_10px_rgba(15,42,74,0.04)]">
          <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-[#1150a6] to-[#1b6ec9] px-5 py-3.5 text-white">
            <h2 className="text-[14px] font-bold tracking-tight">
              เปรียบเทียบตามประเภทย่อย
            </h2>
            <span className="shrink-0 whitespace-nowrap font-mono-num text-[11.5px] font-semibold text-[#dceeff] tabular-nums">
              {subCategoryComparison.totalCount} ประเภทย่อย
            </span>
          </div>

          <div className="flex flex-1 flex-col justify-between p-5">
            <div className="space-y-3">
              {subCategoryComparison.rows.length > 0 ? (
                subCategoryComparison.rows.map((item, idx) => {
                  const sharePct =
                    subCategoryComparison.totalSpent > 0
                      ? (item.spent / subCategoryComparison.totalSpent) * 100
                      : 0;
                  const agreedBarPct =
                    subCategoryComparison.maxSpent > 0
                      ? (item.agreed / subCategoryComparison.maxSpent) * 100
                      : 0;
                  const reservedBarPct =
                    subCategoryComparison.maxSpent > 0
                      ? (item.reserved / subCategoryComparison.maxSpent) * 100
                      : 0;
                  const barColors = [
                    'from-[#1150a6] to-[#2176d6]',
                    'from-[#0d825b] to-[#10b981]',
                    'from-[#2563eb] to-[#60a5fa]',
                    'from-[#0e7490] to-[#06b6d4]',
                    'from-[#64748b] to-[#94a3b8]',
                  ];
                  const barColor = item.isUnspecified
                    ? 'from-[#94a3b8] to-[#cbd5e1]'
                    : barColors[idx % barColors.length];
                  const canDrillDown =
                    item.key !== '__OTHER_SUBS__' && !item.isUnspecified;

                  return (
                    <button
                      key={item.key}
                      type="button"
                      disabled={!canDrillDown}
                      onClick={() => {
                        if (!canDrillDown) return;
                        updateViewFilter({
                          expenseCategory: item.categoryName,
                          expenseSubCategory:
                            item.subName === UNSPECIFIED_EXPENSE_SUBCATEGORY
                              ? ''
                              : item.subName,
                        });
                        navigate('register');
                      }}
                      title={`${item.label}${item.categoryName ? ` (${item.categoryName})` : ''} · ตกลงซื้อ/จ้าง ฿ ${formatMoney(item.agreed)}${item.reserved > 0 ? ` + กันวงเงิน ฿ ${formatMoney(item.reserved)}` : ''} · รวม ฿ ${formatMoney(item.spent)}`}
                      className={`block w-full rounded-lg px-2 py-1.5 text-left transition ${
                        canDrillDown
                          ? 'cursor-pointer hover:bg-[#f1f6fc]'
                          : 'cursor-default'
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="truncate font-semibold text-[#17395e]">
                          {item.label}
                        </span>
                        <span className="shrink-0 font-mono-num font-bold text-[#0f2a4a] tabular-nums">
                          {formatMoney(item.spent)} บ.{' '}
                          <span className="font-normal text-[11px] text-[#6a86a3]">
                            ({sharePct.toFixed(0)}%)
                          </span>
                        </span>
                      </div>
                      <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-[#e6eff9]">
                        {item.agreed > 0 && (
                          <div
                            className={`h-full bg-gradient-to-r ${barColor} transition-all`}
                            style={{
                              width: `${Math.max(agreedBarPct, 4)}%`,
                            }}
                          />
                        )}
                        {item.reserved > 0 && (
                          <div
                            className="h-full bg-[#f59e0b] transition-all"
                            style={{
                              width: `${Math.max(reservedBarPct, 3)}%`,
                            }}
                          />
                        )}
                      </div>
                      {item.reserved > 0 && (
                        <div className="mt-1 flex items-center justify-between text-[10px] text-[#6c829c] tabular-nums">
                          <span>
                            ตกลง {formatMoney(item.agreed)} บ.
                          </span>
                          <span className="font-medium text-[#b45309]">
                            กันเงิน {formatMoney(item.reserved)} บ.
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })
              ) : (
                <div className="rounded-xl border border-dashed border-[#d2e2f3] bg-[#f7fbff] px-4 py-6 text-center text-xs text-[#607d9d]">
                  ยังไม่มีข้อมูลประเภทย่อยในชุดข้อมูลนี้
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center justify-between gap-2 rounded-xl border border-[#dce8f6] bg-[#f1f6fc] px-4 py-2.5 text-xs font-bold text-[#14355c] tabular-nums">
              <span>ค่าใช้จ่ายรวม (รวมกันเงิน)</span>
              <span className="font-mono-num text-[#1150a6]">
                {formatMoney(subCategoryComparison.totalSpent)} บ.
              </span>
            </div>
          </div>
        </section>

        {/* Card 3: ภาพรวมงบประมาณ */}
        <section className="flex flex-col overflow-hidden rounded-2xl border border-[#c6daf0] bg-white shadow-[0_2px_10px_rgba(15,42,74,0.04)]">
          <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-[#1150a6] to-[#1b6ec9] px-5 py-3.5 text-white">
            <h2 className="text-[14px] font-bold tracking-tight">
              ภาพรวมงบประมาณ{' '}
              {viewFilter.year ? `พ.ศ. ${viewFilter.year}` : 'ทุกปีงบฯ'}
            </h2>
            <span className="shrink-0 whitespace-nowrap font-mono-num text-[11.5px] font-semibold text-[#dceeff] tabular-nums">
              {dashboardRows.length} โครงการ
            </span>
          </div>

          <div className="flex flex-1 flex-col justify-between p-5">
            <div className="space-y-4">
              {/* Bar 1: งบประมาณรวมสุทธิ */}
              <div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-2 font-semibold text-[#234366]">
                    <span className="h-3 w-2.5 rounded-[3px] bg-[#f59e0b]" />
                    งบประมาณรวมสุทธิ
                  </span>
                  <span className="font-mono-num text-[13.5px] font-bold text-[#0f2a4a] tabular-nums">
                    {formatMoney(overview.totalBudget)} บ.
                  </span>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#eef2f7]">
                  <div
                    className="h-full rounded-full bg-[#f59e0b] transition-all"
                    style={{ width: overview.totalBudget > 0 ? '100%' : '0%' }}
                  />
                </div>
              </div>

              {/* Bar 2: วงเงินตกลงซื้อ / จ้าง */}
              <div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-2 font-semibold text-[#234366]">
                    <span className="h-3 w-2.5 rounded-[3px] bg-[#10b981]" />
                    วงเงินตกลงซื้อ / จ้าง
                  </span>
                  <span className="font-mono-num text-[13.5px] font-bold text-[#0f2a4a] tabular-nums">
                    {formatMoney(overview.totalAgreed)} บ.
                  </span>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#eef2f7]">
                  <div
                    className="h-full rounded-full bg-[#10b981] transition-all"
                    style={{ width: `${agreedPct}%` }}
                  />
                </div>
              </div>

              {/* Bar 3: เบิกจ่ายฎีกาแล้ว */}
              <div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-2 font-semibold text-[#234366]">
                    <span className="h-3 w-2.5 rounded-[3px] bg-[#2563eb]" />
                    เบิกจ่ายฎีกาแล้ว
                  </span>
                  <span className="font-mono-num text-[13.5px] font-bold text-[#1d4ed8] tabular-nums">
                    {formatMoney(overview.totalVoucher)} บ.
                  </span>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#eef2f7]">
                  <div
                    className="h-full rounded-full bg-[#2563eb] transition-all"
                    style={{ width: `${voucherPct}%` }}
                  />
                </div>
              </div>

              {overview.totalReserved > 0 && (
                <div className="flex items-center justify-between gap-2 text-[11px] text-[#7c5611] tabular-nums">
                  <span>กันวงเงินตามราคากลาง (BUDGET DATA)</span>
                  <span className="font-mono-num font-semibold">
                    {formatMoney(overview.totalReserved)} บ.
                  </span>
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center justify-between gap-2 rounded-xl border border-[#dce8f6] bg-[#f1f6fc] px-4 py-2.5 text-xs font-bold text-[#14355c] tabular-nums">
              <span>ตกลงซื้อ/จ้าง {agreedPct.toFixed(0)}%</span>
              <span className="text-[#1150a6]">
                คงเหลือ {formatMoney(overview.totalRemaining)} บ.
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* 3.5) สรุปตามหมวดค่าใช้จ่ายและประเภทย่อย */}
      <section className="overflow-hidden rounded-2xl border border-[#c6daf0] bg-white shadow-[0_2px_10px_rgba(15,42,74,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dce8f6] bg-gradient-to-r from-[#f3f8fe] to-[#e8f2fc] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-[#1150a6] ring-1 ring-[#c3d9f0]">
              <FolderTree className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-[15px] font-bold text-[#0f2a4a]">
                สรุปตามหมวดค่าใช้จ่ายและประเภทย่อย
              </h2>
              <p className="mt-0.5 text-[11px] text-[#4c6b8e] tabular-nums">
                แยกงบประมาณและวงเงินตกลงซื้อ/จ้างตามโครงสร้างหมวดค่าใช้จ่าย ({expenseHierarchy.length} หมวด · {totalSubCategoryCount} ประเภทย่อย)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {expenseCategoryFilter && (
              <button
                type="button"
                onClick={() => setExpenseCategoryFilter('')}
                className="rounded-lg border border-[#c5daf0] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#31557d] hover:bg-[#edf4fc]"
              >
                ล้างตัวกรองหมวด
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('budgets')}
              className="inline-flex items-center gap-1 whitespace-nowrap shrink-0 rounded-lg border border-[#aecae9] bg-white px-3 py-1.5 text-xs font-semibold text-[#1150a6] transition hover:border-[#6ea2df] hover:bg-[#e7f1fc]"
            >
              จัดการ BUDGET DATA
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setCategoryModalOpen(true)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-[#aecae9] bg-white px-3 py-1.5 text-xs font-semibold text-[#1150a6] transition hover:border-[#6ea2df] hover:bg-[#e7f1fc]"
              >
                <FolderTree className="h-3.5 w-3.5" />
                จัดการหมวดค่าใช้จ่าย
              </button>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {expenseHierarchy.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#c8dcf2] bg-[#f7fbff] px-5 py-7 text-center text-xs text-[#567496]">
              ยังไม่มีรายการที่จำแนกหมวดค่าใช้จ่ายในชุดข้อมูลนี้ — ระบุหมวดค่าใช้จ่ายและประเภทย่อยได้ในหน้าบันทึกโครงการหรือ BUDGET DATA
            </div>
          ) : (
            <div className="space-y-3">
              {expenseHierarchy.map((cat) => {
                const isExpanded = Boolean(expandedCategories[cat.name]);
                const usedAmt = cat.agreed + cat.reserved;
                const catUsePct =
                  cat.budget > 0
                    ? Math.min(100, (usedAmt / cat.budget) * 100)
                    : 0;
                const shareOfTotal =
                  overview.totalBudget > 0
                    ? Math.min(100, (cat.budget / overview.totalBudget) * 100)
                    : 0;

                return (
                  <div
                    key={cat.name}
                    className="overflow-hidden rounded-xl border border-[#d4e4f5] bg-[#f8fbff]"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedCategories((prev) => ({
                          ...prev,
                          [cat.name]: !isExpanded,
                        }))
                      }
                      className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-[#eef5fd]"
                    >
                      <div className="flex min-w-[200px] flex-1 items-center gap-2.5">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white text-[#1150a6] ring-1 ring-[#c6dcf2]">
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`text-[13.5px] font-bold ${
                                cat.isUnspecified
                                  ? 'text-[#5b7694]'
                                  : 'text-[#0f2a4a]'
                              }`}
                            >
                              {cat.name}
                            </span>
                            <span className="rounded bg-white px-2 py-0.5 text-[10.5px] font-semibold text-[#3f628a] ring-1 ring-[#d1e2f4] tabular-nums">
                              {cat.subCategories.length} ประเภทย่อย ·{' '}
                              {cat.projectCount} รายการ
                              {cat.poolCount > 0
                                ? ` · ${cat.poolCount} BUDGET DATA`
                                : ''}
                            </span>
                          </div>
                          <div className="mt-1.5 flex max-w-[280px] items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#dce9f7]">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-[#1150a6] to-[#1e7ee0]"
                                style={{
                                  width: `${Math.max(catUsePct, usedAmt > 0 ? 4 : 0)}%`,
                                }}
                              />
                            </div>
                            <span className="font-mono-num text-[10.5px] font-semibold text-[#47678a] tabular-nums">
                              ใช้ไป {catUsePct.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-right tabular-nums">
                        <div>
                          <div className="text-[10px] font-medium text-[#5c7899]">
                            งบประมาณ ({shareOfTotal.toFixed(0)}%)
                          </div>
                          <div className="font-mono-num text-[13px] font-bold text-[#0f2a4a]">
                            ฿ {formatMoney(cat.budget)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] font-medium text-[#5c7899]">
                            ตกลงซื้อ/จ้าง
                          </div>
                          <div className="font-mono-num text-[13px] font-bold text-[#047857]">
                            ฿ {formatMoney(cat.agreed)}
                          </div>
                        </div>
                        <div className="hidden sm:block">
                          <div className="text-[10px] font-medium text-[#5c7899]">
                            คงเหลือ
                          </div>
                          <div
                            className={`font-mono-num text-[13px] font-bold ${
                              cat.budget - usedAmt < 0
                                ? 'text-[#be123c]'
                                : 'text-[#1150a6]'
                            }`}
                          >
                            ฿ {formatMoney(cat.budget - usedAmt)}
                          </div>
                        </div>
                      </div>
                    </button>

                    {isExpanded && cat.subCategories.length > 0 && (
                      <div className="border-t border-[#dce8f6] bg-white p-4">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {cat.subCategories.map((sub) => {
                            const subBudget = Math.max(0, sub.budget);
                            const subUsed = sub.agreed + sub.reserved;
                            const subRemaining = subBudget - subUsed;
                            const isOverBudget =
                              subBudget > 0 && subUsed > subBudget;
                            const utilizationPct =
                              subBudget > 0 ? (subUsed / subBudget) * 100 : 0;
                            const pAgreedPct =
                              subBudget > 0
                                ? Math.min(100, (sub.agreed / subBudget) * 100)
                                : 0;
                            const pReservedPct =
                              subBudget > 0
                                ? Math.min(
                                    Math.max(0, 100 - pAgreedPct),
                                    (sub.reserved / subBudget) * 100,
                                  )
                                : 0;
                            const singlePool =
                              sub.pools.length === 1 ? sub.pools[0] : null;
                            const classificationText =
                              formatExpenseClassification(
                                cat.isUnspecified ? '' : cat.name,
                                sub.name === UNSPECIFIED_EXPENSE_SUBCATEGORY
                                  ? ''
                                  : sub.name,
                              ) || cat.name;

                            return (
                              <article
                                key={sub.name}
                                className={`flex flex-col justify-between rounded-xl border p-4 ${
                                  isOverBudget
                                    ? 'border-[#f4b8c2] bg-[#fff9fa]'
                                    : 'border-[#d4e4f5] bg-[#f8fbff]'
                                }`}
                              >
                                <div>
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] font-medium text-[#527092] tabular-nums">
                                        {sub.years.length > 0 ? (
                                          <span>
                                            ปีงบฯ {sub.years.join(', ')}
                                          </span>
                                        ) : (
                                          <span>
                                            {viewFilter.year
                                              ? `ปีงบฯ ${viewFilter.year}`
                                              : 'ทุกปีงบฯ'}
                                          </span>
                                        )}
                                        {singlePool?.code ? (
                                          <>
                                            <span>·</span>
                                            <span className="font-mono-num">
                                              {singlePool.code}
                                            </span>
                                          </>
                                        ) : sub.poolCount > 1 ? (
                                          <>
                                            <span>·</span>
                                            <span>
                                              {sub.poolCount} BUDGET DATA
                                            </span>
                                          </>
                                        ) : null}
                                      </div>
                                      <h3 className="mt-0.5 truncate text-[13.5px] font-bold text-[#0f2a4a]">
                                        {sub.name}
                                      </h3>
                                      <div className="mt-0.5 truncate text-[10.5px] font-medium text-[#1d5ab5]">
                                        {classificationText}
                                      </div>
                                    </div>

                                    <span
                                      className={`shrink-0 font-mono-num text-xs font-bold tabular-nums ${
                                        isOverBudget
                                          ? 'text-[#be123c]'
                                          : utilizationPct >= 85
                                            ? 'text-[#b45309]'
                                            : 'text-[#1150a6]'
                                      }`}
                                    >
                                      {utilizationPct.toFixed(0)}%
                                    </span>
                                  </div>

                                  <div
                                    className="mt-3 flex h-2 overflow-hidden rounded-full bg-[#dce9f7]"
                                    title={`ตกลงซื้อ/จ้าง ฿ ${formatMoney(sub.agreed)}${sub.reserved > 0 ? ` + กันวงเงิน ฿ ${formatMoney(sub.reserved)}` : ''} จากงบประมาณ ฿ ${formatMoney(subBudget)}`}
                                  >
                                    {isOverBudget ? (
                                      <div className="h-full w-full bg-[#e11d48]" />
                                    ) : (
                                      <>
                                        {pAgreedPct > 0 && (
                                          <div
                                            className="h-full bg-gradient-to-r from-[#1150a6] to-[#1e7ee0] transition-all"
                                            style={{ width: `${pAgreedPct}%` }}
                                          />
                                        )}
                                        {pReservedPct > 0 && (
                                          <div
                                            className="h-full bg-[#f59e0b] transition-all"
                                            style={{
                                              width: `${pReservedPct}%`,
                                            }}
                                          />
                                        )}
                                      </>
                                    )}
                                  </div>

                                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                                    <div>
                                      <div className="text-[10px] text-[#5c7899]">
                                        ใช้ไป / ตั้งไว้
                                      </div>
                                      <div className="font-mono-num font-semibold text-[#13345c] tabular-nums">
                                        ฿ {formatMoney(subUsed)}
                                        <span className="font-normal text-[#6581a1]">
                                          {' '}
                                          / {formatMoney(subBudget)}
                                        </span>
                                      </div>
                                      {sub.reserved > 0 && (
                                        <div className="mt-0.5 font-mono-num text-[10px] font-medium text-[#b45309] tabular-nums">
                                          รวมกันเงิน ฿ {formatMoney(sub.reserved)}
                                        </div>
                                      )}
                                    </div>
                                    <div className="text-right">
                                      <div className="text-[10px] text-[#5c7899]">
                                        คงเหลือ
                                      </div>
                                      <div
                                        className={`font-mono-num font-bold tabular-nums ${
                                          subRemaining < 0
                                            ? 'text-[#be123c]'
                                            : 'text-[#047857]'
                                        }`}
                                      >
                                        ฿ {formatMoney(subRemaining)}
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#dce8f6] pt-2.5 text-[11px]">
                                  <span className="text-[#517094] tabular-nums">
                                    {sub.poolCount > 0
                                      ? `ซื้อแล้ว ${sub.projectCount} ครั้ง`
                                      : `${sub.projectCount} รายการ`}
                                  </span>
                                  {isAdmin && singlePool ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onCreatePurchaseFromPool(singlePool.id)
                                      }
                                      className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-[#1150a6] hover:underline"
                                    >
                                      <Plus className="h-3 w-3" />
                                      ซื้อในวงเงินนี้
                                    </button>
                                  ) : !cat.isUnspecified ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        updateViewFilter({
                                          expenseCategory: cat.name,
                                          expenseSubCategory:
                                            sub.name ===
                                            UNSPECIFIED_EXPENSE_SUBCATEGORY
                                              ? ''
                                              : sub.name,
                                        });
                                        navigate('register');
                                      }}
                                      className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-[#1150a6] hover:underline"
                                    >
                                      ดูรายการ
                                      <ArrowUpRight className="h-3 w-3" />
                                    </button>
                                  ) : null}
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* 4) รายการโครงการล่าสุด */}
      <section className="overflow-hidden rounded-2xl border border-[#c6daf0] bg-white shadow-[0_2px_10px_rgba(15,42,74,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dce8f6] bg-gradient-to-r from-[#f3f8fe] to-[#e8f2fc] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[15px] font-bold text-[#0f2a4a]">
              รายการโครงการล่าสุด
            </h2>
            <span className="text-xs font-medium text-[#4d6d91] tabular-nums">
              · แสดง {latestRows.length} จาก {dashboardRows.length} รายการ
            </span>
          </div>
          <button
            type="button"
            onClick={() => navigate('register')}
            className="inline-flex items-center gap-1 whitespace-nowrap shrink-0 rounded-lg border border-[#aecae9] bg-white px-3 py-1.5 text-xs font-semibold text-[#1150a6] transition hover:border-[#6ea2df] hover:bg-[#e7f1fc]"
          >
            ดูทะเบียนทั้งหมด
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="p-4 sm:p-5">
          {latestRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#c8dcf2] bg-[#f7fbff] px-5 py-10 text-center">
              <p className="text-sm font-semibold text-[#173b66]">
                ยังไม่มีรายการโครงการในชุดข้อมูลนี้
              </p>
              <p className="mt-1 text-xs text-[#567496]">
                เพิ่มโครงการใหม่หรือปรับตัวกรองด้านบนเพื่อดูรายละเอียด
              </p>
              {isAdmin && (
                <button
                  type="button"
                  onClick={onCreateProject}
                  className="mt-4 inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#1150a6] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#0d3f85]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  เพิ่มโครงการแรก
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] table-fixed border-collapse text-left">
                <colgroup>
                  <col style={{ width: '34%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '18%' }} />
                </colgroup>
                <thead>
                  <tr className="bg-[#eef5fc] text-[12px] font-semibold text-[#173d6b]">
                    <th className="rounded-l-xl px-4 py-2.5">ชื่อโครงการ</th>
                    <th className="px-3 py-2.5 text-center">สถานะ</th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">
                      งบประมาณ
                    </th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">
                      วงเงินตกลงซื้อ
                    </th>
                    <th className="rounded-r-xl px-4 py-2.5 whitespace-nowrap">
                      ความคืบหน้า
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {latestRows.map((r) => {
                    const displayBudget = getDisplayBudget(r);
                    const agreedAmount = Number(r.agreed || 0);
                    const progressPct = getProjectProgressPercent(
                      r,
                      state.steps,
                    );
                    const stepName = getStepName(state.steps, r.step);

                    return (
                      <tr
                        key={r.id}
                        onClick={() => onViewProject(r.id)}
                        className="cursor-pointer border-b border-[#e8f0f9] transition-colors last:border-b-0 hover:bg-[#f4f9fe]"
                      >
                        <td className="px-4 py-3.5 align-middle">
                          <div
                            className="truncate text-[13px] font-semibold text-[#0f2a4a]"
                            title={r.title}
                          >
                            {r.title}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-[#587596] tabular-nums">
                            {r.code} · ปีงบฯ {r.year} · {r.department}
                          </div>
                        </td>

                        <td className="px-2.5 py-3.5 text-center align-middle">
                          <span
                            className={`inline-block max-w-full truncate rounded-md px-2.5 py-1 text-[11px] font-semibold leading-tight ${getStatusBadgeClass(
                              r.status,
                            )}`}
                            title={r.status}
                          >
                            {r.status}
                          </span>
                        </td>

                        <td className="px-3 py-3.5 text-right align-middle font-mono-num text-[12.5px] font-semibold tabular-nums whitespace-nowrap">
                          {displayBudget > 0 ? (
                            <span className="text-[#16365b]">
                              {formatMoney(displayBudget)}
                            </span>
                          ) : (
                            <span className="text-[#8ba4bf]">—</span>
                          )}
                        </td>

                        <td className="px-3 py-3.5 text-right align-middle font-mono-num text-[12.5px] font-semibold tabular-nums whitespace-nowrap">
                          {agreedAmount > 0 ? (
                            <span className="text-[#0f6b47]">
                              {formatMoney(agreedAmount)}
                            </span>
                          ) : (
                            <span className="text-[#8ba4bf]">—</span>
                          )}
                        </td>

                        <td
                          className="px-4 py-3.5 align-middle"
                          title={`${stepName} (${progressPct}%)`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#e3edf7]">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-[#1150a6] to-[#237be0] transition-all"
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                            <span className="w-8 shrink-0 text-right font-mono-num text-[11.5px] font-semibold text-[#2e4f75] tabular-nums">
                              {progressPct}%
                            </span>
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
      </section>

      <ExpenseCategoriesModal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
      />
    </div>
  );
}
