import {
  Check,
  CheckSquare,
  Clock,
  Download,
  ExternalLink,
  FileText,
  FolderKanban,
  Pencil,
  Printer,
  ShoppingCart,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { PROJECT_TABS, STATUSES } from '../../data/constants';
import {
  canEditProject,
  createAcceptanceDraft,
  getResponsibleName,
  getStepName,
  getTorPreparedDate,
  getUserName,
  transitionProjectStep,
} from '../../domain/procurement';
import { useProcurement } from '../../storage/useProcurementStore';
import type {
  AttachmentCategory,
  CommitteeMember,
  ProjectStatus,
  ProjectTabId,
} from '../../types/procurement';
import {
  formatThaiDate,
  formatThaiDateTime,
  isValidIsoDate,
} from '../../utils/date';
import { formatMoney, triggerDownloadUrl } from '../../utils/format';
import { StatusBadge } from '../common/StatusBadge';

interface ProjectViewModalProps {
  projectId: string | null;
  initialTab?: ProjectTabId;
  onClose: () => void;
  onOpenEdit: (id: string, tab: ProjectTabId) => void;
}

const TAB_ICONS: Record<ProjectTabId, typeof FolderKanban> = {
  general: FolderKanban,
  tor: Users,
  order: ShoppingCart,
  acceptance: CheckSquare,
  voucher: Clock,
};

export function ProjectViewModal({
  projectId,
  initialTab = 'general',
  onClose,
  onOpenEdit,
}: ProjectViewModalProps) {
  const { state, user, commit, deleteProject, appendHistory, showToast } =
    useProcurement();

  const project = useMemo(
    () => (projectId ? state.rows.find((r) => r.id === projectId) : undefined),
    [projectId, state.rows],
  );

  const [activeTab, setActiveTab] = useState<ProjectTabId>(initialTab);
  const [nextStatus, setNextStatus] = useState<ProjectStatus>('รอดำเนินการ');
  const [nextStep, setNextStep] = useState<string>('s1');
  const [stageDocNo, setStageDocNo] = useState<string>('');
  const [stageDocDate, setStageDocDate] = useState<string>('');
  const [stageStart, setStageStart] = useState<string>('');
  const [stageDue, setStageDue] = useState<string>('');
  const [stageFinished, setStageFinished] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [transitionError, setTransitionError] = useState<string>('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState<boolean>(false);

  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    setActiveTab(initialTab);
    setConfirmDeleteOpen(false);
  }, [initialTab, projectId]);

  useEffect(() => {
    if (!project) return;
    const sd = project.stageData?.[project.step];
    setNextStatus(project.status);
    setNextStep(project.step);
    setStageDocNo(sd?.docNo || '');
    setStageDocDate(sd?.docDate || '');
    setStageStart(sd?.start || '');
    setStageDue(sd?.due || '');
    setStageFinished(sd?.finished || '');
    setReason('');
    setTransitionError('');
  }, [project]);

  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmDeleteOpen) setConfirmDeleteOpen(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, confirmDeleteOpen]);

  if (!project) return null;

  const editable = canEditProject(user, project);
  const details = project.projectDetails || {};
  const acceptance = createAcceptanceDraft(details);
  const activeIndex = Math.max(
    0,
    PROJECT_TABS.findIndex((t) => t.id === activeTab),
  );

  const allowedNextSteps = state.steps.filter(
    (s) =>
      s.id === project.step ||
      state.steps.find((x) => x.id === project.step)?.next.includes(s.id),
  );

  const formatAmountOrDash = (val: number | '' | undefined | null) =>
    val == null || val === '' ? '—' : `${formatMoney(val)} บาท`;

  const handleTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    let next: number | undefined;
    if (e.key === 'ArrowRight') next = (idx + 1) % PROJECT_TABS.length;
    if (e.key === 'ArrowLeft') next = (idx - 1 + PROJECT_TABS.length) % PROJECT_TABS.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = PROJECT_TABS.length - 1;
    if (next !== undefined) {
      e.preventDefault();
      setActiveTab(PROJECT_TABS[next].id);
      tabRefs.current[next]?.focus();
    }
  };

  const handleAcknowledge = () => {
    const ok = commit((draft) => {
      const target = draft.rows.find((x) => x.id === project.id);
      if (!target) throw new Error('ไม่พบโครงการ');
      if (user.role !== 'admin') throw new Error('ไม่มีสิทธิ์รับทราบ');
      target.ack = true;
      appendHistory(target, 'รับทราบงาน');
    });
    if (ok) showToast('รับทราบงานแล้ว');
  };

  const handleConfirmDelete = () => {
    const code = project.code;
    if (deleteProject(project.id)) {
      showToast(`ลบโครงการ ${code} แล้ว`);
      onClose();
    }
  };

  const handleTransition = () => {
    setTransitionError('');
    try {
      const next = transitionProjectStep(
        project,
        nextStep,
        user,
        state.steps,
        reason,
      );

      if (['ส่งกลับแก้ไข', 'ยกเลิก'].includes(nextStatus) && !reason.trim()) {
        throw new Error('กรุณาระบุเหตุผล');
      }

      if (
        nextStatus === 'เสร็จสิ้น' &&
        next.step !== state.steps[state.steps.length - 1].id
      ) {
        throw new Error('ต้องอยู่ขั้นตอนสุดท้ายก่อนปิดงาน');
      }

      const stageEntry = {
        docNo: stageDocNo,
        docDate: stageDocDate,
        start: stageStart,
        due: stageDue,
        finished: stageFinished,
      };

      for (const dateVal of [
        stageEntry.docDate,
        stageEntry.start,
        stageEntry.due,
        stageEntry.finished,
      ]) {
        if (dateVal && !isValidIsoDate(dateVal)) {
          throw new Error('วันที่ขั้นตอนไม่ถูกต้อง');
        }
      }

      if (stageEntry.start && stageEntry.due && stageEntry.due < stageEntry.start) {
        throw new Error('กำหนดเสร็จก่อนวันเริ่มขั้นตอน');
      }

      if (
        stageEntry.start &&
        stageEntry.finished &&
        stageEntry.finished < stageEntry.start
      ) {
        throw new Error('วันเสร็จจริงก่อนวันเริ่มขั้นตอน');
      }

      const saved = commit((draft) => {
        const target = draft.rows.find((x) => x.id === project.id);
        if (!target) throw new Error('ไม่พบโครงการ');
        target.stageData[target.step] = stageEntry;
        const beforeSummary = `${target.status} / ${getStepName(
          state.steps,
          target.step,
        )}`;
        target.step = next.step;
        target.status = nextStatus;
        appendHistory(
          target,
          `เปลี่ยน ${beforeSummary} → ${nextStatus} / ${getStepName(
            state.steps,
            next.step,
          )}${reason ? ` · ${reason}` : ''}`,
        );
      });

      if (saved) {
        showToast('บันทึกสถานะและขั้นตอนแล้ว');
      }
    } catch (err) {
      setTransitionError(err instanceof Error ? err.message : String(err));
    }
  };

  const renderReportTable = (
    rows: Array<[string, string | number | undefined | null, 'money'?]>,
  ) => (
    <div className="print-avoid-break mb-3 overflow-hidden rounded-xl border border-[#cbddef] bg-white">
      <table className="w-full table-fixed border-collapse text-xs">
        <tbody>
          {rows.map(([label, val, kind]) => (
            <tr key={label} className="border-b border-[#e1eaf5] last:border-b-0">
              <th
                scope="row"
                className="w-[34%] border-r border-[#e1eaf5] bg-[#f5f8fc] px-3 py-2.5 text-left align-top font-semibold text-[#4d6582] break-words"
              >
                {label}
              </th>
              <td
                className={`px-3 py-2.5 align-top whitespace-pre-wrap break-words ${
                  kind === 'money'
                    ? 'font-mono-num text-[13px] font-bold text-[#176fa4]'
                    : 'text-[#2f435d]'
                }`}
              >
                {val == null || val === '' ? '—' : val}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderMembers = (members: CommitteeMember[], title: string) => {
    const valid = members.filter((m) => String(m.name || '').trim());
    return (
      <div>
        <h4 className="mt-5 mb-2.5 text-xs font-semibold text-[#47698f]">{title}</h4>
        {valid.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {valid.map((m, i) => (
              <div key={i}>
                {renderReportTable([
                  ['ลำดับ', i + 1],
                  ['ชื่อ–นามสกุล', m.name],
                  ['ตำแหน่งราชการ', m.position],
                  ['หน้าที่', m.role],
                ])}
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-lg bg-[#f7fafd] p-3.5 text-xs text-[#8da0b4]">
            ยังไม่มีรายชื่อกรรมการ
          </p>
        )}
      </div>
    );
  };

  const renderCategoryFiles = (category: AttachmentCategory) => {
    const files = (project.files || []).filter(
      (f) => (f.category || 'general') === category,
    );
    return (
      <div>
        <h4 className="mt-5 mb-2.5 flex items-center gap-2 text-xs font-semibold text-[#47698f]">
          <span>เอกสารแนบ</span>
          <span className="rounded border border-[#dce5f0] bg-[#f1f5fa] px-2 py-0.5 font-mono-num text-[11px] font-medium text-[#5b718c]">
            {files.length} ไฟล์
          </span>
        </h4>

        {files.length > 0 ? (
          <div className="space-y-2">
            {files.map((f) => (
              <div
                key={f.id}
                className="print-avoid-break flex items-center justify-between gap-2 rounded-lg border border-[#dce8f5] bg-white px-3 py-2 text-xs text-[#2f4865]"
              >
                <span className="flex min-w-0 items-center gap-2 truncate">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-[#5282b8]" />
                  <span className="truncate">{f.name}</span>
                  <span className="shrink-0 font-mono-num text-[11px] text-[#8396ac]">
                    · {(f.size / 1024).toFixed(0)} KB
                  </span>
                </span>

                {f.url ? (
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="no-print inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-[#d4e2f0] bg-white px-2.5 py-1 text-[11px] font-medium text-[#1b5ec2] hover:bg-[#eef5fd]"
                  >
                    <ExternalLink className="h-3 w-3" />
                    เปิดไฟล์ Drive
                  </a>
                ) : f.data ? (
                  <button
                    type="button"
                    onClick={() => triggerDownloadUrl(f.data!, f.name)}
                    className="no-print inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-[#d4e2f0] bg-white px-2.5 py-1 text-[11px] font-medium text-[#1b5ec2] hover:bg-[#eef5fd]"
                  >
                    <Download className="h-3 w-3" />
                    ดาวน์โหลด
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-lg bg-[#f7fafd] p-3.5 text-xs text-[#8da0b4]">
            ยังไม่มีเอกสารแนบในหมวดนี้
          </p>
        )}
      </div>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="view-modal-title"
      className="print-only-expand fixed inset-0 z-40 flex items-center justify-center bg-[#142e4a]/50 p-3 backdrop-blur-[2px] sm:p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="print-only-expand flex max-h-[92dvh] w-full max-w-[1100px] flex-col overflow-hidden rounded-[17px] border border-[#b8d6ef] bg-white shadow-2xl">
        <div className="no-print flex shrink-0 flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-[#124f9b] to-[#157bb9] px-6 py-5 text-white">
          <div className="min-w-0 flex-1">
            <h2
              id="view-modal-title"
              className="text-base font-bold leading-snug break-words sm:text-lg"
            >
              {project.title}
            </h2>
            <p className="mt-1 text-xs text-[#c3e4ff] tabular-nums">
              เลขทะเบียน {project.code} | ปีงบประมาณ พ.ศ. {project.year}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/25 bg-white/15 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/25"
            >
              <Printer className="h-3.5 w-3.5" />
              พิมพ์รายงาน
            </button>

            {editable && (
              <>
                <button
                  type="button"
                  onClick={() => onOpenEdit(project.id, activeTab)}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/25 bg-white/15 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/25"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  แก้ไขโครงการ
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteOpen(true)}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/25 bg-[#b93838]/75 px-3 py-1.5 text-xs font-medium text-white hover:bg-[#b93838]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  ลบ
                </button>
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="ปิดหน้าต่าง"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/25 bg-white/10 text-white hover:bg-white/20"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="หมวดรายละเอียดโครงการ"
          className="no-print flex shrink-0 gap-1.5 overflow-x-auto border-b border-[#d8e7f4] bg-[#edf5fd] px-4 py-2.5"
        >
          {PROJECT_TABS.map((tab, i) => {
            const Icon = TAB_ICONS[tab.id];
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(e) => handleTabKeyDown(e, i)}
                className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                  selected
                    ? 'border-[#b9d7f0] bg-white text-[#1766af] shadow-xs'
                    : 'border-transparent bg-transparent text-[#617f9e] hover:border-[#c2daef] hover:bg-[#e0edfb]'
                }`}
              >
                <Icon
                  className={`h-3.5 w-3.5 shrink-0 ${
                    selected ? 'text-[#1688c9]' : 'text-[#83a5c6]'
                  }`}
                />
                <span>
                  {i + 1}. {tab.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="print-only-expand min-h-0 flex-1 overflow-y-auto bg-white">
          <div className="p-6">
            <div className="mb-5 border-b-2 border-[#2b4664] pb-5 text-center">
              <p className="mb-2 text-xs text-[#778ca5]">
                รายละเอียดและติดตามงานจัดซื้อจัดจ้าง · กองช่าง อบต.ไร่ใต้
              </p>
              <h2 className="mb-2 text-xl font-bold leading-snug text-[#20334c] break-words sm:text-[22px]">
                {project.title}
              </h2>
              <div className="text-xs text-[#69809b] tabular-nums">
                เลขทะเบียน {project.code} <span className="mx-2 text-[#a2b0c0]">·</span>{' '}
                ปีงบประมาณ พ.ศ. {project.year}
              </div>
            </div>

            {PROJECT_TABS.map((tab, idx) => (
              <section
                key={tab.id}
                hidden={activeTab !== tab.id}
                className="print-panel"
              >
                <h3 className="print-heading mb-3 rounded-lg border border-[#cfe3f7] bg-[#edf6ff] px-3.5 py-2.5 text-[13px] font-semibold text-[#28639c]">
                  {idx + 1}. {tab.label}
                </h3>

                {tab.id === 'general' && (
                  <>
                    {renderReportTable([
                      ['ชื่อโครงการ', project.title],
                      ['เลขทะเบียน', project.code],
                      ['ปีงบประมาณ', `พ.ศ. ${project.year}`],
                      ['ประเภทงาน', project.type],
                      ['วิธีจัดซื้อจัดจ้าง', project.method],
                      ['แหล่งงบประมาณ', project.fund],
                      ['วงเงินงบประมาณ', formatAmountOrDash(project.budget), 'money'],
                      ['ผู้รับผิดชอบ', getResponsibleName(project)],
                      ['วันที่ขออนุมัติ', formatThaiDate(project.start)],
                      ['รายละเอียดโครงการ/รายการจัดซื้อจัดจ้าง', project.notes],
                    ])}
                    {renderCategoryFiles('general')}
                  </>
                )}

                {tab.id === 'tor' && (
                  <>
                    {renderReportTable([
                      [
                        'เลขที่คำสั่งแต่งตั้ง คกก. จัดทำ TOR/ราคากลาง',
                        details.torOrderNo,
                      ],
                      ['วันที่ออกคำสั่ง', formatThaiDate(details.torOrderDate)],
                      [
                        'วันที่จัดทำ TOR และราคากลาง',
                        formatThaiDate(getTorPreparedDate(details)),
                      ],
                      ['ราคากลาง', formatAmountOrDash(project.reference), 'money'],
                      ...(details.torNo
                        ? ([['เลขที่เอกสาร TOR เดิม', details.torNo]] as [string, string][])
                        : []),
                      ...(details.torNotes
                        ? ([
                            ['รายละเอียด TOR / ขอบเขตงาน', details.torNotes],
                          ] as [string, string][])
                        : []),
                    ])}

                    {!getTorPreparedDate(details) &&
                      details.torDate &&
                      details.referenceDate &&
                      details.torDate !== details.referenceDate && (
                        <p className="mb-3 rounded-lg border border-[#f2deb9] bg-[#fff8ed] p-3 text-xs text-[#8d672b]">
                          วันที่เดิมต่างกัน: TOR {formatThaiDate(details.torDate)} /
                          ราคากลาง {formatThaiDate(details.referenceDate)}{' '}
                          กรุณาเลือกวันที่ร่วมในหน้าแก้ไข
                        </p>
                      )}

                    {renderMembers(
                      details.torMembers || [],
                      'คณะกรรมการจัดทำ TOR และราคากลาง',
                    )}
                    {renderCategoryFiles('tor')}
                  </>
                )}

                {tab.id === 'order' && (
                  <>
                    {renderReportTable([
                      ['เลขที่ใบสั่งซื้อ / สั่งจ้าง', project.docNo],
                      ['วันที่ใบสั่งซื้อ / สั่งจ้าง', formatThaiDate(project.docDate)],
                      ['ผู้ขาย / ผู้รับจ้าง', project.vendor],
                      ['วงเงินตกลงซื้อ / จ้าง', formatAmountOrDash(project.agreed), 'money'],
                      ['กำหนดส่งมอบ', formatThaiDate(details.deliveryDue)],
                      ['รายละเอียดการสั่งซื้อ / สั่งจ้าง', details.orderNotes],
                    ])}
                    {renderCategoryFiles('order')}
                  </>
                )}

                {tab.id === 'acceptance' && (
                  <>
                    {renderReportTable([
                      ['เลขที่คำสั่งแต่งตั้ง', details.committeeNo],
                      ['วันที่ออกคำสั่ง', formatThaiDate(details.committeeDate)],
                      ...(details.acceptanceNo
                        ? ([
                            ['เลขที่เอกสารตรวจรับเดิม', details.acceptanceNo],
                          ] as [string, string][])
                        : []),
                    ])}
                    {renderMembers(acceptance.members, 'คณะกรรมการตรวจรับ')}
                    {renderCategoryFiles('acceptance')}

                    <h4 className="mt-5 mb-2.5 text-xs font-semibold text-[#47698f]">
                      ผลการตรวจรับ
                    </h4>
                    {acceptance.rounds.some((v) => v.date || v.result || v.notes) ? (
                      <div className="space-y-3">
                        {acceptance.rounds
                          .filter((v) => v.date || v.result || v.notes)
                          .map((v, i) => (
                            <div
                              key={i}
                              className="print-avoid-break rounded-xl border border-[#d8e5f2] bg-[#f7faff] p-3.5"
                            >
                              <h5 className="mb-2.5 text-xs font-semibold text-[#51769b]">
                                ครั้งที่ {i + 1} · งวดที่ {v.round}
                              </h5>
                              {renderReportTable([
                                ['วันที่ตรวจรับ', formatThaiDate(v.date)],
                                ['ผลการตรวจรับ', v.result || 'ยังไม่ระบุผล'],
                                ['รายละเอียด', v.notes],
                              ])}
                            </div>
                          ))}
                      </div>
                    ) : (
                      <p className="rounded-lg bg-[#f7fafd] p-3.5 text-xs text-[#8da0b4]">
                        ยังไม่มีผลการตรวจรับ
                      </p>
                    )}
                  </>
                )}

                {tab.id === 'voucher' && (
                  <>
                    {renderReportTable([
                      ['เลขที่ฎีกา', details.voucherNo],
                      ['วันที่ฎีกา', formatThaiDate(details.voucherDate)],
                      [
                        'จำนวนเงินตามฎีกา',
                        formatAmountOrDash(details.voucherAmount),
                        'money',
                      ],
                      ['วันที่เบิกจ่าย', formatThaiDate(details.paymentDate)],
                      ['รายละเอียดฎีกา / หมายเหตุ', details.voucherNotes],
                    ])}
                    <p className="text-[11px] text-[#8898aa]">
                      จำนวนเงินตามฎีกาแยกจากวงเงินตกลง ไม่รวมในยอดวงเงินตกลงบนแดชบอร์ด
                    </p>
                    {renderCategoryFiles('voucher')}
                  </>
                )}
              </section>
            ))}
          </div>

          <div className="no-print mx-6 border-t border-[#e4edf6] py-5">
            <details>
              <summary className="cursor-pointer text-xs font-semibold text-[#315d8f]">
                การดำเนินงานและประวัติ
              </summary>

              <div className="mt-4 space-y-5">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <StatusBadge status={project.status} />
                  <span className="rounded border border-[#dce5f0] bg-[#f1f5fa] px-2 py-0.5 text-[11px] font-medium text-[#546d87]">
                    {getStepName(state.steps, project.step)}
                  </span>
                  <span className="text-[11px] text-[#7c90a6]">
                    บัญชีกล่องงาน: {getUserName(project.assignee)} ·{' '}
                    {project.ack ? 'รับทราบแล้ว' : 'รอรับทราบ'}
                  </span>
                </div>

                <div>
                  <div className="mb-2 border-b border-[#e4edf6] pb-1.5 text-xs font-semibold text-[#3d6392]">
                    กระบวนการดำเนินงาน
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {state.steps.map((s) => (
                      <span
                        key={s.id}
                        className={`rounded-md border px-2.5 py-1 text-[11px] font-medium ${
                          project.step === s.id
                            ? 'border-[#b9d7f0] bg-[#e3efff] text-[#1762ce]'
                            : 'border-[#e4edf6] bg-[#f4f7fb] text-[#637c96]'
                        }`}
                      >
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>

                {editable && (
                  <div className="space-y-3 rounded-xl border border-[#dce8f5] bg-[#f8fbff] p-4">
                    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                      <label className="block text-[11px] font-medium text-[#526d8a]">
                        สถานะงาน
                        <select
                          value={nextStatus}
                          onChange={(e) =>
                            setNextStatus(e.target.value as ProjectStatus)
                          }
                          className="mt-1 min-h-[38px] w-full rounded-md border border-[#d6e2ef] bg-white px-2.5 py-1.5 text-xs text-[#2d445f]"
                        >
                          {STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block text-[11px] font-medium text-[#526d8a]">
                        ขั้นตอนถัดไป / ส่งกลับ
                        <select
                          value={nextStep}
                          onChange={(e) => setNextStep(e.target.value)}
                          className="mt-1 min-h-[38px] w-full rounded-md border border-[#d6e2ef] bg-white px-2.5 py-1.5 text-xs text-[#2d445f]"
                        >
                          {allowedNextSteps.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block text-[11px] font-medium text-[#526d8a]">
                        เลขที่เอกสารของขั้นตอนปัจจุบัน
                        <input
                          type="text"
                          value={stageDocNo}
                          onChange={(e) => setStageDocNo(e.target.value)}
                          className="mt-1 min-h-[38px] w-full rounded-md border border-[#d6e2ef] bg-white px-2.5 py-1.5 text-xs text-[#2d445f]"
                        />
                      </label>

                      <label className="block text-[11px] font-medium text-[#526d8a]">
                        วันที่เอกสารขั้นตอนปัจจุบัน
                        <input
                          type="date"
                          value={stageDocDate}
                          onChange={(e) => setStageDocDate(e.target.value)}
                          className="mt-1 min-h-[38px] w-full rounded-md border border-[#d6e2ef] bg-white px-2.5 py-1.5 font-mono-num text-xs text-[#2d445f]"
                        />
                      </label>

                      <label className="block text-[11px] font-medium text-[#526d8a]">
                        วันเริ่มขั้นตอน
                        <input
                          type="date"
                          value={stageStart}
                          onChange={(e) => setStageStart(e.target.value)}
                          className="mt-1 min-h-[38px] w-full rounded-md border border-[#d6e2ef] bg-white px-2.5 py-1.5 font-mono-num text-xs text-[#2d445f]"
                        />
                      </label>

                      <label className="block text-[11px] font-medium text-[#526d8a]">
                        กำหนดเสร็จขั้นตอน
                        <input
                          type="date"
                          value={stageDue}
                          onChange={(e) => setStageDue(e.target.value)}
                          className="mt-1 min-h-[38px] w-full rounded-md border border-[#d6e2ef] bg-white px-2.5 py-1.5 font-mono-num text-xs text-[#2d445f]"
                        />
                      </label>

                      <label className="block text-[11px] font-medium text-[#526d8a]">
                        วันเสร็จจริงของขั้นตอน
                        <input
                          type="date"
                          value={stageFinished}
                          onChange={(e) => setStageFinished(e.target.value)}
                          className="mt-1 min-h-[38px] w-full rounded-md border border-[#d6e2ef] bg-white px-2.5 py-1.5 font-mono-num text-xs text-[#2d445f]"
                        />
                      </label>

                      <label className="block text-[11px] font-medium text-[#526d8a]">
                        เหตุผล / บันทึกการดำเนินงาน
                        <input
                          type="text"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          className="mt-1 min-h-[38px] w-full rounded-md border border-[#d6e2ef] bg-white px-2.5 py-1.5 text-xs text-[#2d445f]"
                        />
                      </label>
                    </div>

                    <p className="text-[11px] text-[#7c90a6]">
                      เอกสารและวันที่ด้านบนบันทึกให้ขั้นตอนปัจจุบันก่อนเปลี่ยนไปขั้นตอนถัดไป
                      การส่งกลับและยกเลิกต้องระบุเหตุผล
                    </p>

                    {transitionError && (
                      <p role="alert" className="text-xs font-medium text-[#be5454]">
                        {transitionError}
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={handleTransition}
                      className="whitespace-nowrap rounded-lg bg-[#1762ce] px-4 py-2 text-xs font-medium text-white hover:bg-[#124ea8]"
                    >
                      บันทึกสถานะ / ขั้นตอน
                    </button>
                  </div>
                )}

                <div>
                  <div className="mb-2.5 border-b border-[#e4edf6] pb-1.5 text-xs font-semibold text-[#3d6392]">
                    ข้อมูลแต่ละขั้นตอนที่บันทึกไว้
                  </div>
                  {Object.keys(project.stageData || {}).length > 0 ? (
                    <div className="space-y-2.5 text-xs text-[#546d87]">
                      {Object.entries(project.stageData).map(([stepId, v]) => (
                        <div key={stepId} className="rounded-md bg-[#f8fbff] p-2.5">
                          <div className="font-semibold text-[#2c4a6b]">
                            {getStepName(state.steps, stepId)}
                          </div>
                          <div className="mt-1 text-[11px]">
                            เอกสาร {v.docNo || '—'} / {formatThaiDate(v.docDate)}
                          </div>
                          <div className="text-[11px]">
                            เริ่ม {formatThaiDate(v.start)} · กำหนด{' '}
                            {formatThaiDate(v.due)} · เสร็จจริง{' '}
                            {formatThaiDate(v.finished)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#8898aa]">
                      ยังไม่มีข้อมูลขั้นตอนเพิ่มเติม
                    </p>
                  )}
                </div>

                <div>
                  <div className="mb-2.5 border-b border-[#e4edf6] pb-1.5 text-xs font-semibold text-[#3d6392]">
                    ประวัติการดำเนินงาน
                  </div>
                  <div className="space-y-3 border-l-2 border-[#d8e5f5] pl-4">
                    {[...(project.history || [])].reverse().map((h, i) => (
                      <div key={i} className="text-xs">
                        <p className="text-[#2f455e]">{h.action}</p>
                        <small className="text-[11px] text-[#8396ac]">
                          {h.by} · {formatThaiDateTime(h.at)}
                        </small>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </details>
          </div>
        </div>

        <div className="no-print flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[#dce6f1] bg-white px-6 py-4">
          <span className="text-xs font-medium text-[#718aaa] tabular-nums">
            หมวดที่ {activeIndex + 1} จาก {PROJECT_TABS.length}
          </span>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[36px] whitespace-nowrap rounded-xl border border-[#cad7e8] bg-white px-4 py-1.5 text-xs font-semibold text-[#40516b] hover:bg-[#f6f9fd]"
            >
              ปิด
            </button>

            {user.role === 'admin' && !project.ack && (
              <button
                type="button"
                onClick={handleAcknowledge}
                className="inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#bce5d2] bg-[#eaf8f2] px-4 py-1.5 text-xs font-semibold text-[#177853] hover:bg-[#daf3e7]"
              >
                <Check className="h-3.5 w-3.5" />
                รับทราบงาน
              </button>
            )}

            {activeIndex < PROJECT_TABS.length - 1 && (
              <button
                type="button"
                onClick={() => setActiveTab(PROJECT_TABS[activeIndex + 1].id)}
                className="min-h-[36px] whitespace-nowrap rounded-xl border border-[#202d43] bg-[#202d43] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#32435e]"
              >
                ถัดไป (หมวดที่ {activeIndex + 2})
              </button>
            )}
          </div>
        </div>
      </div>

      {confirmDeleteOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="view-delete-confirm-title"
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-[#142e4a]/50 p-4"
        >
          <div className="w-full max-w-[400px] rounded-xl border border-[#dce8f5] bg-white p-5 shadow-2xl">
            <h3
              id="view-delete-confirm-title"
              className="text-sm font-bold text-[#1e3550]"
            >
              ยืนยันการลบโครงการ
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-[#546d87]">
              ต้องการลบโครงการ <b className="font-mono-num">{project.code}</b> (
              {project.title}) ออกจากระบบหรือไม่?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(false)}
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
    </div>
  );
}
