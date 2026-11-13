import { AlertTriangle, CheckCircle2, Clock, FolderKanban } from 'lucide-react';
import { STATUSES } from '../../data/constants';
import { calculateFinancialSums } from '../../domain/excel';
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
}

export function DashboardPage({
  onViewProject,
  onEditProject,
  onCreateProject,
}: DashboardPageProps) {
  const { state, filteredRows } = useProcurement();

  const activeRows = filteredRows.filter(isActiveProject);
  const completedRows = filteredRows.filter((r) => r.status === 'เสร็จสิ้น');
  const lateRows = filteredRows.filter((r) => isOverdueProject(r));

  const sums = calculateFinancialSums(filteredRows);
  const agreedRatio = sums.budget ? Math.min(100, (sums.agreed / sums.budget) * 100) : 0;

  const maxStepCount = Math.max(
    1,
    ...state.steps.map((s) => filteredRows.filter((r) => r.step === s.id).length),
  );

  const stats = [
    {
      label: 'โครงการทั้งหมด',
      value: filteredRows.length,
      unit: 'โครงการ',
      note: 'รวมทุกสถานะในชุดข้อมูลที่เลือก',
      icon: FolderKanban,
      iconBg: 'bg-[#edf4ff] text-[#3574cc]',
    },
    {
      label: 'อยู่ระหว่างดำเนินงาน',
      value: activeRows.length,
      unit: 'โครงการ',
      note: 'รวมพักงาน · ไม่รวมเสร็จสิ้นและยกเลิก',
      icon: Clock,
      iconBg: 'bg-[#fff6e9] text-[#b9821f]',
    },
    {
      label: 'ดำเนินการเสร็จสิ้น',
      value: completedRows.length,
      unit: 'โครงการ',
      noteHighlight: 'ปิดงานแล้ว',
      note: ' · ยังคงอยู่ในทะเบียน',
      icon: CheckCircle2,
      iconBg: 'bg-[#eaf8f3] text-[#1f8a65]',
    },
    {
      label: 'งานเกินกำหนด',
      value: lateRows.length,
      unit: 'โครงการ',
      note: lateRows.length
        ? 'ต้องติดตามการดำเนินงาน'
        : 'ไม่มีงานเกินกำหนดในชุดข้อมูลนี้',
      icon: AlertTriangle,
      iconBg: 'bg-[#fff0f0] text-[#c74f4f]',
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
              className="rounded-[10px] border border-[#dce8f5] bg-white p-5"
            >
              <div className="flex items-center justify-between text-xs font-medium text-[#6c7f96]">
                <span>{st.label}</span>
                <span
                  className={`grid h-8 w-8 place-items-center rounded-md ${st.iconBg}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2.5 flex items-baseline gap-2">
                <span className="font-mono-num text-[28px] font-semibold tracking-tight text-[#1e3550]">
                  {st.value}
                </span>
                <span className="text-xs text-[#8898aa]">{st.unit}</span>
              </div>
              <p className="mt-2 text-[11px] text-[#8394a8]">
                {st.noteHighlight && (
                  <strong className="font-semibold text-[#1f8a65]">
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
        <section className="overflow-hidden rounded-[10px] border border-[#dce8f5] bg-white">
          <div className="flex items-center justify-between gap-2 border-b border-[#e6eff8] bg-gradient-to-r from-white to-[#f7fbff] px-5 py-4">
            <div>
              <h2 className="text-[14px] font-semibold text-[#315c88]">
                ความคืบหน้าตามขั้นตอน
              </h2>
              <p className="mt-0.5 text-[11px] text-[#8b9cb0]">
                นับจากขั้นตอนปัจจุบันของแต่ละโครงการเพียงครั้งเดียว
              </p>
            </div>
            <span className="rounded border border-[#dce5f0] bg-[#f1f5fa] px-2 py-0.5 text-[11px] font-medium tabular-nums text-[#5b718c]">
              {filteredRows.length} โครงการ
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
                  <span className="truncate text-[#49617b]" title={s.name}>
                    {s.name}
                  </span>
                  <div className="h-2 overflow-hidden rounded bg-[#eef3f9]">
                    <div
                      className={`h-full rounded transition-all ${
                        idx === 0
                          ? 'bg-gradient-to-r from-[#1f62d1] to-[#38a4e9]'
                          : 'bg-[#6baeea]'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-right font-mono-num text-[#687e96]">{count}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="overflow-hidden rounded-[10px] border border-[#dce8f5] bg-white">
          <div className="flex items-center justify-between gap-2 border-b border-[#e6eff8] bg-gradient-to-r from-white to-[#f7fbff] px-5 py-4">
            <div>
              <h2 className="text-[14px] font-semibold text-[#315c88]">ภาพรวมวงเงิน</h2>
              <p className="mt-0.5 text-[11px] text-[#8b9cb0]">
                รวมวงเงินจากโครงการหลัก ไม่รวมซ้ำตามขั้นตอน
              </p>
            </div>
            <span className="rounded border border-[#c8dcf7] bg-[#edf3fd] px-2 py-0.5 font-mono-num text-[11px] font-semibold text-[#285ea8]">
              THB
            </span>
          </div>

          <div className="p-5">
            <div className="text-[11px] font-medium text-[#7b8fa6]">
              วงเงินงบประมาณรวม
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="font-mono-num text-[26px] font-semibold text-[#1e3550]">
                {formatMoney(sums.budget)}
              </span>
              <span className="text-xs text-[#8394a8]">บาท</span>
            </div>

            <div className="mt-4 mb-2 h-2.5 overflow-hidden rounded bg-[#e5f0fb]">
              <div
                className="h-full rounded bg-gradient-to-r from-[#2365d4] to-[#39a8ea]"
                style={{ width: `${agreedRatio}%` }}
              />
            </div>

            <div className="text-[11px] text-[#6d849d] tabular-nums">
              วงเงินตกลงคิดเป็น{' '}
              {sums.budget ? ((sums.agreed / sums.budget) * 100).toFixed(1) : '0.0'}% ของงบประมาณ
            </div>

            <div className="mt-4 space-y-2.5 border-t border-[#eef2f7] pt-3.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[#5c7490]">
                  <span className="inline-block h-2 w-2 rounded-xs bg-[#2b77d9]" />
                  วงเงินตกลงซื้อ / จ้าง
                </span>
                <b className="font-mono-num font-semibold text-[#2a4564]">
                  ฿ {formatMoney(sums.agreed)}
                </b>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[#5c7490]">
                  <span className="inline-block h-2 w-2 rounded-xs bg-[#d7e3f5]" />
                  ส่วนต่างจากวงเงินงบประมาณ
                </span>
                <b className="font-mono-num font-semibold text-[#2a4564]">
                  ฿ {formatMoney(sums.budget - sums.agreed)}
                </b>
              </div>
            </div>

            <p className="mt-4 text-[10.5px] leading-relaxed text-[#8898aa]">
              วงเงินตกลงเป็นมูลค่าที่บันทึกไว้ ไม่ใช่ยอดเบิกจ่ายจริง
              <br />
              ยอดเงินไม่รวมสถานะพักงานและยกเลิก · งานพักยังนับเป็นงานค้าง
            </p>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {miniBreakdowns.map((group) => {
          const uniqueValues = [...new Set(filteredRows.map(group.getValue))].filter(
            Boolean,
          );

          return (
            <section
              key={group.title}
              className="rounded-[10px] border border-[#dce8f5] bg-white p-4"
            >
              <h3 className="mb-3 text-xs font-semibold text-[#3d6189]">
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
                        className="flex items-center justify-between gap-2 text-xs text-[#5d738d]"
                      >
                        <span className="truncate">{val}</span>
                        <b className="font-mono-num font-semibold text-[#2b4462]">
                          {count}
                        </b>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-[#8fa0b3]">ไม่มีข้อมูล</p>
              )}
            </section>
          );
        })}
      </div>

      <section className="overflow-hidden rounded-[10px] border border-[#dce8f5] bg-white">
        <div className="border-b border-[#e6eff8] bg-gradient-to-r from-white to-[#f7fbff] px-5 py-3.5">
          <h2 className="text-[14px] font-semibold text-[#315c88]">สถานะงาน</h2>
        </div>
        <div className="flex flex-wrap gap-2.5 p-4">
          {STATUSES.map((status) => {
            const count = filteredRows.filter((r) => r.status === status).length;
            return (
              <div
                key={status}
                className="inline-flex items-center gap-2.5 rounded-md border border-[#dce7f3] bg-[#f6f9fe] px-3 py-1.5 text-xs text-[#3f5976]"
              >
                <span>{status}</span>
                <b className="font-mono-num font-semibold text-[#1762ce]">{count}</b>
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
