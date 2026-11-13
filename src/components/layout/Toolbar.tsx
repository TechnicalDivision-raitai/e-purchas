import { RefreshCw, Search } from 'lucide-react';
import { STATUSES } from '../../data/constants';
import { useProcurement } from '../../storage/useProcurementStore';
import { currentFiscalYear } from '../../utils/date';

export function Toolbar() {
  const { state, page, viewFilter, updateViewFilter, refreshFromStorage } = useProcurement();

  if (page === 'excel' || page === 'workflow' || page === 'guide') {
    return null;
  }

  const years = [
    ...new Set([
      currentFiscalYear(),
      ...state.rows.map((r) => Number(r.year)),
      ...(viewFilter.year ? [Number(viewFilter.year)] : []),
    ]),
  ]
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => b - a);

  return (
    <section
      aria-label="ตัวกรองข้อมูล"
      className="no-print mb-5 flex flex-wrap items-end justify-between gap-3"
    >
      <div className="flex flex-1 flex-wrap items-end gap-3">
        <label className="block text-[11px] font-medium text-[#60738a]">
          ปีงบประมาณ
          <select
            value={viewFilter.year}
            onChange={(e) => updateViewFilter({ year: e.target.value })}
            className="mt-1.5 block min-h-[38px] min-w-[160px] rounded-md border border-[#d9e4f0] bg-white px-3 py-1.5 text-xs text-[#2f455e] focus:border-[#5da5e4] focus:outline-none focus:ring-2 focus:ring-[#c8e5ff]"
          >
            <option value="">ทุกปีงบประมาณ</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>
                ปีงบประมาณ {y}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-[11px] font-medium text-[#60738a]">
          สถานะ
          <select
            value={viewFilter.status}
            onChange={(e) => updateViewFilter({ status: e.target.value })}
            className="mt-1.5 block min-h-[38px] min-w-[155px] rounded-md border border-[#d9e4f0] bg-white px-3 py-1.5 text-xs text-[#2f455e] focus:border-[#5da5e4] focus:outline-none focus:ring-2 focus:ring-[#c8e5ff]"
          >
            <option value="">ทุกสถานะ</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="block min-w-[220px] flex-1 max-w-[430px] text-[11px] font-medium text-[#60738a]">
          ค้นหา
          <div className="relative mt-1.5">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[#8ea1b7]" />
            <input
              type="search"
              value={viewFilter.q}
              onChange={(e) => updateViewFilter({ q: e.target.value })}
              placeholder="ค้นหาเลขทะเบียน ชื่อโครงการ หรือหน่วยงาน…"
              className="block min-h-[38px] w-full rounded-md border border-[#d9e4f0] bg-white py-1.5 pr-3 pl-8 text-xs text-[#2f455e] placeholder:text-[#96a6b8] focus:border-[#5da5e4] focus:outline-none focus:ring-2 focus:ring-[#c8e5ff]"
            />
          </div>
        </label>
      </div>

      <button
        type="button"
        onClick={refreshFromStorage}
        className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-[#dce8f5] bg-white px-3.5 py-1.5 text-xs font-medium text-[#4f6784] transition hover:border-[#bfd7f2] hover:bg-[#eef4fd]"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        รีเฟรช
      </button>
    </section>
  );
}
