import {
  ArrowDownToLine,
  CheckCircle2,
  Eye,
  Inbox,
  Paperclip,
  Plus,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  formatExpenseClassification,
  resolveProjectBudgetHierarchy,
} from '../../domain/expenseCategories';
import {
  canEditProject,
  getAckAt,
  getResponsibleName,
  getStatusUpdatedAt,
  isOverdueProject,
} from '../../domain/procurement';
import { useProcurement } from '../../storage/useProcurementStore';
import type { ProjectRecord, ProjectTabId } from '../../types/procurement';
import { formatThaiDate, formatThaiDateTime } from '../../utils/date';
import { StatusBadge } from '../common/StatusBadge';
import { StatusTransitionModal } from '../modals/StatusTransitionModal';
import { SarabanQueuePage } from './SarabanQueuePage';

interface InboxPageProps {
  rows: ProjectRecord[];
  onViewProject: (id: string, tab?: ProjectTabId) => void;
  onCreateProject?: () => void;
}

export function InboxPage({
  rows,
  onViewProject,
  onCreateProject,
}: InboxPageProps) {
  const {
    state,
    user,
    inboxTab,
    setInboxTab,
    sarabanPendingCount,
    commit,
    appendHistory,
    showToast,
  } = useProcurement();
  const isAdmin = user.role === 'admin';

  const [statusModalProjectId, setStatusModalProjectId] = useState<string | null>(null);

  const statusModalProject = useMemo(
    () =>
      statusModalProjectId
        ? state.rows.find((r) => r.id === statusModalProjectId) || null
        : null,
    [statusModalProjectId, state.rows],
  );

  const poolById = useMemo(
    () => new Map((state.budgetPools || []).map((p) => [p.id, p])),
    [state.budgetPools],
  );

  const prioritizedRows = useMemo(() => {
    const score = (p: ProjectRecord): number => {
      if (isOverdueProject(p)) return 0;
      if (p.status === 'ส่งกลับแก้ไข') return 1;
      if (!p.ack) return 2;
      if (p.status === 'รออนุมัติ') return 3;
      return 4;
    };
    return [...rows].sort((a, b) => score(a) - score(b));
  }, [rows]);

  const handleQuickAcknowledge = (project: ProjectRecord) => {
    if (!canEditProject(user, project)) {
      showToast('เจ้าหน้าที่ (staff) ไม่มีสิทธิ์รับทราบงาน');
      return;
    }
    const nowIso = new Date().toISOString();
    const ok = commit((draft) => {
      const target = draft.rows.find((x) => x.id === project.id);
      if (!target) throw new Error('ไม่พบโครงการ');
      target.ack = true;
      target.ackAt = nowIso;
      appendHistory(target, 'รับทราบงาน');
    });
    if (ok) {
      showToast(`รับทราบงาน ${project.code} แล้ว`);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-[#b8d0eb] bg-white shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#d4e3f3] bg-gradient-to-r from-[#f8fbff] via-[#f3f8fe] to-[#ecf4fd] px-6 py-5">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#96c4ea] bg-[#e0f2fe]">
              <Inbox className="h-4 w-4 text-[#0d825b]" />
            </span>
            <h2 className="text-[16px] font-bold tracking-tight text-[#0f2d52]">
              กล่องงานของฉัน (My Inbox)
            </h2>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="มุมมองกล่องงานของฉัน"
          className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-[#c8dcf0] bg-[#eef5fc] p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={inboxTab === 'projects'}
            onClick={() => setInboxTab('projects')}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-[12px] transition ${
              inboxTab === 'projects'
                ? 'bg-white font-bold text-[#0f2d52] shadow-xs'
                : 'font-semibold text-[#4b6789] hover:text-[#12396b]'
            }`}
          >
            <span>โครงการที่ดูแล ({prioritizedRows.length})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={inboxTab === 'saraban'}
            onClick={() => setInboxTab('saraban')}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-[12px] transition ${
              inboxTab === 'saraban'
                ? 'bg-white font-bold text-[#0d825b] shadow-xs'
                : sarabanPendingCount > 0
                  ? 'font-semibold text-[#0d825b] hover:bg-white/60'
                  : 'font-semibold text-[#4b6789] hover:text-[#12396b]'
            }`}
          >
            <ArrowDownToLine className="h-3.5 w-3.5 shrink-0" />
            <span>คิวรับจากสารบรรณ ({sarabanPendingCount})</span>
            {sarabanPendingCount > 0 && inboxTab !== 'saraban' && (
              <span className="ml-0.5 grid h-4 min-w-[18px] place-items-center rounded-full bg-[#fbbf24] px-1 text-[10px] font-bold tabular-nums text-[#091c36]">
                +{sarabanPendingCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {inboxTab === 'saraban' ? (
        <SarabanQueuePage onViewProject={onViewProject} />
      ) : (
        <>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] table-fixed border-collapse text-left text-xs">
          <colgroup>
            <col className="w-[10%]" />
            <col className="w-[13%]" />
            <col className="w-[24%]" />
            <col className="w-[12%]" />
            <col className="w-[16%]" />
            <col className="w-[10%]" />
            <col className="w-[15%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-[#d4e3f3] bg-[#eef5fc] text-[11.5px] font-semibold text-[#315075]">
              <th className="py-3.5 pl-5 pr-3">รหัสโครงการ</th>
              <th className="px-3 py-3.5">หมวดงบประมาณ</th>
              <th className="px-3 py-3.5">ชื่อโครงการ / หน่วยงาน</th>
              <th className="px-3 py-3.5">ผู้รับผิดชอบ</th>
              <th className="px-3 py-3.5 text-center">สถานะโครงการ / รับทราบ</th>
              <th className="px-3 py-3.5 text-center">ไฟล์แนบ</th>
              <th className="py-3.5 pl-3 pr-5 text-center">การกระทำ</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#e3edf7]">
            {prioritizedRows.map((project) => {
              const late = isOverdueProject(project);
              const ackAt = getAckAt(project);
              const statusUpdatedAt = getStatusUpdatedAt(project);
              const latestTimestamp =
                statusUpdatedAt && ackAt
                  ? Date.parse(statusUpdatedAt) >= Date.parse(ackAt)
                    ? statusUpdatedAt
                    : ackAt
                  : statusUpdatedAt || ackAt;
              const files = project.files || [];
              const firstDriveFile = files.length === 1 ? files[0] : null;
              const editable = canEditProject(user, project);

              return (
                <tr
                  key={project.id}
                  className="transition-colors hover:bg-[#f2f8ff]"
                >
                  <td className="py-4 pl-5 pr-3 align-middle">
                    <div className="font-mono-num text-[12.5px] font-bold text-[#0e6b5e] break-words">
                      {project.code}
                    </div>
                    <div className="mt-0.5 text-[11px] tabular-nums text-[#5b7696]">
                      ปี {project.year}
                    </div>
                  </td>

                  <td className="px-3 py-4 align-middle">
                    {(() => {
                      const hierarchy = resolveProjectBudgetHierarchy(
                        project,
                        poolById,
                      );
                      const primaryLabel =
                        hierarchy.pool?.name ||
                        formatExpenseClassification(
                          hierarchy.expenseCategory,
                          hierarchy.expenseSubCategory,
                        ) ||
                        project.fund ||
                        project.method ||
                        project.type;
                      const secondaryLabel = hierarchy.pool
                        ? formatExpenseClassification(
                            hierarchy.expenseCategory,
                            hierarchy.expenseSubCategory,
                          ) || hierarchy.budgetType
                        : '';
                      return (
                        <div className="space-y-0.5">
                          <span
                            title={primaryLabel}
                            className={`inline-flex max-w-full items-center rounded-md border px-2.5 py-1 text-[11px] font-semibold ${
                              hierarchy.pool
                                ? 'border-[#bfdbfe] bg-[#eff6ff] text-[#154b94]'
                                : 'border-[#e8c98e] bg-[#fff8ea] text-[#85540c]'
                            }`}
                          >
                            <span className="truncate">{primaryLabel}</span>
                          </span>
                          {secondaryLabel && (
                            <div
                              title={secondaryLabel}
                              className="truncate text-[10px] text-[#557191]"
                            >
                              {secondaryLabel}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </td>

                  <td className="px-3 py-4 align-middle">
                    <div className="text-[13px] font-semibold leading-snug text-[#102b4d] break-words">
                      {project.title}
                    </div>
                    <div className="mt-1 text-[11.5px] leading-snug text-[#557191] break-words">
                      <span>{project.department}</span>
                      {project.due && (
                        <span className={late ? ' font-semibold text-[#b82828]' : ''}>
                          {' '}
                          · กำหนดเสร็จ {formatThaiDate(project.due)}
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="px-3 py-4 align-middle text-[12px] font-medium leading-snug text-[#1b3a5e]">
                    {getResponsibleName(project).trim() ? (
                      getResponsibleName(project)
                        .trim()
                        .split(/\s+/)
                        .map((part, idx, arr) => (
                          <span key={idx} className="inline-block">
                            {part}
                            {idx < arr.length - 1 ? '\u00A0' : ''}
                          </span>
                        ))
                    ) : (
                      <span className="text-[#8ba4c0]">—</span>
                    )}
                  </td>

                  <td className="px-3 py-4 align-middle text-center">
                    <div className="flex flex-col items-center gap-1.5">
                      <StatusBadge status={project.status} />

                      {project.ack ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#9fdcc2] bg-[#e6f9f1] px-2.5 py-0.5 text-[10.5px] font-medium tabular-nums text-[#0f7454]">
                          <CheckCircle2 className="h-3 w-3 shrink-0" />
                          <span>
                            {latestTimestamp
                              ? formatThaiDateTime(latestTimestamp)
                              : 'รับทราบแล้ว'}
                          </span>
                        </span>
                      ) : editable ? (
                        <button
                          type="button"
                          onClick={() => handleQuickAcknowledge(project)}
                          className="inline-flex items-center gap-1 rounded-full border border-[#84cfa9] bg-[#ebfaf3] px-2.5 py-0.5 text-[10.5px] font-semibold text-[#0d6e4e] transition hover:border-[#4eb382] hover:bg-[#d5f4e5]"
                        >
                          <CheckCircle2 className="h-3 w-3 shrink-0" />
                          กดรับทราบงาน
                        </button>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-[#cfdceb] bg-[#f4f8fc] px-2.5 py-0.5 text-[10.5px] font-medium text-[#5a7594]">
                          รอรับทราบ
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="px-3 py-4 align-middle text-center">
                    {files.length > 0 ? (
                      firstDriveFile?.url ? (
                        <a
                          href={firstDriveFile.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-[#bdd6f2] bg-[#eef5ff] px-2.5 py-1.5 text-[11px] font-semibold text-[#1552a3] transition hover:border-[#85b6eb] hover:bg-[#dcebfa]"
                        >
                          <Paperclip className="h-3.5 w-3.5 shrink-0" />
                          เปิดดูไฟล์
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onViewProject(project.id)}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-[#bdd6f2] bg-[#eef5ff] px-2.5 py-1.5 text-[11px] font-semibold text-[#1552a3] transition hover:border-[#85b6eb] hover:bg-[#dcebfa]"
                        >
                          <Paperclip className="h-3.5 w-3.5 shrink-0" />
                          {files.length === 1 ? 'เปิดดูไฟล์' : `ดูไฟล์ (${files.length})`}
                        </button>
                      )
                    ) : (
                      <span className="text-xs text-[#8ba4c0]">—</span>
                    )}
                  </td>

                  <td className="py-4 pl-3 pr-5 align-middle">
                    <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                      {editable && (
                        <button
                          type="button"
                          onClick={() => setStatusModalProjectId(project.id)}
                          className="rounded-lg bg-[#0d9468] px-3 py-1.5 text-[11.5px] font-semibold text-white shadow-xs transition hover:bg-[#0a7a55]"
                        >
                          เปลี่ยนสถานะ
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onViewProject(project.id)}
                        aria-label={`ดูรายละเอียด ${project.code}`}
                        title="ดูรายละเอียดโครงการ"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#c5d9ef] bg-white text-[#35567d] transition hover:border-[#76a9e3] hover:bg-[#e6f0fc] hover:text-[#0f489e]"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {prioritizedRows.length === 0 && (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <p className="text-sm font-semibold text-[#23456b]">
              ยังไม่มีงานสำคัญที่รอดำเนินการในกล่องงาน
            </p>
            <p className="mt-1 text-xs text-[#5b7899]">
              โครงการที่เพิ่งเพิ่มเฉพาะข้อมูลทั่วไปจะเก็บไว้ในทะเบียนโครงการก่อน และจะเข้ามาแสดงที่นี่เมื่อมีการบันทึกขั้นตอนการขออนุมัติ
            </p>
            {isAdmin && onCreateProject && (
              <button
                type="button"
                onClick={onCreateProject}
                className="mt-4 inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-r from-[#0f489e] to-[#1972c9] px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:from-[#0b387d] hover:to-[#135ba4]"
              >
                <Plus className="h-3.5 w-3.5" />
                เพิ่มโครงการใหม่
              </button>
            )}
          </div>
        )}
      </div>

      <StatusTransitionModal
        project={statusModalProject}
        onClose={() => setStatusModalProjectId(null)}
      />
        </>
      )}
    </section>
  );
}
