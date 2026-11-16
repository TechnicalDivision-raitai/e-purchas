import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { STATUSES } from '../../data/constants';
import {
  getStepName,
  normalizeLegacyStepId,
  transitionProjectStep,
} from '../../domain/procurement';
import { useProcurement } from '../../storage/useProcurementStore';
import type { ProjectRecord, ProjectStatus } from '../../types/procurement';

interface StatusTransitionModalProps {
  project: ProjectRecord | null;
  onClose: () => void;
}

export function StatusTransitionModal({
  project,
  onClose,
}: StatusTransitionModalProps) {
  const { state, user, commit, appendHistory, showToast } = useProcurement();

  const [nextStatus, setNextStatus] = useState<ProjectStatus>('กำลังดำเนินการ');
  const [nextStep, setNextStep] = useState<string>('s1');
  const [reason, setReason] = useState<string>('');
  const [alsoAck, setAlsoAck] = useState<boolean>(true);
  const [modalError, setModalError] = useState<string>('');

  useEffect(() => {
    if (!project) return;
    setNextStatus(project.status);
    setNextStep(normalizeLegacyStepId(project.step));
    setReason('');
    setAlsoAck(!project.ack);
    setModalError('');
  }, [project]);

  useEffect(() => {
    if (!project) return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [project, onClose]);

  if (!project) return null;

  const handleSaveStatus = () => {
    setModalError('');

    try {
      const transitioned = transitionProjectStep(
        project,
        nextStep,
        user,
        state.steps,
        reason,
      );

      if (['ส่งกลับแก้ไข', 'ยกเลิก'].includes(nextStatus) && !reason.trim()) {
        throw new Error('กรุณาระบุเหตุผลเมื่อส่งกลับแก้ไขหรือยกเลิก');
      }

      if (
        nextStatus === 'เสร็จสิ้น' &&
        transitioned.step !== state.steps[state.steps.length - 1]?.id
      ) {
        throw new Error('ต้องเลือกขั้นตอนสุดท้าย ("5. ฎีกา") ก่อนตั้งสถานะเสร็จสิ้น');
      }

      const nowIso = new Date().toISOString();

      const saved = commit((draft) => {
        const target = draft.rows.find((x) => x.id === project.id);
        if (!target) throw new Error('ไม่พบโครงการ');

        const beforeSummary = `${target.status} / ${getStepName(
          state.steps,
          target.step,
        )}`;
        const stepChanged = normalizeLegacyStepId(target.step) !== transitioned.step;
        const statusChanged = target.status !== nextStatus;
        const ackChanged = alsoAck && !target.ack;

        target.step = transitioned.step;
        target.status = nextStatus;
        target.manualStatusOverride = true;
        target.statusUpdatedAt = nowIso;

        if (ackChanged) {
          target.ack = true;
          target.ackAt = nowIso;
          appendHistory(target, 'รับทราบงาน');
        }

        if (stepChanged || statusChanged || reason.trim()) {
          appendHistory(
            target,
            `เปลี่ยนสถานะ ${beforeSummary} → ${nextStatus} / ${getStepName(
              state.steps,
              transitioned.step,
            )}${reason.trim() ? ` · ${reason.trim()}` : ''}`,
          );
        } else {
          appendHistory(
            target,
            `ยืนยันสถานะปัจจุบัน ${nextStatus} / ${getStepName(
              state.steps,
              transitioned.step,
            )}`,
          );
        }
      });

      if (saved) {
        showToast(`อัปเดตสถานะ ${project.code} แล้ว`);
        onClose();
      }
    } catch (err) {
      setModalError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-transition-modal-title"
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-[#061830]/75 p-4 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[460px] overflow-hidden rounded-2xl border border-[#2b6cb5] bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-[#092954] via-[#0f448a] to-[#1666ba] px-5 py-4 text-white">
          <div className="min-w-0">
            <h3
              id="status-transition-modal-title"
              className="text-sm font-bold tracking-tight"
            >
              เปลี่ยนสถานะและขั้นตอนดำเนินงาน
            </h3>
            <p className="mt-0.5 truncate text-[11px] text-[#b8dcff]">
              {project.code} · {project.title}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/25 bg-white/10 text-white hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <label className="block text-[11.5px] font-semibold text-[#1e426b]">
            สถานะโครงการ
            <select
              value={nextStatus}
              onChange={(e) => setNextStatus(e.target.value as ProjectStatus)}
              className="mt-1.5 block min-h-[40px] w-full rounded-lg border border-[#adc7e4] bg-white px-3 py-2 text-xs text-[#153152] focus:border-[#175bbd] focus:outline-none focus:ring-2 focus:ring-[#a8d1ff]"
            >
              {!STATUSES.includes(nextStatus) && (
                <option value={nextStatus}>{nextStatus}</option>
              )}
              {STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-[11.5px] font-semibold text-[#1e426b]">
            ขั้นตอนดำเนินงาน (ตามแท็บหลัก)
            <select
              value={nextStep}
              onChange={(e) => setNextStep(e.target.value)}
              className="mt-1.5 block min-h-[40px] w-full rounded-lg border border-[#adc7e4] bg-white px-3 py-2 text-xs text-[#153152] focus:border-[#175bbd] focus:outline-none focus:ring-2 focus:ring-[#a8d1ff]"
            >
              {state.steps.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-[11.5px] font-semibold text-[#1e426b]">
            หมายเหตุ / เหตุผล (จำเป็นกรณีส่งกลับหรือยกเลิก)
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="ระบุบันทึกการดำเนินงานหรือเหตุผล…"
              className="mt-1.5 block min-h-[40px] w-full rounded-lg border border-[#adc7e4] bg-white px-3 py-2 text-xs text-[#153152] placeholder:text-[#7a94b0] focus:border-[#175bbd] focus:outline-none focus:ring-2 focus:ring-[#a8d1ff]"
            />
          </label>

          {!project.ack && (
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#b4e3cd] bg-[#eefaf4] px-3 py-2.5 text-xs font-medium text-[#116947]">
              <input
                type="checkbox"
                checked={alsoAck}
                onChange={(e) => setAlsoAck(e.target.checked)}
                className="h-4 w-4 rounded border-[#62ba91] text-[#0d9468] focus:ring-[#0d9468]"
              />
              <span>รับทราบงานมอบหมายนี้พร้อมกันทันที</span>
            </label>
          )}

          {modalError && (
            <p
              role="alert"
              className="rounded-lg border border-[#edb0b0] bg-[#ffeaea] px-3 py-2 text-xs font-medium text-[#a32c2c]"
            >
              {modalError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#adc7e4] bg-white px-4 py-2 text-xs font-semibold text-[#24456b] hover:bg-[#edf4fc]"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleSaveStatus}
              className="rounded-lg bg-gradient-to-r from-[#0f489e] to-[#1972c9] px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:from-[#0b387d] hover:to-[#135ba4]"
            >
              บันทึกสถานะ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
