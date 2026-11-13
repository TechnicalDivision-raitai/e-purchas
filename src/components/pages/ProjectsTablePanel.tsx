import { ArrowDown, ArrowUp, ArrowUpDown, Download, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { TABLE_COLUMNS } from '../../data/constants';
import { buildExcelTables, exportWorkbookFile } from '../../domain/excel';
import {
  canEditProject,
  getResponsibleName,
  getStepName,
  isOverdueProject,
} from '../../domain/procurement';
import { useProcurement } from '../../storage/useProcurementStore';
import type { ProjectRecord } from '../../types/procurement';
import { formatThaiDate } from '../../utils/date';
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
      exportWorkbookFile(buildExcelTables(rows), 'ทะเบียนโครงการครบทุกหมวด.xlsx');
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
    <section className="overflow-hidden rounded-[10px] border border-[#dce8f5] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6eff8] bg-gradient-to-r from-white to-[#f7fbff] px-5 py-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-[14px] font-semibold text-[#315c88]">{title}</h2>
            <span className="rounded border border-[#dce5f0] bg-[#f1f5fa] px-2 py-0.5 text-[11px] font-medium tabular-nums text-[#5b718c]">
              {rows.length} รายการ
            </span>
          </div>
          <p className="mt-1 text-[11px] text-[#8394a8]">
            {compact
              ? 'แสดงไม่เกิน 5 รายการตามลำดับที่เลือก'
              : 'กดหัวคอลัมน์เพื่อเรียงข้อมูล · งานที่ปิดแล้วยังคงอยู่ในทะเบียน'}
          </p>
        </div>

        {compact ? (
          <button
            type="button"
            onClick={() => navigate('register')}
            className="whitespace-nowrap rounded-md border border-[#dce8f5] bg-white px-3 py-1.5 text-[11px] font-medium text-[#2d5d96] transition hover:border-[#bfd7f2] hover:bg-[#eef4fd]"
          >
            ดูทะเบียนทั้งหมด ↗
          </button>
        ) : (
          <button
            type="button"
            onClick={handleExportFiltered}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-[#dce8f5] bg-white px-3 py-1.5 text-[11px] font-medium text-[#2d5d96] transition hover:border-[#bfd7f2] hover:bg-[#eef4fd]"
          >
            <Download className="h-3.5 w-3.5" />
            ส่งออก Excel
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1560px] table-fixed border-collapse text-left text-[11.5px]">
          <colgroup>
            {TABLE_COLUMNS.map((c) => (
              <col key={c.key} style={{ width: `${c.width}px` }} />
            ))}
            <col style={{ width: user.role === 'admin' ? '168px' : '90px' }} />
          </colgroup>
          <thead>
            <tr className="border-b border-[#dce8f5] bg-[#edf5fd] text-[#5c7d9e]">
              {TABLE_COLUMNS.map((col) => {
                const isSorted = viewFilter.sort === col.key;
                const ariaSort = isSorted
                  ? viewFilter.dir === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none';

                return (
                  <th
                    key={col.key}
                    aria-sort={ariaSort}
                    className="px-3.5 py-3 text-[11px] font-semibold"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className={`inline-flex items-center gap-1 text-left transition hover:text-[#1762ce] ${
                        col.key === 'budget' || col.key === 'agreed' ? 'w-full justify-end' : ''
                      }`}
                    >
                      <span>{col.label}</span>
                      {isSorted ? (
                        viewFilter.dir === 'asc' ? (
                          <ArrowUp className="h-3 w-3 shrink-0 text-[#1762ce]" />
                        ) : (
                          <ArrowDown className="h-3 w-3 shrink-0 text-[#1762ce]" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 shrink-0 opacity-45" />
                      )}
                    </button>
                  </th>
                );
              })}
              <th className="px-3.5 py-3 text-[11px] font-semibold">จัดการ</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => {
              const late = isOverdueProject(r);
              const editable = canEditProject(user, r);

              return (
                <tr
                  key={r.id}
                  className="border-b border-[#eef2f7] transition-colors hover:bg-[#f7fbff]"
                >
                  <td className="px-3.5 py-3.5 align-middle font-mono-num text-[11.5px] font-medium text-[#2c5d99]">
                    {r.code}
                  </td>
                  <td className="px-3.5 py-3.5 align-middle tabular-nums text-[#536b84]">
                    {r.year}
                  </td>
                  <td className="px-3.5 py-3.5 align-middle">
                    <div className="font-medium leading-snug text-[#273f5b] break-words">
                      {r.title}
                    </div>
                    <div className="mt-0.5 text-[10px] text-[#8396ac]">
                      {r.department} · {r.type}
                    </div>
                  </td>
                  <td className="px-3.5 py-3.5 align-middle font-mono-num text-[#5b718a] break-words">
                    {r.docNo || '—'}
                  </td>
                  <td className="px-3.5 py-3.5 align-middle tabular-nums text-[#5b718a]">
                    {formatThaiDate(r.docDate)}
                  </td>
                  <td className="px-3.5 py-3.5 text-right align-middle font-mono-num text-[#2a425e]">
                    {formatMoney(r.budget)}
                  </td>
                  <td className="px-3.5 py-3.5 text-right align-middle font-mono-num text-[#2a425e]">
                    {formatMoney(r.agreed)}
                  </td>
                  <td className="px-3.5 py-3.5 align-middle">
                    <div className="text-[#3a526e] break-words">{getResponsibleName(r)}</div>
                    <div className="mt-0.5 text-[10px] text-[#7c90a6]">
                      {r.ack ? '✓ รับทราบแล้ว' : 'รอรับทราบ'}
                    </div>
                  </td>
                  <td className="px-3.5 py-3.5 align-middle text-[#49617c]">
                    {getStepName(state.steps, r.step)}
                  </td>
                  <td className="px-3.5 py-3.5 align-middle">
                    <StatusBadge status={r.status} />
                  </td>
                  <td
                    className={`px-3.5 py-3.5 align-middle tabular-nums ${
                      late ? 'font-semibold text-[#c53939]' : 'text-[#5b718a]'
                    }`}
                  >
                    {formatThaiDate(r.due)}
                  </td>
                  <td className="px-3.5 py-3.5 align-middle">
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onViewProject(r.id)}
                        aria-label={`ดู ${r.code}`}
                        className="rounded border border-[#d9e5f2] bg-white px-2.5 py-1 text-[11px] font-medium text-[#2d4868] transition hover:border-[#b7d1ee] hover:bg-[#eef5fd]"
                      >
                        ดู
                      </button>
                      {editable && (
                        <>
                          <button
                            type="button"
                            onClick={() => onEditProject(r.id)}
                            aria-label={`แก้ไข ${r.code}`}
                            className="rounded border border-[#d9e5f2] bg-white px-2.5 py-1 text-[11px] font-medium text-[#1b5ec2] transition hover:border-[#b7d1ee] hover:bg-[#eef5fd]"
                          >
                            แก้ไข
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteTarget(r)}
                            aria-label={`ลบ ${r.code}`}
                            title="ลบโครงการ"
                            className="rounded border border-[#f2d0d0] bg-white p-1.5 text-[#b43c3c] transition hover:bg-[#fff2f2]"
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
            <p className="text-sm font-medium text-[#5d738d]">
              ไม่พบโครงการที่ตรงกับตัวกรอง
            </p>
            <p className="mt-1 text-xs text-[#899bb0]">
              ลองปรับปีงบประมาณ สถานะ คำค้นหา หรือเพิ่มโครงการใหม่เข้าสู่ระบบ
            </p>
            {user.role === 'admin' && onCreateProject && (
              <button
                type="button"
                onClick={onCreateProject}
                className="mt-4 inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#1762ce] px-4 py-2 text-xs font-medium text-white transition hover:bg-[#134fa8]"
              >
                <Plus className="h-3.5 w-3.5" />
                เพิ่มโครงการแรก
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-[#eef2f7] px-5 py-3 text-[11px] text-[#8394a8]">
        <span className="tabular-nums">ทั้งหมด {rows.length} รายการ</span>
        <span>เลื่อนแนวนอนเพื่อดูข้อมูลเพิ่มเติม →</span>
      </div>

      {confirmDeleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-delete-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#142e4a]/50 p-4 backdrop-blur-[2px]"
        >
          <div className="w-full max-w-[400px] rounded-xl border border-[#dce8f5] bg-white p-5 shadow-2xl">
            <h3 id="confirm-delete-title" className="text-sm font-bold text-[#1e3550]">
              ยืนยันการลบโครงการ
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-[#546d87]">
              ต้องการลบโครงการ <b className="font-mono-num">{confirmDeleteTarget.code}</b>{' '}
              ({confirmDeleteTarget.title}) ออกจากระบบหรือไม่?
              การลบจะอัปเดตทั้งในเครื่องและบน Google Sheet (หากเชื่อมต่อไว้)
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteTarget(null)}
                className="rounded-lg border border-[#cad7e8] bg-white px-3.5 py-1.5 text-xs font-medium text-[#40516b] hover:bg-[#f6f9fd]"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="rounded-lg bg-[#c53939] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#a62d2d]"
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
