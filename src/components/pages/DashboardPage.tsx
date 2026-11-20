import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FolderKanban,
  Plus,
  Wallet,
} from 'lucide-react';
import { STATUSES } from '../../data/constants';
import {
  calculateBudgetPoolUsageList,
  calculateCombinedFinancialOverview,
} from '../../domain/budgetPools';
import {
  getResponsibleName,
  isActiveProject,
  isOverdueProject,
} from '../../domain/procurement';
import { useProcurement } from '../../storage/useProcurementStore';
import { formatMoney } from '../../utils/format';
import { ProjectsTablePanel } from './ProjectsTablePanel';

interface DashboardPageProps {
  onViewProject: (id: string) => void;
  onEditProject: (id: string) => void;
  onCreateProject: () => void;
  onCreatePurchaseFromPool: (poolId: string) => void;
}

export function DashboardPage({
  onViewProject,
  onEditProject,
  onCreateProject,
  onCreatePurchaseFromPool,
}: DashboardPageProps) {
  const { state, user, viewFilter, filteredRows, navigate } = useProcurement();
  const isAdmin = user.role === 'admin';
  const budgetPools = state.budgetPools || [];

  const activeRows = filteredRows.filter(isActiveProject);
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

  const maxStepCount = Math.max(
    1,
    ...state.steps.map((s) => filteredRows.filter((r) => r.step === s.id).length),
  );

  const stats = [
    {
      label: 'โครงการทั้งหมด',
      value: filteredRows.length,
      unit: 'รายการ',
      note: 'รวมโครงการเดี่ยวและรายการทยอยซื้อในชุดข้อมูลที่เลือก',
      icon: FolderKanban,
      iconBg: 'bg-[#dbe9fc] text-[#144fa6]',
    },
    {
      label: 'อยู่ระหว่างดำเนินงาน',
      value: activeRows.length,
      unit: 'รายการ',
      note: 'รวมพักงาน · ไม่รวมเสร็จสิ้นและยกเลิก',
      icon: Clock,
      iconBg: 'bg-[#fff2dc] text-[#a66d0d]',
    },
    {
      label: 'ดำเนินการเสร็จสิ้น',
      value: completedRows.length,
      unit: 'รายการ',
      noteHighlight: 'ปิดงานแล้ว',
      note: ' · ยังคงอยู่ในทะเบียน',
      icon: CheckCircle2,
      iconBg: 'bg-[#dff5eb] text-[#13734f]',
    },
    {
      label: 'งานเกินกำหนด',
      value: lateRows.length,
      unit: 'รายการ',
      note: lateRows.length
        ? 'ต้องติดตามการดำเนินงาน'
        : 'ไม่มีงานเกินกำหนดในชุดข้อมูลนี้',
      icon: AlertTriangle,
      iconBg: 'bg-[#ffe8e8] text-[#b53636]',
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((st) => {
          const Icon = st.icon;
          return (
            <article
              key={st.label}
              className="rounded-[10px] border border-[#b8d0eb] bg-white p-5 shadow-xs"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-[#3c5c82]">
                <span>{st.label}</span>
                <span
                  className={`grid h-8 w-8 place-items-center rounded-md ${st.iconBg}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2.5 flex items-baseline gap-2">
                <span className="font-mono-num text-[28px] font-semibold tracking-tight text-[#0d2747]">
                  {st.value}
                </span>
                <span className="text-xs text-[#597494]">{st.unit}</span>
              </div>
              <p className="mt-2 text-[11px] text-[#557191]">
                {st.noteHighlight && (
                  <strong className="font-semibold text-[#13734f]">
                    {st.noteHighlight}
                  </strong>
                )}
                {st.note}
              </p>
            </article>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.55fr_1fr]">
        <section className="overflow-hidden rounded-[10px] border border-[#b8d0eb] bg-white shadow-xs">
          <div className="flex items-center justify-between gap-2 border-b border-[#c2d8f0] bg-gradient-to-r from-[#eef4fc] to-[#ddeafa] px-5 py-4">
            <div>
              <h2 className="text-[14px] font-semibold text-[#12396b]">
                ความคืบหน้าตามขั้นตอน
              </h2>
              <p className="mt-0.5 text-[11px] text-[#4c6a8d]">
                นับจากขั้นตอนปัจจุบันของแต่ละโครงการเพียงครั้งเดียว
              </p>
            </div>
            <span className="rounded border border-[#a9c5e6] bg-white px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[#194b8e]">
              {filteredRows.length} รายการ
            </span>
          </div>

          <div className="space-y-3.5 p-5">
            {state.steps.map((s, idx) => {
              const count = filteredRows.filter((r) => r.step === s.id).length;
              const pct = (count / maxStepCount) * 100;
              return (
                <div
                  key={s.id}
                  className="grid grid-cols-[140px_1fr_28px] items-center gap-3 text-xs sm:grid-cols-[185px_1fr_32px]"
                >
                  <span className="truncate font-medium text-[#27466b]" title={s.name}>
                    {s.name}
                  </span>
                  <div className="h-2.5 overflow-hidden rounded bg-[#d9e7f6]">
                    <div
                      className={`h-full rounded transition-all ${
                        idx === 0
                          ? 'bg-gradient-to-r from-[#0e489e] to-[#2084e0]'
                          : 'bg-gradient-to-r from-[#2469c7] to-[#4ea1ec]'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-right font-mono-num font-semibold text-[#2e4f75]">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="overflow-hidden rounded-[10px] border border-[#b8d0eb] bg-white shadow-xs">
          <div className="flex items-center justify-between gap-2 border-b border-[#c2d8f0] bg-gradient-to-r from-[#eef4fc] to-[#ddeafa] px-5 py-4">
            <div>
              <h2 className="text-[14px] font-semibold text-[#12396b]">ภาพรวมวงเงิน</h2>
              <p className="mt-0.5 text-[11px] text-[#4c6a8d]">
                รวมงบโครงการเดี่ยว + BUDGET DATA (ไม่นับซ้ำการซื้อย่อย)
              </p>
            </div>
            <span className="rounded border border-[#a4c3e8] bg-white px-2 py-0.5 font-mono-num text-[11px] font-semibold text-[#134791]">
              THB
            </span>
          </div>

          <div className="p-5">
            <div className="text-[11px] font-semibold text-[#47678c]">
              วงเงินงบประมาณรวมสุทธิ
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="font-mono-num text-[26px] font-semibold text-[#0d2747]">
                {formatMoney(overview.totalBudget)}
              </span>
              <span className="text-xs text-[#547091]">บาท</span>
            </div>

            {overview.poolCount > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-[#4d6c90] tabular-nums">
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

            <div className="mt-4 mb-2 flex h-2.5 overflow-hidden rounded bg-[#d4e5f7]">
              <div
                className="h-full bg-gradient-to-r from-[#0f489e] to-[#1f85e3] transition-all"
                style={{ width: `${agreedRatio}%` }}
                title={`วงเงินตกลงซื้อ/จ้าง ฿ ${formatMoney(overview.totalAgreed)}`}
              />
              {reservedRatio > 0 && (
                <div
                  className="h-full bg-[#e39c2b] transition-all"
                  style={{ width: `${reservedRatio}%` }}
                  title={`กันวงเงินตามราคากลาง (BUDGET DATA) ฿ ${formatMoney(overview.totalReserved)}`}
                />
              )}
            </div>

            <div className="text-[11px] font-medium text-[#3b5b82] tabular-nums">
              ผูกพัน / ใช้วงเงินแล้ว {committedPct.toFixed(1)}% ของงบประมาณรวม
            </div>

            <div className="mt-4 space-y-2 border-t border-[#d9e7f5] pt-3.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[#35557a]">
                  <span className="inline-block h-2 w-2 rounded-xs bg-[#1455b3]" />
                  วงเงินตกลงซื้อ / จ้างรวม
                </span>
                <b className="font-mono-num font-semibold text-[#113159]">
                  ฿ {formatMoney(overview.totalAgreed)}
                </b>
              </div>

              {overview.totalReserved > 0 && (
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-[#35557a]">
                    <span className="inline-block h-2 w-2 rounded-xs bg-[#e39c2b]" />
                    กันวงเงินตามราคากลาง (BUDGET DATA)
                  </span>
                  <b className="font-mono-num font-semibold text-[#a66d0d]">
                    ฿ {formatMoney(overview.totalReserved)}
                  </b>
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[#35557a]">
                  <span className="inline-block h-2 w-2 rounded-xs bg-[#b9cfe8]" />
                  คงเหลือ / ส่วนต่างจากงบประมาณ
                </span>
                <b
                  className={`font-mono-num font-semibold ${
                    overview.totalRemaining < 0 ? 'text-[#b52c2c]' : 'text-[#0f6b47]'
                  }`}
                >
                  ฿ {formatMoney(overview.totalRemaining)}
                </b>
              </div>
            </div>

            <p className="mt-4 text-[10.5px] leading-relaxed text-[#587496]">
              รายการทยอยซื้อที่ผูกหมวดวงเงินจะตัดยอดจากก้อนงบประมาณหมวดนั้นโดยไม่นับวงเงินซ้ำ
              <br />
              ไม่รวมสถานะพักงานและยกเลิก · เบิกจ่ายฎีกาแล้ว ฿{' '}
              <span className="font-mono-num font-semibold text-[#1d426d]">
                {formatMoney(overview.totalVoucher)}
              </span>
            </p>
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-[10px] border border-[#b8d0eb] bg-white shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#c2d8f0] bg-gradient-to-r from-[#eef4fc] to-[#ddeafa] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white text-[#144fa6] ring-1 ring-[#b8d0eb]">
              <Wallet className="h-4 w-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[14px] font-semibold text-[#12396b]">
                  BUDGET DATA (หมวดวัสดุ / งบก้อนใหญ่)
                </h2>
                <span className="rounded border border-[#a9c5e6] bg-white px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[#194b8e]">
                  {poolUsages.length} หมวด
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-[#4c6a8d]">
                ติดตามการเบิกใช้วงเงินก้อนใหญ่ที่ทยอยจัดซื้อเป็นครั้งคราว เช่น วัสดุสำนักงาน วัสดุก่อสร้าง
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('budgets')}
            className="whitespace-nowrap rounded-md border border-[#9fc0e6] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#144b96] transition hover:border-[#6da3df] hover:bg-[#dfecfc]"
          >
            จัดการ BUDGET DATA ↗
          </button>
        </div>

        <div className="p-5">
          {poolUsages.length === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-[#bdd3ec] bg-[#f6fafe] px-4 py-4">
              <div className="text-xs text-[#4a6688]">
                ยังไม่ได้ตั้งรายการ BUDGET DATA ในชุดข้อมูลนี้ —
                สร้างหมวดเช่น ค่าวัสดุสำนักงาน หรือ ค่าวัสดุก่อสร้าง เพื่อตัดยอดรายครั้งโดยไม่นับงบซ้ำ
              </div>
              <button
                type="button"
                onClick={() => navigate('budgets')}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[#0d4294] bg-gradient-to-r from-[#0f489e] to-[#1972c9] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:from-[#0b387d] hover:to-[#135ba4]"
              >
                <Plus className="h-3.5 w-3.5" />
                เพิ่ม BUDGET DATA
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
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
                    className={`flex flex-col justify-between rounded-lg border p-4 ${
                      usage.isOverBudget
                        ? 'border-[#eab3b3] bg-[#fffafa]'
                        : 'border-[#c6dbf0] bg-[#f8fbff]'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-[10.5px] font-semibold text-[#47688d]">
                            <span className="font-mono-num">ปีงบฯ {pool.year}</span>
                            {pool.code && (
                              <>
                                <span>·</span>
                                <span className="font-mono-num">{pool.code}</span>
                              </>
                            )}
                          </div>
                          <h3 className="mt-0.5 truncate text-[13.5px] font-bold text-[#0f2c52]">
                            {pool.name}
                          </h3>
                        </div>

                        <span
                          className={`shrink-0 rounded border px-1.5 py-0.5 font-mono-num text-[10.5px] font-semibold ${
                            usage.isOverBudget
                              ? 'border-[#edb8b8] bg-[#fff0f0] text-[#b52c2c]'
                              : usage.utilizationPct >= 85
                                ? 'border-[#f1d59c] bg-[#fff7e6] text-[#a66d0d]'
                                : 'border-[#b4d0ee] bg-white text-[#144fa6]'
                          }`}
                        >
                          {usage.utilizationPct.toFixed(0)}%
                        </span>
                      </div>

                      <div className="mt-3 flex h-2 overflow-hidden rounded bg-[#d9e7f6]">
                        {usage.isOverBudget ? (
                          <div className="h-full w-full bg-[#c93434]" />
                        ) : (
                          <>
                            <div
                              className="h-full bg-gradient-to-r from-[#0f489e] to-[#1e7ee0]"
                              style={{ width: `${pAgreedPct}%` }}
                            />
                            {pReservedPct > 0 && (
                              <div
                                className="h-full bg-[#e39c2b]"
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
                          <div className="font-mono-num font-semibold text-[#13345c]">
                            ฿ {formatMoney(usage.usedAmount)}
                            <span className="font-normal text-[#5d7a9c]">
                              {' '}
                              / {formatMoney(allocated)}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-[#567394]">คงเหลือ</div>
                          <div
                            className={`font-mono-num font-bold ${
                              usage.isOverBudget
                                ? 'text-[#b52c2c]'
                                : 'text-[#0f6b47]'
                            }`}
                          >
                            ฿ {formatMoney(usage.remainingAmount)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#d8e6f5] pt-2.5 text-[11px]">
                      <span className="text-[#517094] tabular-nums">
                        ทยอยซื้อแล้ว {usage.eligibleCount} ครั้ง
                      </span>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => onCreatePurchaseFromPool(pool.id)}
                          className="inline-flex items-center gap-1 font-semibold text-[#0f52ab] hover:underline"
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

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {miniBreakdowns.map((group) => {
          const uniqueValues = [...new Set(filteredRows.map(group.getValue))].filter(
            Boolean,
          );

          return (
            <section
              key={group.title}
              className="rounded-[10px] border border-[#b8d0eb] bg-white p-4 shadow-xs"
            >
              <h3 className="mb-3 text-xs font-semibold text-[#143d70]">
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
                        <b className="font-mono-num font-semibold text-[#0f3463]">
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

      <section className="overflow-hidden rounded-[10px] border border-[#b8d0eb] bg-white shadow-xs">
        <div className="border-b border-[#c2d8f0] bg-gradient-to-r from-[#eef4fc] to-[#ddeafa] px-5 py-3.5">
          <h2 className="text-[14px] font-semibold text-[#12396b]">สถานะงาน</h2>
        </div>
        <div className="flex flex-wrap gap-2.5 p-4">
          {STATUSES.map((status) => {
            const count = filteredRows.filter((r) => r.status === status).length;
            return (
              <div
                key={status}
                className="inline-flex items-center gap-2.5 rounded-md border border-[#b9d0ea] bg-[#edf4fc] px-3 py-1.5 text-xs font-medium text-[#1c406b]"
              >
                <span>{status}</span>
                <b className="font-mono-num font-semibold text-[#0f4ca6]">{count}</b>
              </div>
            );
          })}
        </div>
      </section>

      <ProjectsTablePanel
        rows={filteredRows.slice(0, 5)}
        title="โครงการล่าสุด"
        compact
        onViewProject={onViewProject}
        onEditProject={onEditProject}
        onCreateProject={onCreateProject}
      />
    </div>
  );
}
