import { ArrowDown, ArrowUp, ArrowUpDown, Download, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { TABLE_COLUMNS } from '../../data/constants';
import { buildExcelTables, exportWorkbookFile } from '../../domain/excel';
import {
  canEditProject,
  getResponsibleName,
} from '../../domain/procurement';
import { useProcurement } from '../../storage/useProcurementStore';
import type { ProjectRecord } from '../../types/procurement';
import { formatMoney } from '../../utils/format';
import { StatusBadge } from '../common/StatusBadge';

interface ProjectsTablePanelProps {
  rows: ProjectRecord[];
  title: string;
  compact?: boolean;
  onViewProject: (id: string) => void;
  onEditProject: (id: string) => void;
  onCreateProject?: () => void;
}

export function ProjectsTablePanel({
  rows,
  title,
  compact = false,
  onViewProject,
  onEditProject,
  onCreateProject,
}: ProjectsTablePanelProps) {
  const { state, user, viewFilter, toggleSort, navigate, deleteProject, showToast } =
    useProcurement();
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<ProjectRecord | null>(
    null,
  );

  const handleExportFiltered = () => {
    try {
      if (!rows.length) {
        showToast('ไม่มีรายการสำหรับส่งออก');
        return;
      }
      exportWorkbookFile(
        buildExcelTables(rows, state.budgetPools),
        'ทะเบียนโครงการครบทุกหมวด.xlsx',
      );
      showToast('สร้างไฟล์ส่งออกครบทุกหมวดแล้ว');
    } catch (err) {
      showToast(`ส่งออกไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleConfirmDelete = () => {
    if (!confirmDeleteTarget) return;
    const ok = deleteProject(confirmDeleteTarget.id);
    if (ok) {
      showToast(`ลบโครงการ ${confirmDeleteTarget.code} แล้ว`);
      setConfirmDeleteTarget(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-[10px] border border-[#b8d0eb] bg-white shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#c2d8f0] bg-gradient-to-r from-[#eef4fc] to-[#ddeafa] px-5 py-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-[14px] font-semibold text-[#12396b]">{title}</h2>
            <span className="rounded border border-[#a9c5e6] bg-white px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[#194b8e]">
              {rows.length} รายการ
            </span>
          </div>
        </div>

        {compact ? (
          <button
            type="button"
            onClick={() => navigate('register')}
            className="whitespace-nowrap rounded-md border border-[#9fc0e6] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#144b96] transition hover:border-[#6da3df] hover:bg-[#dfecfc]"
          >
            ดูทะเบียนทั้งหมด ↗
          </button>
        ) : (
          <button
            type="button"
            onClick={handleExportFiltered}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-[#9fc0e6] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#144b96] transition hover:border-[#6da3df] hover:bg-[#dfecfc]"
          >
            <Download className="h-3.5 w-3.5" />
            ส่งออก Excel
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[840px] table-fixed border-collapse text-left text-[11.5px]">
          <colgroup>
            {TABLE_COLUMNS.map((c) => (
              <col
                key={c.key}
                style={{
                  width:
                    c.key === 'title' && user.role !== 'admin' ? '28%' : c.width,
                }}
              />
            ))}
            <col style={{ width: user.role === 'admin' ? '12%' : '8%' }} />
          </colgroup>
          <thead>
            <tr className="border-b border-[#b8d0eb] bg-[#d8e7f8] text-[#143966]">
              {TABLE_COLUMNS.map((col) => {
                const isSortable = Boolean(col.sortable);
                const isSorted = isSortable && viewFilter.sort === col.key;
                const ariaSort = isSorted
                  ? viewFilter.dir === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none';
                const alignClass =
                  col.key === 'agreed'
                    ? 'text-right'
                    : col.key === 'year' || col.key === 'status'
                      ? 'text-center'
                      : 'text-left';

                return (
                  <th
                    key={col.key}
                    aria-sort={isSortable ? ariaSort : undefined}
                    className={`px-3.5 py-3 text-[11px] font-semibold ${alignClass}`}
                  >
                    {isSortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className={`inline-flex items-center gap-1 transition hover:text-[#0b3d8a] ${
                          col.key === 'year' ? 'justify-center' : 'text-left'
                        }`}
                      >
                        <span>{col.label}</span>
                        {isSorted ? (
                          viewFilter.dir === 'asc' ? (
                            <ArrowUp className="h-3 w-3 shrink-0 text-[#0f4ca6]" />
                          ) : (
                            <ArrowDown className="h-3 w-3 shrink-0 text-[#0f4ca6]" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 shrink-0 opacity-55" />
                        )}
                      </button>
                    ) : (
                      <span>{col.label}</span>
                    )}
                  </th>
                );
              })}
              <th className="px-3.5 py-3 text-center text-[11px] font-semibold">
                จัดการ
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => {
              const editable = canEditProject(user, r);

              return (
                <tr
                  key={r.id}
                  className="border-b border-[#dde8f5] transition-colors hover:bg-[#edf5fd]"
                >
                  <td className="px-3.5 py-3.5 align-middle font-mono-num text-[11.5px] font-semibold text-[#134a96] break-words">
                    {r.code}
                  </td>
                  <td className="px-3.5 py-3.5 text-center align-middle tabular-nums text-[#355478]">
                    {r.year}
                  </td>
                  <td className="px-3.5 py-3.5 align-middle">
                    <div className="font-semibold leading-snug text-[#122e4f] break-words">
                      {r.title}
                    </div>
                    <div className="mt-0.5 text-[10px] text-[#557191] break-words">
                      {r.department} · {r.type}
                    </div>
                  </td>
                  <td className="px-3.5 py-3.5 align-middle">
                    <div className="leading-snug text-[#1c3c61]">
                      {getResponsibleName(r)
                        .trim()
                        .split(/\s+/)
                        .map((part, idx, arr) => (
                          <span key={idx} className="inline-block">
                            {part}
                            {idx < arr.length - 1 ? '\u00A0' : ''}
                          </span>
                        ))}
                    </div>
                  </td>
                  <td className="px-3.5 py-3.5 text-right align-middle font-mono-num font-medium text-[#153152]">
                    {formatMoney(r.agreed)}
                  </td>
                  <td className="px-3.5 py-3.5 align-middle text-[#24456b] break-words">
                    {r.vendor?.trim() || '—'}
                  </td>
                  <td className="px-3.5 py-3.5 text-center align-middle">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-3.5 py-3.5 text-center align-middle">
                    <div className="flex flex-wrap items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onViewProject(r.id)}
                        aria-label={`ดู ${r.code}`}
                        className="rounded border border-[#aec7e4] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#173d6b] transition hover:border-[#6ca1de] hover:bg-[#e1edfb]"
                      >
                        ดู
                      </button>
                      {editable && (
                        <>
                          <button
                            type="button"
                            onClick={() => onEditProject(r.id)}
                            aria-label={`แก้ไข ${r.code}`}
                            className="rounded border border-[#9fc0e6] bg-[#edf4fc] px-2.5 py-1 text-[11px] font-semibold text-[#10499c] transition hover:border-[#639ce0] hover:bg-[#dcebfa]"
                          >
                            แก้ไข
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteTarget(r)}
                            aria-label={`ลบ ${r.code}`}
                            title="ลบโครงการ"
                            className="rounded border border-[#edb8b8] bg-white p-1.5 text-[#a82c2c] transition hover:bg-[#ffebeb]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {rows.length === 0 && (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <p className="text-sm font-semibold text-[#2e4f75]">
              ไม่พบโครงการที่ตรงกับตัวกรอง
            </p>
            <p className="mt-1 text-xs text-[#597494]">
              ลองปรับปีงบประมาณ สถานะ คำค้นหา หรือเพิ่มโครงการใหม่เข้าสู่ระบบ
            </p>
            {user.role === 'admin' && onCreateProject && (
              <button
                type="button"
                onClick={onCreateProject}
                className="mt-4 inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-r from-[#0f489e] to-[#1972c9] px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:from-[#0b387d] hover:to-[#135ba4]"
              >
                <Plus className="h-3.5 w-3.5" />
                เพิ่มโครงการแรก
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-[#d8e6f5] bg-[#f6fafe] px-5 py-3 text-[11px] text-[#4b688a]">
        <span className="tabular-nums font-medium">ทั้งหมด {rows.length} รายการ</span>
        <span>คลิกปุ่ม “ดู” เพื่อเปิดรายละเอียดโครงการครบทุกหมวด</span>
      </div>

      {confirmDeleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-delete-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#061830]/70 p-4 backdrop-blur-[2px]"
        >
          <div className="w-full max-w-[400px] rounded-xl border border-[#9fc0e6] bg-white p-5 shadow-2xl">
            <h3 id="confirm-delete-title" className="text-sm font-bold text-[#0f2a4a]">
              ยืนยันการลบโครงการ
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-[#365375]">
              ต้องการลบโครงการ <b className="font-mono-num">{confirmDeleteTarget.code}</b>{' '}
              ({confirmDeleteTarget.title}) ออกจากระบบหรือไม่?
              การลบจะอัปเดตทั้งในเครื่องและบน Google Sheet (หากเชื่อมต่อไว้)
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteTarget(null)}
                className="rounded-lg border border-[#afc8e4] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#274469] hover:bg-[#edf4fc]"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="rounded-lg bg-[#b82828] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#961d1d]"
              >
                ยืนยันลบโครงการ
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
