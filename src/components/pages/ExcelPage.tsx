import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import {
  createExampleRecord,
  MAX_IMPORT_FILE_BYTES,
} from '../../data/constants';
import {
  buildExcelTables,
  exportWorkbookFile,
  previewExcelImport,
  readExcelFileToTables,
} from '../../domain/excel';
import { validateProject } from '../../domain/procurement';
import { useProcurement } from '../../storage/useProcurementStore';
import type { ImportPlan, ProjectRecord } from '../../types/procurement';
import { getFiscalYearOptions, uid } from '../../utils/date';
import { normalizeCodeKey } from '../../utils/format';

export function ExcelPage() {
  const { state, user, commit, appendHistory, showToast } = useProcurement();
  const canWrite = user.role === 'admin';

  const [importYear, setImportYear] = useState<string>('2570');
  const [importPlan, setImportPlan] = useState<ImportPlan | null>(null);
  const [importStatus, setImportStatus] = useState<string>('');
  const [importError, setImportError] = useState<string>('');
  const [isReading, setIsReading] = useState<boolean>(false);

  const handleDownloadTemplate = () => {
    try {
      const example = createExampleRecord(state.steps[0]?.id || 's1');
      exportWorkbookFile(buildExcelTables([example]), 'แม่แบบครบทุกหมวด.xlsx');
      showToast('ดาวน์โหลดแม่แบบครบทุกหมวดแล้ว');
    } catch (err) {
      showToast(`สร้างแม่แบบไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleExportAll = () => {
    try {
      if (!state.rows.length) {
        showToast('ไม่มีรายการสำหรับส่งออก');
        return;
      }
      exportWorkbookFile(
        buildExcelTables(state.rows),
        'ทะเบียนโครงการครบทุกหมวด.xlsx',
      );
      showToast('สร้างไฟล์ส่งออกครบทุกหมวดแล้ว');
    } catch (err) {
      showToast(`ส่งออกไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleSelectFile = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!canWrite) {
      showToast('เจ้าหน้าที่ (staff) ไม่มีสิทธิ์นำเข้า');
      return;
    }

    const file = e.target.files?.[0];
    setImportPlan(null);
    setImportStatus('');
    setImportError('');

    if (!file) return;

    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setImportError('ไฟล์ต้องไม่เกิน 10 MB');
      e.target.value = '';
      return;
    }

    setIsReading(true);
    try {
      const tables = await readExcelFileToTables(file);
      const preview = previewExcelImport(
        tables,
        state.rows,
        user.id,
        importYear,
        state.steps,
      );

      setImportPlan({
        ...preview,
        targetYear: importYear,
        workflowSnapshot: JSON.stringify(state.steps),
      });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsReading(false);
      e.target.value = '';
    }
  };

  const handleYearChange = (nextYear: string) => {
    setImportYear(nextYear);
    if (importPlan && importPlan.targetYear !== nextYear) {
      setImportPlan(null);
      setImportStatus('');
    }
  };

  const handleConfirmImport = () => {
    if (!importPlan || !canWrite) return;

    if (
      importYear !== importPlan.targetYear ||
      JSON.stringify(state.steps) !== importPlan.workflowSnapshot
    ) {
      showToast('ปีปลายทางหรือการตั้งค่าเปลี่ยน กรุณาตรวจไฟล์ใหม่');
      return;
    }

    const success = commit((draft) => {
      for (const item of importPlan.items) {
        const source = structuredClone(item.record);
        const targetIndex = draft.rows.findIndex(
          (r) =>
            (item.existingId && r.id === item.existingId) ||
            normalizeCodeKey(r.code) === normalizeCodeKey(source.code),
        );

        if (targetIndex >= 0) {
          const existing = draft.rows[targetIndex];
          const updated: ProjectRecord = {
            ...existing,
            ...source,
            id: existing.id,
            assignee: existing.assignee,
            ack: existing.ack,
            files: item.hasAttachmentRows ? source.files : existing.files,
            history: structuredClone(existing.history || []),
          };
          const errors = validateProject(updated, draft.rows, existing.id);
          if (errors.length) {
            throw new Error(errors.join(' / '));
          }
          appendHistory(
            updated,
            `อัปเดตข้อมูลจาก Excel (Upsert) ปี ${updated.year}`,
          );
          draft.rows[targetIndex] = updated;
        } else {
          source.id = uid();
          const errors = validateProject(source, draft.rows);
          if (errors.length) {
            throw new Error(errors.join(' / '));
          }
          appendHistory(source, `นำเข้า Excel ครบทุกหมวด ปี ${source.year}`);
          draft.rows.push(source);
        }
      }
    });

    if (success) {
      setImportStatus(
        `นำเข้าสำเร็จ ${importPlan.items.length} โครงการ (เพิ่มใหม่ ${importPlan.insertCount} · อัปเดตของเดิม ${importPlan.updateCount}) · ไม่นำเข้ากลุ่มรหัสที่ผิด ${importPlan.badProjects} กลุ่ม · ข้อผิดพลาด ${importPlan.errors.length} จุด`,
      );
      setImportPlan(null);
      showToast('บันทึกข้อมูลนำเข้า (Upsert) สำเร็จ');
    }
  };

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[10px] border border-[#dce8f5] bg-white">
        <div className="flex items-center justify-between gap-2 border-b border-[#e6eff8] bg-gradient-to-r from-white to-[#f7fbff] px-5 py-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-[#1762ce]" />
            <h2 className="text-[14px] font-semibold text-[#315c88]">
              {canWrite ? 'นำเข้า / ส่งออกครบทุกหมวด (Upsert)' : 'ส่งออกข้อมูลครบทุกหมวด'}
            </h2>
          </div>
          <span className="rounded border border-[#c8dcf7] bg-[#edf3fd] px-2 py-0.5 font-mono-num text-[11px] font-medium text-[#285ea8]">
            Excel .xlsx
          </span>
        </div>

        <div className="space-y-4 p-5 text-xs text-[#546d87]">
          <p className="leading-relaxed">
            ใช้ไฟล์เดียวเชื่อมข้อมูลทั้ง 5 หมวด กรรมการ TOR กรรมการตรวจรับ ผลตรวจรับ
            ข้อมูลขั้นตอน และไฟล์แนบ ด้วยรหัสโครงการเดียวกัน
          </p>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-[#d6e4f3] bg-white px-3.5 py-2 text-xs font-medium text-[#2b578d] transition hover:border-[#b3cfee] hover:bg-[#eef5fd]"
            >
              <Download className="h-3.5 w-3.5" />
              แม่แบบครบทุกหมวด
            </button>
            <button
              type="button"
              onClick={handleExportAll}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-[#d6e4f3] bg-white px-3.5 py-2 text-xs font-medium text-[#2b578d] transition hover:border-[#b3cfee] hover:bg-[#eef5fd]"
            >
              <Download className="h-3.5 w-3.5" />
              ส่งออกข้อมูลทั้งหมด
            </button>
          </div>

          <p className="text-[11px] text-[#6d849d]">
            วันที่เป็นข้อความ YYYY-MM-DD ค.ศ. · เงิน ลำดับ และงวดเป็นเซลล์ตัวเลข ·
            รหัสและเลขเอกสารเป็นข้อความ · ไม่แก้ชื่อชีต/หัวคอลัมน์
          </p>

          <div className="rounded-lg border border-[#f2deb9] bg-[#fff8ed] p-3.5 text-[11.5px] leading-relaxed text-[#8d672b]">
            รองรับการนำเข้าแบบ <b>Upsert</b> หากพบรหัสโครงการเดิมในระบบจะอัปเดตข้อมูลให้เป็นปัจจุบัน
            หากเป็นรหัสใหม่จะเพิ่มเข้าระบบ (หากไม่ระบุแถวไฟล์แนบในชีตไฟล์แนบ ระบบจะคงไฟล์แนบเดิมไว้)
            <br />
            หากข้อมูลในหมวดย่อยของโครงการใดผิด โครงการนั้นจะไม่ถูกบันทึกบางส่วน
            <br />
            สรุปวงเงินไม่นับพักงาน/ยกเลิก แต่ข้อมูลวงเงินจริงในทะเบียนยังเก็บครบถ้วน
          </div>
        </div>
      </section>

      {canWrite && (
        <section className="overflow-hidden rounded-[10px] border border-[#dce8f5] bg-white">
          <div className="border-b border-[#e6eff8] bg-gradient-to-r from-white to-[#f7fbff] px-5 py-4">
            <h2 className="text-[14px] font-semibold text-[#315c88]">
              ตรวจสอบก่อนนำเข้า (Upsert)
            </h2>
          </div>

          <div className="p-5">
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="block text-[11.5px] font-medium text-[#4f6784]">
                  ปีงบประมาณปลายทาง
                  <select
                    value={importYear}
                    onChange={(e) => handleYearChange(e.target.value)}
                    className="mt-1.5 block min-h-[40px] w-full rounded-md border border-[#d9e4f0] bg-white px-3 py-2 text-xs text-[#2f455e] focus:border-[#5da5e4] focus:outline-none focus:ring-2 focus:ring-[#c8e5ff]"
                  >
                    <option value="file">ใช้ปีที่ระบุในแต่ละแถวของไฟล์</option>
                    {getFiscalYearOptions(2570).map((y) => (
                      <option key={y} value={String(y)}>
                        ปีงบประมาณ {y}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-[11.5px] font-medium text-[#4f6784]">
                  ไฟล์ .xlsx (สูงสุด 10 MB)
                  <div className="mt-1.5 flex items-center gap-2">
                    <input
                      type="file"
                      accept=".xlsx"
                      onChange={handleSelectFile}
                      className="block min-h-[40px] w-full rounded-md border border-[#d9e4f0] bg-[#f7fafe] px-3 py-1.5 text-xs text-[#364d68] file:mr-3 file:rounded file:border file:border-[#c8dcf2] file:bg-white file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-[#235d9e]"
                    />
                  </div>
                </label>
              </div>

              {isReading && <p className="text-xs text-[#4b6f96]">กำลังตรวจข้อมูล…</p>}

              {importError && (
                <p className="rounded-md border border-[#f5c7c7] bg-[#fff2f2] p-3 text-xs text-[#b43c3c]">
                  {importError}
                </p>
              )}

              {importPlan && (
                <div className="space-y-3 rounded-lg border border-[#dbe8f5] bg-[#f8fbff] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold text-[#284a70]">
                      ตรวจสอบก่อนนำเข้าโครงการ (Upsert)
                    </h3>
                    <span className="text-[11px] text-[#5e7794] tabular-nums">
                      ปีปลายทาง:{' '}
                      {importPlan.targetYear === 'file'
                        ? 'ตามปีในแต่ละแถว'
                        : importPlan.targetYear}{' '}
                      · เพิ่มใหม่ {importPlan.insertCount} · อัปเดต{' '}
                      {importPlan.updateCount} · ข้อผิดพลาด {importPlan.errors.length} จุด
                    </span>
                  </div>

                  <p className="text-[11px] text-[#7088a3]">
                    {Object.entries(importPlan.years)
                      .map(([y, n]) => `ปี ${y}: ${n} โครงการ`)
                      .join(' · ') || 'ไม่มีรายการผ่าน'}
                  </p>

                  {importPlan.items.length > 0 && (
                    <div className="max-h-[180px] space-y-1.5 overflow-y-auto rounded-md border border-[#dbe8f5] bg-white p-3 text-xs">
                      {importPlan.items.map((item) => (
                        <p key={item.record.code} className="flex items-center gap-2 text-[#355170]">
                          <span
                            className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                              item.mode === 'update'
                                ? 'border-[#f2dca8] bg-[#fff7e8] text-[#9b6c16]'
                                : 'border-[#bce5d2] bg-[#eaf8f2] text-[#177853]'
                            }`}
                          >
                            {item.mode === 'update' ? 'อัปเดต' : 'ใหม่'}
                          </span>
                          <b className="font-mono-num text-[#1762ce]">{item.record.code}</b>
                          <span className="truncate">
                            · {item.record.title} · ปี {item.record.year}
                          </span>
                        </p>
                      ))}
                    </div>
                  )}

                  {importPlan.errors.length > 0 && (
                    <div className="max-h-[200px] space-y-1 overflow-y-auto rounded-md border border-[#f4c6c6] bg-[#fff4f4] p-3 text-[11px] leading-relaxed text-[#a63434]">
                      {importPlan.errors.map((err, i) => (
                        <div key={`${err.sheet}-${err.row}-${i}`}>
                          {err.sheet} แถว {err.row} รหัส {err.code || '—'}: {err.message}
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="text-[11px] text-[#758ba4]">
                    โครงการที่มีข้อมูลผิดจะไม่ถูกบันทึก โครงการที่ผ่านจะเพิ่มใหม่หรืออัปเดตตามรหัสโครงการอัตโนมัติ
                  </p>

                  <button
                    type="button"
                    disabled={importPlan.items.length === 0}
                    onClick={handleConfirmImport}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#1762ce] px-4 py-2 text-xs font-medium text-white transition hover:bg-[#124ea8] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    ยืนยันนำเข้า {importPlan.items.length} โครงการ
                  </button>
                </div>
              )}

              {importStatus && (
                <p
                  role="status"
                  className="rounded-md border border-[#bce5d2] bg-[#eaf8f2] p-3 text-xs font-medium text-[#177853]"
                >
                  {importStatus}
                </p>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
