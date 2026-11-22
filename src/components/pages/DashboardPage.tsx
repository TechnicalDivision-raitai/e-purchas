import { Plus, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  calculateBudgetPoolUsageList,
  calculateCombinedFinancialOverview,
} from '../../domain/budgetPools';
import {
  getResponsibleName,
  getStepName,
  isActiveProject,
  isOverdueProject,
} from '../../domain/procurement';
import { useProcurement } from '../../storage/useProcurementStore';
import type { ProjectRecord, ProjectStatus } from '../../types/procurement';
import { formatMoney } from '../../utils/format';

interface DashboardPageProps {
  onViewProject: (id: string) => void;
  onEditProject: (id: string) => void;
  onCreateProject: () => void;
  onCreatePurchaseFromPool: (poolId: string) => void;
}

interface StatusChartMeta {
  status: ProjectStatus;
  label: string;
  color: string;
  badgeClass: string;
}

const STATUS_CHART_CONFIG: StatusChartMeta[] = [
  {
    status: 'เสร็จสิ้น',
    label: 'เสร็จสิ้น',
    color: '#0ea38e',
    badgeClass: 'bg-[#0ea38e] text-white',
  },
  {
    status: 'อยู่ระหว่างสั่งซื้อสั่งจ้าง',
    label: 'อยู่ระหว่างสั่งซื้อสั่งจ้าง',
    color: '#53a8f6',
    badgeClass: 'bg-[#4da3f5] text-white',
  },
  {
    status: 'กำลังดำเนินการ',
    label: 'กำลังดำเนินการ',
    color: '#2d8ee8',
    badgeClass: 'bg-[#2d8ee8] text-white',
  },
  {
    status: 'รออนุมัติ',
    label: 'รออนุมัติ',
    color: '#f5b731',
    badgeClass: 'bg-[#f5b731] text-[#2b1f00]',
  },
  {
    status: 'รอจัดทำTOR และราคากลาง',
    label: 'รอจัดทำ TOR และราคากลาง',
    color: '#63dfc6',
    badgeClass: 'bg-[#d4f3ec] text-[#0b6659]',
  },
  {
    status: 'ส่งกลับแก้ไข',
    label: 'ส่งกลับแก้ไข',
    color: '#ee6b6b',
    badgeClass: 'bg-[#fde2e2] text-[#a32626]',
  },
  {
    status: 'พักงาน',
    label: 'พักงาน',
    color: '#94a3b8',
    badgeClass: 'bg-[#e6edf4] text-[#455a70]',
  },
  {
    status: 'ยกเลิก',
    label: 'ยกเลิก',
    color: '#cbd5e1',
    badgeClass: 'bg-[#eceff4] text-[#55606e]',
  },
  {
    status: 'รอดำเนินการ',
    label: 'รอดำเนินการ',
    color: '#7dd3fc',
    badgeClass: 'bg-[#e0f2fe] text-[#0c5a8a]',
  },
];

const EMPTY_LEGEND_STATUSES: ProjectStatus[] = [
  'เสร็จสิ้น',
  'อยู่ระหว่างสั่งซื้อสั่งจ้าง',
  'รออนุมัติ',
  'รอจัดทำTOR และราคากลาง',
];

function getStatusBadgeClass(status: string): string {
  const found = STATUS_CHART_CONFIG.find((c) => c.status === status);
  return found ? found.badgeClass : 'bg-[#d4f3ec] text-[#0b6659]';
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
  const { state, user, viewFilter, filteredRows, navigate, updateViewFilter } =
    useProcurement();
  const [hoveredStatus, setHoveredStatus] = useState<string | null>(null);
  const isAdmin = user.role === 'admin';
  const budgetPools = state.budgetPools || [];

  const activeRows = filteredRows.filter(isActiveProject);
  const pendingApprovalRows = filteredRows.filter(
    (r) => r.status === 'รออนุมัติ',
  );
  const completedRows = filteredRows.filter((r) => r.status === 'เสร็จสิ้น');
  const lateRows = filteredRows.filter((r) => isOverdueProject(r));

  const overview = calculateCombinedFinancialOverview(
    filteredRows,
    state.rows,
    budgetPools,
    viewFilter.year,
    viewFilter.q,
  );
  const poolUsages = calculateBudgetPoolUsageList(
    budgetPools,
    state.rows,
    viewFilter.year,
    viewFilter.q,
  );

  const agreedRatio = overview.totalBudget
    ? Math.min(100, (overview.totalAgreed / overview.totalBudget) * 100)
    : 0;
  const reservedRatio = overview.totalBudget
    ? Math.min(
        Math.max(0, 100 - agreedRatio),
        (overview.totalReserved / overview.totalBudget) * 100,
      )
    : 0;
  const committedPct = overview.totalBudget
    ? (overview.totalCommitted / overview.totalBudget) * 100
    : 0;

  const latestRows = filteredRows.slice(0, 5);

  const statusChartSegments = useMemo(() => {
    const total = filteredRows.length;
    const counts = new Map<string, number>();
    for (const r of filteredRows) {
      counts.set(r.status, (counts.get(r.status) || 0) + 1);
    }

    if (total === 0) {
      return EMPTY_LEGEND_STATUSES.map((status) => {
        const meta = STATUS_CHART_CONFIG.find((c) => c.status === status)!;
        return {
          status: meta.status,
          label: meta.label,
          color: meta.color,
          count: 0,
          pct: 0,
        };
      });
    }

    const segments: Array<{
      status: string;
      label: string;
      color: string;
      count: number;
      pct: number;
    }> = [];

    for (const cfg of STATUS_CHART_CONFIG) {
      const count = counts.get(cfg.status) || 0;
      if (count > 0) {
        segments.push({
          status: cfg.status,
          label: cfg.label,
          color: cfg.color,
          count,
          pct: (count / total) * 100,
        });
        counts.delete(cfg.status);
      }
    }

    for (const [status, count] of counts.entries()) {
      if (count > 0) {
        segments.push({
          status,
          label: status,
          color: '#64748b',
          count,
          pct: (count / total) * 100,
        });
      }
    }

    return segments;
  }, [filteredRows]);

  const activeHoveredSegment = hoveredStatus
    ? statusChartSegments.find((s) => s.status === hoveredStatus) || null
    : null;

  const donutRadius = 64;
  const donutCircumference = 2 * Math.PI * donutRadius;

  const kpiCards = [
    {
      label: 'โครงการทั้งหมด',
      value: `${filteredRows.length}`,
      unit: 'รายการ',
      subtext: `เสร็จสิ้น ${completedRows.length} · เกินกำหนด ${lateRows.length}`,
      surfaceClass: 'bg-[#ebf7f6] border-[#d3ebe8] hover:border-[#9cd6cf]',
      valueClass: 'text-[#0c9583]',
      onClick: () => {
        updateViewFilter({ status: '' });
        navigate('register');
      },
    },
    {
      label: 'อยู่ระหว่างดำเนินการ',
      value: `${activeRows.length}`,
      unit: 'รายการ',
      subtext: 'กำลังดำเนินงาน · ไม่รวมเสร็จสิ้นและยกเลิก',
      surfaceClass: 'bg-[#ebf7f6] border-[#d3ebe8] hover:border-[#9cd6cf]',
      valueClass: 'text-[#0c9583]',
      onClick: () => navigate('inbox'),
    },
    {
      label: 'รออนุมัติ',
      value: `${pendingApprovalRows.length}`,
      unit: 'รายการ',
      subtext:
        lateRows.length > 0
          ? `เกินกำหนด ${lateRows.length} รายการ`
          : 'โครงการที่อยู่ระหว่างรอพิจารณาอนุมัติ',
      surfaceClass: 'bg-[#eaf3fc] border-[#cfe2f7] hover:border-[#99c2ee]',
      valueClass: 'text-[#0c9583]',
      onClick: () => {
        updateViewFilter({ status: 'รออนุมัติ' });
        navigate('register');
      },
    },
    {
      label: 'งบประมาณคงเหลือ',
      value: `฿ ${formatMoney(overview.totalRemaining)}`,
      unit: '',
      subtext: `จากงบประมาณรวม ฿ ${formatMoney(overview.totalBudget)}`,
      surfaceClass: 'bg-[#ebf7f6] border-[#d3ebe8] hover:border-[#9cd6cf]',
      valueClass:
        overview.totalRemaining < 0 ? 'text-[#b52c2c]' : 'text-[#0c9583]',
      onClick: () => navigate('budgets'),
    },
  ];

  const miniBreakdowns = [
    {
      title: 'ประเภทงาน',
      getValue: (r: (typeof filteredRows)[number]) => r.type,
    },
    {
      title: 'วิธีจัดซื้อจัดจ้าง',
      getValue: (r: (typeof filteredRows)[number]) => r.method,
    },
    {
      title: 'ผู้รับผิดชอบ',
      getValue: (r: (typeof filteredRows)[number]) => getResponsibleName(r),
    },
  ];

  return (
    <div className="space-y-5">
      {/* Row 1: 4 Soft-Tinted KPI Cards matching mockup */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((card) => (
          <article
            key={card.label}
            className={`rounded-2xl border transition-colors ${card.surfaceClass}`}
          >
            <button
              type="button"
              onClick={card.onClick}
              className="flex h-full w-full flex-col justify-between rounded-2xl p-5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0c9583]"
            >
              <span className="text-[13.5px] font-bold tracking-tight text-[#0b3356]">
                {card.label}
              </span>

              <div className="mt-3.5 flex items-baseline gap-2">
                <span
                  className={`font-mono-num font-bold leading-none tracking-tight ${
                    card.unit ? 'text-[30px]' : 'text-[22px] xl:text-[24px]'
                  } ${card.valueClass}`}
                >
                  {card.value}
                </span>
                {card.unit && (
                  <span className="text-xs font-medium text-[#4a6c82]">
                    {card.unit}
                  </span>
                )}
              </div>

              <span className="mt-2.5 block truncate text-[11px] text-[#4f7086] tabular-nums">
                {card.subtext}
              </span>
            </button>
          </article>
        ))}
      </div>

      {/* Row 2: 2-Column Main Overview — Latest Projects Table + Status Donut Chart */}
      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-[1.55fr_1fr]">
        {/* Left: รายการโครงการล่าสุด */}
        <section className="flex flex-col overflow-hidden rounded-2xl border border-[#d4ebe8] bg-white shadow-[0_2px_10px_rgba(11,51,86,0.04)]">
          <div className="flex items-center justify-between gap-3 bg-[#ebf7f6] px-5 py-4">
            <h2 className="text-[15.5px] font-bold text-[#0b3356]">
              รายการโครงการล่าสุด
            </h2>
            <button
              type="button"
              onClick={() => navigate('register')}
              className="whitespace-nowrap shrink-0 text-xs font-semibold text-[#0b8273] transition-colors hover:text-[#075a50]"
            >
              ดูทั้งหมด ↗
            </button>
          </div>

          <div className="flex-1 p-4 sm:p-5">
            {latestRows.length === 0 ? (
              <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-[#cce4e1] bg-[#f7fcfb] px-5 py-10 text-center">
                <p className="text-sm font-semibold text-[#163f63]">
                  ยังไม่มีรายการโครงการในชุดข้อมูลนี้
                </p>
                <p className="mt-1 text-xs text-[#54758c]">
                  เริ่มเพิ่มโครงการใหม่เพื่อติดตามสถานะ งบประมาณ และความคืบหน้า
                </p>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={onCreateProject}
                    className="mt-4 inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#0d9483] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#097768]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    เพิ่มโครงการแรก
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] table-fixed border-collapse text-left">
                  <colgroup>
                    <col style={{ width: '32%' }} />
                    <col style={{ width: '20%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '18%' }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-[#eef8f7] text-[12px] font-semibold text-[#143d61]">
                      <th className="rounded-l-xl px-3.5 py-2.5">ชื่อโครงการ</th>
                      <th className="px-2.5 py-2.5 text-center">สถานะ</th>
                      <th className="px-3 py-2.5 text-right whitespace-nowrap">
                        งบประมาณ
                      </th>
                      <th className="px-3 py-2.5 text-right whitespace-nowrap">
                        วงเงินตกลงซื้อ
                      </th>
                      <th className="rounded-r-xl px-3.5 py-2.5 whitespace-nowrap">
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
                          className="cursor-pointer border-b border-[#edf4f5] transition-colors last:border-b-0 hover:bg-[#f4fbfa]"
                        >
                          <td className="px-3.5 py-3.5 align-middle">
                            <div
                              className="truncate text-[12.5px] font-semibold text-[#0d2e4d]"
                              title={r.title}
                            >
                              {r.title}
                            </div>
                            <div className="mt-0.5 truncate text-[11px] text-[#5c7a91] tabular-nums">
                              {r.code} · ปีงบฯ {r.year}
                            </div>
                          </td>

                          <td className="px-2 py-3.5 text-center align-middle">
                            <span
                              className={`inline-block max-w-full truncate rounded-full px-2.5 py-1 text-[10.5px] font-semibold leading-tight ${getStatusBadgeClass(
                                r.status,
                              )}`}
                              title={r.status}
                            >
                              {r.status}
                            </span>
                          </td>

                          <td className="px-3 py-3.5 text-right align-middle font-mono-num text-[12px] font-semibold tabular-nums whitespace-nowrap">
                            {displayBudget > 0 ? (
                              <span className="text-[#123859]">
                                {formatMoney(displayBudget)}
                              </span>
                            ) : (
                              <span className="text-[#0c9583]">—</span>
                            )}
                          </td>

                          <td className="px-3 py-3.5 text-right align-middle font-mono-num text-[12px] font-semibold tabular-nums whitespace-nowrap">
                            {agreedAmount > 0 ? (
                              <span className="text-[#0c8072]">
                                {formatMoney(agreedAmount)}
                              </span>
                            ) : (
                              <span className="text-[#0c9583]">—</span>
                            )}
                          </td>

                          <td
                            className="px-3.5 py-3.5 align-middle"
                            title={`${stepName} (${progressPct}%)`}
                          >
                            <div className="flex items-center gap-2">
                              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#e3ecef]">
                                <div
                                  className="h-full rounded-full bg-[#0ea38e] transition-all"
                                  style={{ width: `${progressPct}%` }}
                                />
                              </div>
                              <span className="w-8 shrink-0 text-right font-mono-num text-[11px] font-semibold text-[#335773] tabular-nums">
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

        {/* Right: สรุปสัดส่วนสถานะโครงการ (Donut Chart + Legend) */}
        <section className="flex flex-col overflow-hidden rounded-2xl border border-[#d4ebe8] bg-white shadow-[0_2px_10px_rgba(11,51,86,0.04)]">
          <div className="flex items-center justify-between gap-2 bg-[#ebf7f6] px-5 py-4">
            <h2 className="text-[15.5px] font-bold text-[#0b3356]">
              สรุปสัดส่วนสถานะโครงการ
            </h2>
            <span className="font-mono-num text-[11.5px] font-semibold text-[#0b8273] tabular-nums">
              {filteredRows.length} โครงการ
            </span>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center gap-5 p-5 sm:flex-row lg:flex-col xl:flex-row">
            {/* Donut SVG */}
            <div className="relative h-[180px] w-[180px] shrink-0">
              <svg
                viewBox="0 0 180 180"
                className="h-full w-full"
                role="img"
                aria-label="แผนภูมิวงกลมแสดงสัดส่วนสถานะโครงการ"
              >
                <circle
                  cx="90"
                  cy="90"
                  r={donutRadius}
                  fill="none"
                  stroke="#e7f2f1"
                  strokeWidth="30"
                />

                {filteredRows.length > 0 && (
                  <g transform="rotate(-90 90 90)">
                    {(() => {
                      let accumulated = 0;
                      return statusChartSegments.map((seg) => {
                        const segLen =
                          (seg.count / filteredRows.length) * donutCircumference;
                        const offset = -accumulated;
                        accumulated += segLen;
                        const isDimmed =
                          hoveredStatus !== null && hoveredStatus !== seg.status;

                        return (
                          <circle
                            key={seg.status}
                            cx="90"
                            cy="90"
                            r={donutRadius}
                            fill="none"
                            stroke={seg.color}
                            strokeWidth={hoveredStatus === seg.status ? 33 : 30}
                            strokeDasharray={`${segLen} ${Math.max(
                              0,
                              donutCircumference - segLen,
                            )}`}
                            strokeDashoffset={offset}
                            className="cursor-pointer transition-opacity duration-150"
                            style={{ opacity: isDimmed ? 0.35 : 1 }}
                            onMouseEnter={() => setHoveredStatus(seg.status)}
                            onMouseLeave={() => setHoveredStatus(null)}
                            onClick={() => {
                              updateViewFilter({ status: seg.status });
                              navigate('register');
                            }}
                          >
                            <title>
                              {seg.label}: {seg.count} รายการ (
                              {seg.pct.toFixed(1)}%)
                            </title>
                          </circle>
                        );
                      });
                    })()}
                  </g>
                )}
              </svg>

              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                {activeHoveredSegment ? (
                  <>
                    <span className="font-mono-num text-[22px] font-bold leading-none text-[#0b3356] tabular-nums">
                      {activeHoveredSegment.pct.toFixed(0)}%
                    </span>
                    <span className="mt-1 line-clamp-2 text-[10.5px] font-medium leading-tight text-[#4b6b82]">
                      {activeHoveredSegment.label}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-mono-num text-[26px] font-bold leading-none text-[#0b3356] tabular-nums">
                      {filteredRows.length}
                    </span>
                    <span className="mt-1 text-[11px] font-medium text-[#52738a]">
                      ทั้งหมด
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Interactive Chart Legend */}
            <div className="w-full min-w-0 flex-1 space-y-2">
              {statusChartSegments.map((seg) => {
                const isActive = hoveredStatus === seg.status;
                return (
                  <button
                    key={seg.status}
                    type="button"
                    onMouseEnter={() => setHoveredStatus(seg.status)}
                    onMouseLeave={() => setHoveredStatus(null)}
                    onClick={() => {
                      if (seg.count > 0) {
                        updateViewFilter({ status: seg.status });
                        navigate('register');
                      }
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                      isActive ? 'bg-[#eef8f7]' : 'hover:bg-[#f5fbfa]'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: seg.color }}
                      />
                      <span className="truncate text-[12px] font-medium text-[#153a5b]">
                        {seg.label}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono-num text-[12px] font-semibold text-[#0b3356] tabular-nums">
                      {seg.count}{' '}
                      <span className="font-normal text-[11px] text-[#5c7b91]">
                        ({seg.pct.toFixed(0)}%)
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {/* Financial Overview + BUDGET DATA */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.65fr]">
        <section className="overflow-hidden rounded-2xl border border-[#d4ebe8] bg-white shadow-[0_2px_10px_rgba(11,51,86,0.04)]">
          <div className="flex items-center justify-between gap-2 bg-[#ebf7f6] px-5 py-4">
            <div>
              <h2 className="text-[14.5px] font-bold text-[#0b3356]">
                ภาพรวมวงเงิน
              </h2>
              <p className="mt-0.5 text-[11px] text-[#4c6d84]">
                รวมงบโครงการเดี่ยว + BUDGET DATA (ไม่นับซ้ำการซื้อย่อย)
              </p>
            </div>
            <span className="font-mono-num text-[11px] font-semibold text-[#0c8072]">
              THB
            </span>
          </div>

          <div className="p-5">
            <div className="text-[11px] font-semibold text-[#47678c]">
              วงเงินงบประมาณรวมสุทธิ
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="font-mono-num text-[26px] font-bold text-[#0b3356] tabular-nums">
                {formatMoney(overview.totalBudget)}
              </span>
              <span className="text-xs text-[#547091]">บาท</span>
            </div>

            {overview.poolCount > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[#4d6c90] tabular-nums">
                <span>
                  โครงการเดี่ยว: ฿ {formatMoney(overview.standaloneBudget)} (
                  {overview.standaloneCount})
                </span>
                <span>
                  BUDGET DATA: ฿ {formatMoney(overview.poolAllocatedBudget)} (
                  {overview.poolCount} หมวด)
                </span>
              </div>
            )}

            <div className="mt-4 mb-2 flex h-2.5 overflow-hidden rounded-full bg-[#e2eff0]">
              <div
                className="h-full bg-[#0ea38e] transition-all"
                style={{ width: `${agreedRatio}%` }}
                title={`วงเงินตกลงซื้อ/จ้าง ฿ ${formatMoney(overview.totalAgreed)}`}
              />
              {reservedRatio > 0 && (
                <div
                  className="h-full bg-[#f5b731] transition-all"
                  style={{ width: `${reservedRatio}%` }}
                  title={`กันวงเงินตามราคากลาง (BUDGET DATA) ฿ ${formatMoney(overview.totalReserved)}`}
                />
              )}
            </div>

            <div className="text-[11px] font-medium text-[#3b5b82] tabular-nums">
              ผูกพัน / ใช้วงเงินแล้ว {committedPct.toFixed(1)}% ของงบประมาณรวม
            </div>

            <div className="mt-4 space-y-2 border-t border-[#e4f0f0] pt-3.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[#35557a]">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#0ea38e]" />
                  วงเงินตกลงซื้อ / จ้างรวม
                </span>
                <b className="font-mono-num font-semibold text-[#0b3356] tabular-nums">
                  ฿ {formatMoney(overview.totalAgreed)}
                </b>
              </div>

              {overview.totalReserved > 0 && (
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-[#35557a]">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#f5b731]" />
                    กันวงเงินตามราคากลาง (BUDGET DATA)
                  </span>
                  <b className="font-mono-num font-semibold text-[#a66d0d] tabular-nums">
                    ฿ {formatMoney(overview.totalReserved)}
                  </b>
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[#35557a]">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#c9dfe0]" />
                  คงเหลือ / ส่วนต่างจากงบประมาณ
                </span>
                <b
                  className={`font-mono-num font-semibold tabular-nums ${
                    overview.totalRemaining < 0
                      ? 'text-[#b52c2c]'
                      : 'text-[#0c8a79]'
                  }`}
                >
                  ฿ {formatMoney(overview.totalRemaining)}
                </b>
              </div>
            </div>

            <p className="mt-4 text-[10.5px] leading-relaxed text-[#587496]">
              ไม่รวมสถานะพักงานและยกเลิก · เบิกจ่ายฎีกาแล้ว ฿{' '}
              <span className="font-mono-num font-semibold text-[#1d426d]">
                {formatMoney(overview.totalVoucher)}
              </span>
            </p>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[#d4ebe8] bg-white shadow-[0_2px_10px_rgba(11,51,86,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#ebf7f6] px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-[#0c8a79] ring-1 ring-[#cce6e3]">
                <Wallet className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-[14.5px] font-bold text-[#0b3356]">
                  BUDGET DATA (หมวดวัสดุ / งบก้อนใหญ่)
                </h2>
                <p className="mt-0.5 text-[11px] text-[#4c6d84]">
                  ติดตามการเบิกใช้วงเงินก้อนใหญ่ที่ทยอยจัดซื้อเป็นครั้งคราว
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate('budgets')}
              className="whitespace-nowrap shrink-0 rounded-lg border border-[#b9dfda] bg-white px-3 py-1.5 text-[11.5px] font-semibold text-[#0c7a6c] transition-colors hover:bg-[#e5f5f3]"
            >
              จัดการ BUDGET DATA ↗
            </button>
          </div>

          <div className="p-5">
            {poolUsages.length === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-[#cce4e1] bg-[#f7fcfb] px-4 py-5">
                <div className="text-xs text-[#4a6688]">
                  ยังไม่ได้ตั้งรายการ BUDGET DATA ในชุดข้อมูลนี้ —
                  สร้างหมวดเช่น ค่าวัสดุสำนักงาน หรือ ค่าวัสดุก่อสร้าง
                  เพื่อตัดยอดรายครั้งโดยไม่นับงบซ้ำ
                </div>
                <button
                  type="button"
                  onClick={() => navigate('budgets')}
                  className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#0d9483] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#097768]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  เพิ่ม BUDGET DATA
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                {poolUsages.map((usage) => {
                  const { pool } = usage;
                  const allocated = Math.max(0, Number(pool.allocatedBudget || 0));
                  const pAgreedPct =
                    allocated > 0
                      ? Math.min(100, (usage.agreedAmount / allocated) * 100)
                      : 0;
                  const pReservedPct =
                    allocated > 0
                      ? Math.min(
                          Math.max(0, 100 - pAgreedPct),
                          (usage.reservedAmount / allocated) * 100,
                        )
                      : 0;

                  return (
                    <article
                      key={pool.id}
                      className={`flex flex-col justify-between rounded-xl border p-4 ${
                        usage.isOverBudget
                          ? 'border-[#eab3b3] bg-[#fffafa]'
                          : 'border-[#d6ece9] bg-[#f8fdfc]'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-[10.5px] font-medium text-[#4c6f85]">
                              <span className="font-mono-num">
                                ปีงบฯ {pool.year}
                              </span>
                              {pool.code && (
                                <>
                                  <span>·</span>
                                  <span className="font-mono-num">
                                    {pool.code}
                                  </span>
                                </>
                              )}
                            </div>
                            <h3 className="mt-0.5 truncate text-[13.5px] font-bold text-[#0b3356]">
                              {pool.name}
                            </h3>
                          </div>

                          <span
                            className={`shrink-0 font-mono-num text-[11px] font-bold tabular-nums ${
                              usage.isOverBudget
                                ? 'text-[#b52c2c]'
                                : usage.utilizationPct >= 85
                                  ? 'text-[#b06d0c]'
                                  : 'text-[#0c8a79]'
                            }`}
                          >
                            {usage.utilizationPct.toFixed(0)}%
                          </span>
                        </div>

                        <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-[#dfeceb]">
                          {usage.isOverBudget ? (
                            <div className="h-full w-full bg-[#c93434]" />
                          ) : (
                            <>
                              <div
                                className="h-full bg-[#0ea38e]"
                                style={{ width: `${pAgreedPct}%` }}
                              />
                              {pReservedPct > 0 && (
                                <div
                                  className="h-full bg-[#f5b731]"
                                  style={{ width: `${pReservedPct}%` }}
                                />
                              )}
                            </>
                          )}
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <div className="text-[10px] text-[#567394]">
                              ใช้ไป / ตั้งไว้
                            </div>
                            <div className="font-mono-num font-semibold text-[#13345c] tabular-nums">
                              ฿ {formatMoney(usage.usedAmount)}
                              <span className="font-normal text-[#5d7a9c]">
                                {' '}
                                / {formatMoney(allocated)}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] text-[#567394]">
                              คงเหลือ
                            </div>
                            <div
                              className={`font-mono-num font-bold tabular-nums ${
                                usage.isOverBudget
                                  ? 'text-[#b52c2c]'
                                  : 'text-[#0c8a79]'
                              }`}
                            >
                              ฿ {formatMoney(usage.remainingAmount)}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#e1f0ee] pt-2.5 text-[11px]">
                        <span className="text-[#517094] tabular-nums">
                          ซื้อแล้ว {usage.eligibleCount} ครั้ง
                        </span>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => onCreatePurchaseFromPool(pool.id)}
                            className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-[#0b8273] hover:underline"
                          >
                            <Plus className="h-3 w-3" />
                            ซื้อในวงเงินนี้
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* 3-Column Compact Breakdown */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {miniBreakdowns.map((group) => {
          const uniqueValues = [
            ...new Set(filteredRows.map(group.getValue)),
          ].filter(Boolean);

          return (
            <section
              key={group.title}
              className="rounded-2xl border border-[#d4ebe8] bg-white p-4 shadow-[0_2px_10px_rgba(11,51,86,0.03)]"
            >
              <h3 className="mb-3 text-xs font-bold text-[#0b3356]">
                {group.title}
              </h3>
              {uniqueValues.length > 0 ? (
                <div className="space-y-2">
                  {uniqueValues.map((val) => {
                    const count = filteredRows.filter(
                      (r) => group.getValue(r) === val,
                    ).length;
                    return (
                      <div
                        key={val}
                        className="flex items-center justify-between gap-2 text-xs text-[#36557a]"
                      >
                        <span className="truncate">{val}</span>
                        <b className="font-mono-num font-semibold text-[#0b3356] tabular-nums">
                          {count}
                        </b>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-[#6682a1]">ไม่มีข้อมูล</p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
