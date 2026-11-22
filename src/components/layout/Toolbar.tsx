import { RefreshCw, Search } from 'lucide-react';
import { useMemo } from 'react';
import { STATUSES } from '../../data/constants';
import {
  getEffectiveExpenseCatalog,
  getSubCategoriesForCategory,
  UNSPECIFIED_EXPENSE_CATEGORY,
} from '../../domain/expenseCategories';
import { useProcurement } from '../../storage/useProcurementStore';
import { currentFiscalYear } from '../../utils/date';

export function Toolbar() {
  const { state, page, inboxTab, viewFilter, updateViewFilter, refreshFromStorage } =
    useProcurement();

  const expenseCatalog = useMemo(
    () =>
      getEffectiveExpenseCatalog(
        state.expenseCategories,
        state.rows,
        state.budgetPools || [],
      ),
    [state.expenseCategories, state.rows, state.budgetPools],
  );

  const selectedCategory = viewFilter.expenseCategory || '';
  const selectedSubCategory = viewFilter.expenseSubCategory || '';

  const subCategoryOptions = useMemo(() => {
    if (!selectedCategory || selectedCategory === UNSPECIFIED_EXPENSE_CATEGORY) {
      return [];
    }
    return getSubCategoriesForCategory(expenseCatalog, selectedCategory);
  }, [expenseCatalog, selectedCategory]);

  if (
    page === 'excel' ||
    page === 'saraban' ||
    (page === 'inbox' && inboxTab === 'saraban')
  ) {
    return null;
  }

  const years = [
    ...new Set([
      currentFiscalYear(),
      ...state.rows.map((r) => Number(r.year)),
      ...(state.budgetPools || []).map((p) => Number(p.year)),
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
        <label className="block text-[11px] font-semibold text-[#2c4b70]">
          ปีงบประมาณ
          <select
            value={viewFilter.year}
            onChange={(e) => updateViewFilter({ year: e.target.value })}
            className="mt-1.5 block min-h-[38px] min-w-[150px] rounded-md border border-[#b6cde6] bg-white px-3 py-1.5 text-xs font-medium text-[#173659] focus:border-[#1c64c7] focus:outline-none focus:ring-2 focus:ring-[#a8d1ff]"
          >
            <option value="">ทุกปีงบประมาณ</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>
                ปีงบประมาณ {y}
              </option>
            ))}
          </select>
        </label>

        {page !== 'budgets' && (
          <>
            <label className="block text-[11px] font-semibold text-[#2c4b70]">
              หมวดค่าใช้จ่าย
              <select
                value={selectedCategory}
                onChange={(e) =>
                  updateViewFilter({
                    expenseCategory: e.target.value,
                    expenseSubCategory: '',
                  })
                }
                className="mt-1.5 block min-h-[38px] min-w-[155px] rounded-md border border-[#b6cde6] bg-white px-3 py-1.5 text-xs font-medium text-[#173659] focus:border-[#1c64c7] focus:outline-none focus:ring-2 focus:ring-[#a8d1ff]"
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

            {subCategoryOptions.length > 0 && (
              <label className="block text-[11px] font-semibold text-[#2c4b70]">
                ประเภทย่อย
                <select
                  value={selectedSubCategory}
                  onChange={(e) =>
                    updateViewFilter({ expenseSubCategory: e.target.value })
                  }
                  className="mt-1.5 block min-h-[38px] min-w-[165px] rounded-md border border-[#b6cde6] bg-white px-3 py-1.5 text-xs font-medium text-[#173659] focus:border-[#1c64c7] focus:outline-none focus:ring-2 focus:ring-[#a8d1ff]"
                >
                  <option value="">ทุกประเภทย่อย</option>
                  {subCategoryOptions.map((sub) => (
                    <option key={sub} value={sub}>
                      {sub}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="block text-[11px] font-semibold text-[#2c4b70]">
              สถานะ
              <select
                value={viewFilter.status}
                onChange={(e) => updateViewFilter({ status: e.target.value })}
                className="mt-1.5 block min-h-[38px] min-w-[155px] rounded-md border border-[#b6cde6] bg-white px-3 py-1.5 text-xs font-medium text-[#173659] focus:border-[#1c64c7] focus:outline-none focus:ring-2 focus:ring-[#a8d1ff]"
              >
                <option value="">ทุกสถานะ</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        <label className="block min-w-[200px] flex-1 max-w-[380px] text-[11px] font-semibold text-[#2c4b70]">
          ค้นหา
          <div className="relative mt-1.5">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[#5c7c9e]" />
            <input
              type="search"
              value={viewFilter.q}
              onChange={(e) => updateViewFilter({ q: e.target.value })}
              placeholder={
                page === 'budgets'
                  ? 'ค้นหาชื่อหมวดวงเงิน หมวดค่าใช้จ่าย ประเภทย่อย…'
                  : 'ค้นหาเลขทะเบียน ชื่อโครงการ หมวดค่าใช้จ่าย หรือประเภทย่อย…'
              }
              className="block min-h-[38px] w-full rounded-md border border-[#b6cde6] bg-white py-1.5 pr-3 pl-8 text-xs text-[#173659] placeholder:text-[#7690ad] focus:border-[#1c64c7] focus:outline-none focus:ring-2 focus:ring-[#a8d1ff]"
            />
          </div>
        </label>
      </div>

      <button
        type="button"
        onClick={refreshFromStorage}
        className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-[#adc6e4] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#17488e] transition hover:border-[#7daee6] hover:bg-[#dfecfc]"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        รีเฟรช
      </button>
    </section>
  );
}
