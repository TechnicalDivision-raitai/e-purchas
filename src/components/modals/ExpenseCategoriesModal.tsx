import { FolderTree, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DEFAULT_EXPENSE_CATEGORIES } from '../../data/constants';
import { getEffectiveExpenseCatalog } from '../../domain/expenseCategories';
import { useProcurement } from '../../storage/useProcurementStore';
import type { ExpenseCategoryGroup } from '../../types/procurement';
import { uid } from '../../utils/date';

interface ExpenseCategoriesModalProps {
  open: boolean;
  onClose: () => void;
}

export function ExpenseCategoriesModal({
  open,
  onClose,
}: ExpenseCategoriesModalProps) {
  const { state, saveExpenseCategories, showToast } = useProcurement();

  const [groups, setGroups] = useState<ExpenseCategoryGroup[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [newCategoryName, setNewCategoryName] = useState<string>('');
  const [newSubName, setNewSubName] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    const effective = getEffectiveExpenseCatalog(
      state.expenseCategories,
      state.rows,
      state.budgetPools || [],
    );
    const cloned = structuredClone(effective);
    setGroups(cloned);
    setSelectedId(cloned[0]?.id || '');
    setNewCategoryName('');
    setNewSubName('');
    setError('');
  }, [open, state.expenseCategories, state.rows, state.budgetPools]);

  if (!open) return null;

  const activeGroup = groups.find((g) => g.id === selectedId) || groups[0] || null;

  const handleAddCategory = () => {
    const clean = newCategoryName.trim().replace(/\s+/g, ' ');
    if (!clean) return;
    if (groups.some((g) => g.name.toLowerCase() === clean.toLowerCase())) {
      setError(`มีหมวดค่าใช้จ่าย "${clean}" อยู่แล้ว`);
      return;
    }
    const created: ExpenseCategoryGroup = {
      id: `cat-${uid()}`,
      name: clean,
      subCategories: [],
    };
    setGroups((prev) => [...prev, created]);
    setSelectedId(created.id);
    setNewCategoryName('');
    setError('');
  };

  const handleRenameCategory = (id: string, nextName: string) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === id ? { ...g, name: nextName } : g)),
    );
  };

  const handleDeleteCategory = (id: string) => {
    setGroups((prev) => {
      const next = prev.filter((g) => g.id !== id);
      if (selectedId === id) {
        setSelectedId(next[0]?.id || '');
      }
      return next;
    });
  };

  const handleAddSubCategory = () => {
    if (!activeGroup) return;
    const clean = newSubName.trim().replace(/\s+/g, ' ');
    if (!clean) return;
    if (
      activeGroup.subCategories.some(
        (s) => s.toLowerCase() === clean.toLowerCase(),
      )
    ) {
      setError(`มีประเภทย่อย "${clean}" ในหมวด "${activeGroup.name}" อยู่แล้ว`);
      return;
    }
    setGroups((prev) =>
      prev.map((g) =>
        g.id === activeGroup.id
          ? { ...g, subCategories: [...g.subCategories, clean] }
          : g,
      ),
    );
    setNewSubName('');
    setError('');
  };

  const handleRemoveSubCategory = (groupId: string, subIndex: number) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? {
              ...g,
              subCategories: g.subCategories.filter((_, i) => i !== subIndex),
            }
          : g,
      ),
    );
  };

  const handleRestoreDefaults = () => {
    setGroups((prev) => {
      const next = structuredClone(prev);
      for (const def of DEFAULT_EXPENSE_CATEGORIES) {
        const existing = next.find(
          (g) => g.name.toLowerCase() === def.name.toLowerCase(),
        );
        if (!existing) {
          next.push(structuredClone(def));
        } else {
          for (const sub of def.subCategories) {
            if (
              !existing.subCategories.some(
                (s) => s.toLowerCase() === sub.toLowerCase(),
              )
            ) {
              existing.subCategories.push(sub);
            }
          }
        }
      }
      return next;
    });
    setError('');
  };

  const handleSave = () => {
    const cleaned = groups
      .map((g) => ({
        id: g.id,
        name: g.name.trim().replace(/\s+/g, ' '),
        subCategories: Array.from(
          new Set(
            g.subCategories
              .map((s) => s.trim().replace(/\s+/g, ' '))
              .filter(Boolean),
          ),
        ),
      }))
      .filter((g) => Boolean(g.name));

    if (cleaned.length === 0) {
      setError('กรุณามีหมวดค่าใช้จ่ายอย่างน้อย 1 หมวด');
      return;
    }

    const ok = saveExpenseCategories(cleaned);
    if (ok) {
      showToast('บันทึกโครงสร้างหมวดค่าใช้จ่ายและประเภทย่อยแล้ว');
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="expense-categories-modal-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#061830]/75 p-3 backdrop-blur-[2px] sm:p-5"
    >
      <div className="flex max-h-[88dvh] w-full max-w-[820px] flex-col overflow-hidden rounded-2xl border border-[#2b6cb5] bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 bg-gradient-to-r from-[#092954] via-[#0f448a] to-[#1666ba] px-6 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/15">
              <FolderTree className="h-4.5 w-4.5" />
            </span>
            <div>
              <h3
                id="expense-categories-modal-title"
                className="text-base font-bold"
              >
                จัดการหมวดค่าใช้จ่ายและประเภทย่อย
              </h3>
              <p className="mt-0.5 text-[11px] text-[#b8dcff]">
                กำหนดหมวดหลัก (เช่น ค่าวัสดุ, ค่าครุภัณฑ์) และแยกประเภทย่อยภายในแต่ละหมวด
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="grid h-8 w-8 place-items-center rounded-lg border border-white/25 bg-white/10 text-white hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[280px_1fr]">
          {/* Left column: Main expense categories */}
          <div className="border-b border-[#d5e4f5] bg-[#f4f8fe] p-4 md:border-r md:border-b-0">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-xs font-bold text-[#143966]">
                1. หมวดค่าใช้จ่ายหลัก ({groups.length})
              </span>
            </div>

            <div className="space-y-1.5">
              {groups.map((group) => {
                const isSelected = activeGroup?.id === group.id;
                return (
                  <div
                    key={group.id}
                    className={`flex items-center justify-between gap-1.5 rounded-lg border px-2.5 py-2 transition ${
                      isSelected
                        ? 'border-[#1251a8] bg-white shadow-xs ring-1 ring-[#9bc4f2]'
                        : 'border-[#cfe0f2] bg-white/70 hover:bg-white'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(group.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate text-xs font-semibold text-[#0f2a4a]">
                        {group.name || '(ยังไม่ตั้งชื่อ)'}
                      </div>
                      <div className="mt-0.5 text-[10.5px] text-[#557191] tabular-nums">
                        {group.subCategories.length} ประเภทย่อย
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(group.id)}
                      title="ลบหมวดนี้"
                      aria-label={`ลบหมวด ${group.name}`}
                      className="rounded p-1 text-[#9b3d3d] hover:bg-[#ffebeb]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-3.5 flex gap-1.5">
              <input
                type="text"
                maxLength={100}
                placeholder="เพิ่มหมวดหลักใหม่..."
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCategory();
                  }
                }}
                className="min-w-0 flex-1 rounded-lg border border-[#a8c4e4] bg-white px-2.5 py-1.5 text-xs text-[#132d4c]"
              />
              <button
                type="button"
                onClick={handleAddCategory}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#1251a8] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#0d3e85]"
              >
                <Plus className="h-3.5 w-3.5" />
                เพิ่ม
              </button>
            </div>
          </div>

          {/* Right column: Sub-categories of selected main category */}
          <div className="flex flex-col p-5">
            {activeGroup ? (
              <>
                <div className="mb-4">
                  <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                    ชื่อหมวดค่าใช้จ่ายที่เลือก
                    <input
                      type="text"
                      maxLength={100}
                      value={activeGroup.name}
                      onChange={(e) =>
                        handleRenameCategory(activeGroup.id, e.target.value)
                      }
                      className="mt-1.5 min-h-[38px] w-full rounded-lg border border-[#a8c4e4] bg-[#f8fbff] px-3 py-1.5 text-xs font-semibold text-[#0f2a4a]"
                    />
                  </label>
                </div>

                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-[#143966]">
                    2. ประเภทย่อยในหมวด “{activeGroup.name}” (
                    {activeGroup.subCategories.length})
                  </span>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={150}
                    placeholder={`เช่น ${
                      activeGroup.name.includes('วัสดุ')
                        ? 'วัสดุไฟฟ้าและวิทยุ, วัสดุก่อสร้าง'
                        : activeGroup.name.includes('ครุภัณฑ์')
                          ? 'ครุภัณฑ์สำนักงาน, ครุภัณฑ์คอมพิวเตอร์'
                          : 'ระบุชื่อประเภทย่อยใหม่'
                    }`}
                    value={newSubName}
                    onChange={(e) => setNewSubName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSubCategory();
                      }
                    }}
                    className="min-h-[38px] min-w-0 flex-1 rounded-lg border border-[#a8c4e4] bg-white px-3 py-1.5 text-xs text-[#132d4c]"
                  />
                  <button
                    type="button"
                    onClick={handleAddSubCategory}
                    className="inline-flex min-h-[38px] shrink-0 items-center gap-1 rounded-lg border border-[#0f489e] bg-[#0f489e] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#0b387d]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    เพิ่มประเภทย่อย
                  </button>
                </div>

                <div className="mt-3.5 flex-1">
                  {activeGroup.subCategories.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#c4d8ee] bg-[#f7fbff] px-4 py-6 text-center text-xs text-[#597494]">
                      ยังไม่มีประเภทย่อยในหมวดนี้ พิมพ์ชื่อด้านบนแล้วกด “เพิ่มประเภทย่อย”
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {activeGroup.subCategories.map((sub, idx) => (
                        <span
                          key={`${sub}-${idx}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#b8d0eb] bg-[#eef5fd] px-2.5 py-1.5 text-xs font-medium text-[#153c6b]"
                        >
                          <span>{sub}</span>
                          <button
                            type="button"
                            onClick={() =>
                              handleRemoveSubCategory(activeGroup.id, idx)
                            }
                            title={`ลบประเภทย่อย ${sub}`}
                            aria-label={`ลบประเภทย่อย ${sub}`}
                            className="rounded p-0.5 text-[#5c789a] hover:bg-[#dceafa] hover:text-[#b52c2c]"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="py-10 text-center text-xs text-[#597494]">
                กรุณาเพิ่มหมวดค่าใช้จ่ายหลักทางด้านซ้าย
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="mt-3 rounded-lg border border-[#f0b4b4] bg-[#fff0f0] px-3 py-2 text-xs text-[#b52c2c]"
              >
                {error}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#d6e4f4] bg-[#f4f8fe] px-6 py-3.5">
          <button
            type="button"
            onClick={handleRestoreDefaults}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#b4cde8] bg-white px-3 py-1.5 text-xs font-semibold text-[#1e4675] hover:bg-[#e7f1fc]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            เติมหมวดมาตรฐาน อปท.
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#afc8e4] bg-white px-4 py-2 text-xs font-semibold text-[#274469] hover:bg-[#edf4fc]"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-lg bg-gradient-to-r from-[#0f489e] to-[#1972c9] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:from-[#0b387d] hover:to-[#135ba4]"
            >
              บันทึกโครงสร้างหมวด
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
