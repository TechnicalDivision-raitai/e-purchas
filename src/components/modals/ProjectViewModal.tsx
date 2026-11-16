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
  RefreshCw,
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
import { PROJECT_TABS } from '../../data/constants';
import {
  canEditProject,
  createAcceptanceDraft,
  getResponsibleName,
  getStatusUpdatedAt,
  getStepName,
  getTorPreparedDate,
} from '../../domain/procurement';
import { useProcurement } from '../../storage/useProcurementStore';
import type {
  AttachmentCategory,
  CommitteeMember,
  ProjectTabId,
} from '../../types/procurement';
import { formatThaiDate, formatThaiDateTime } from '../../utils/date';
import { formatMoney, triggerDownloadUrl } from '../../utils/format';
import { StatusBadge } from '../common/StatusBadge';
import { StatusTransitionModal } from './StatusTransitionModal';

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
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState<boolean>(false);
  const [statusModalOpen, setStatusModalOpen] = useState<boolean>(false);

  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    setActiveTab(initialTab);
    setConfirmDeleteOpen(false);
    setStatusModalOpen(false);
  }, [initialTab, projectId]);

  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (statusModalOpen) setStatusModalOpen(false);
        else if (confirmDeleteOpen) setConfirmDeleteOpen(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, confirmDeleteOpen, statusModalOpen]);

  if (!project) return null;

  const editable = canEditProject(user, project);
  const details = project.projectDetails || {};
  const acceptance = createAcceptanceDraft(details);
  const statusUpdatedAt = getStatusUpdatedAt(project);
  const activeIndex = Math.max(
    0,
    PROJECT_TABS.findIndex((t) => t.id === activeTab),
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
    const nowIso = new Date().toISOString();
    const ok = commit((draft) => {
      const target = draft.rows.find((x) => x.id === project.id);
      if (!target) throw new Error('ไม่พบโครงการ');
      if (user.role !== 'admin') throw new Error('ไม่มีสิทธิ์รับทราบ');
      target.ack = true;
      target.ackAt = nowIso;
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

  const renderReportTable = (
    rows: Array<[string, string | number | undefined | null, 'money'?]>,
  ) => (
    <div className="print-avoid-break mb-3 overflow-hidden rounded-xl border border-[#adc7e4] bg-white">
      <table className="w-full table-fixed border-collapse text-xs">
        <tbody>
          {rows.map(([label, val, kind]) => (
            <tr key={label} className="border-b border-[#d4e3f3] last:border-b-0">
              <th
                scope="row"
                className="w-[34%] border-r border-[#d4e3f3] bg-[#e9f2fc] px-3 py-2.5 text-left align-top font-semibold text-[#1e4675] break-words"
              >
                {label}
              </th>
              <td
                className={`px-3 py-2.5 align-top whitespace-pre-wrap break-words ${
                  kind === 'money'
                    ? 'font-mono-num text-[13px] font-bold text-[#0f4ca6]'
                    : 'text-[#153152]'
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
        <h4 className="mt-5 mb-2.5 text-xs font-semibold text-[#17467d]">{title}</h4>
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
          <p className="rounded-lg border border-[#d6e4f3] bg-[#f0f6fd] p-3.5 text-xs text-[#547396]">
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
        <h4 className="mt-5 mb-2.5 flex items-center gap-2 text-xs font-semibold text-[#17467d]">
          <span>เอกสารแนบ</span>
          <span className="rounded border border-[#a9c5e6] bg-[#e9f2fc] px-2 py-0.5 font-mono-num text-[11px] font-semibold text-[#164b91]">
            {files.length} ไฟล์
          </span>
        </h4>

        {files.length > 0 ? (
          <div className="space-y-2">
            {files.map((f) => (
              <div
                key={f.id}
                className="print-avoid-break flex items-center justify-between gap-2 rounded-lg border border-[#b4cde8] bg-white px-3 py-2 text-xs text-[#153152]"
              >
                <span className="flex min-w-0 items-center gap-2 truncate">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-[#185bb5]" />
                  <span className="truncate">{f.name}</span>
                  <span className="shrink-0 font-mono-num text-[11px] text-[#557191]">
                    · {(f.size / 1024).toFixed(0)} KB
                  </span>
                </span>

                {f.url ? (
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="no-print inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-[#9fc0e6] bg-[#edf4fc] px-2.5 py-1 text-[11px] font-semibold text-[#10499c] hover:bg-[#dcebfa]"
                  >
                    <ExternalLink className="h-3 w-3" />
                    เปิดไฟล์ Drive
                  </a>
                ) : f.data ? (
                  <button
                    type="button"
                    onClick={() => triggerDownloadUrl(f.data!, f.name)}
                    className="no-print inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-[#9fc0e6] bg-[#edf4fc] px-2.5 py-1 text-[11px] font-semibold text-[#10499c] hover:bg-[#dcebfa]"
                  >
                    <Download className="h-3 w-3" />
                    ดาวน์โหลด
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-[#d6e4f3] bg-[#f0f6fd] p-3.5 text-xs text-[#547396]">
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
      className="print-only-expand fixed inset-0 z-40 flex items-center justify-center bg-[#061830]/75 p-3 backdrop-blur-[2px] sm:p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="print-only-expand flex max-h-[92dvh] w-full max-w-[1100px] flex-col overflow-hidden rounded-[17px] border border-[#2b6cb5] bg-white shadow-2xl">
        <div className="no-print flex shrink-0 flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-[#092954] via-[#0f448a] to-[#1666ba] px-6 py-5 text-white">
          <div className="min-w-0 flex-1">
            <h2
              id="view-modal-title"
              className="text-base font-bold leading-snug break-words sm:text-lg"
            >
              {project.title}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[#b8dcff] tabular-nums">
              <span>
                เลขทะเบียน {project.code} | ปีงบประมาณ พ.ศ. {project.year} | ขั้นตอน:{' '}
                {getStepName(state.steps, project.step)}
              </span>
              <StatusBadge status={project.status} />
              {statusUpdatedAt && (
                <span className="rounded border border-white/25 bg-white/10 px-2 py-0.5 text-[11px] text-[#dceeff]">
                  อัปเดตล่าสุด {formatThaiDateTime(statusUpdatedAt)}
                </span>
              )}
            </div>
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
                  onClick={() => setStatusModalOpen(true)}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#34d399]/50 bg-[#0d9468] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#0a7a55]"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  เปลี่ยนสถานะ
                </button>
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
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/25 bg-[#b82828]/85 px-3 py-1.5 text-xs font-medium text-white hover:bg-[#a61f1f]"
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
          className="no-print flex shrink-0 gap-1.5 overflow-x-auto border-b border-[#b8d0eb] bg-[#dceafa] px-4 py-2.5"
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
                    ? 'border-[#8cb5e4] bg-white text-[#0f489e] shadow-xs'
                    : 'border-transparent bg-transparent text-[#2d5380] hover:border-[#a7c6e8] hover:bg-[#cde0f7]'
                }`}
              >
                <Icon
                  className={`h-3.5 w-3.5 shrink-0 ${
                    selected ? 'text-[#1360c2]' : 'text-[#4472a6]'
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
            <div className="mb-5 border-b-2 border-[#0f3463] pb-5 text-center">
              <p className="mb-2 text-xs text-[#4b6a8e]">
                รายละเอียดและติดตามงานจัดซื้อจัดจ้าง · กองช่าง อบต.ไร่ใต้
              </p>
              <h2 className="mb-2 text-xl font-bold leading-snug text-[#0f2a4a] break-words sm:text-[22px]">
                {project.title}
              </h2>
              <div className="text-xs text-[#3b5d85] tabular-nums">
                เลขทะเบียน {project.code} <span className="mx-2 text-[#8ba6c4]">·</span>{' '}
                ปีงบประมาณ พ.ศ. {project.year}
              </div>
            </div>

            {PROJECT_TABS.map((tab, idx) => (
              <section
                key={tab.id}
                hidden={activeTab !== tab.id}
                className="print-panel"
              >
                <h3 className="print-heading mb-3 rounded-lg border border-[#a5c5ea] bg-[#dfecfa] px-3.5 py-2.5 text-[13px] font-semibold text-[#113d75]">
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
        </div>

        <div className="no-print flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[#bdd3ec] bg-[#eef5fd] px-6 py-4">
          <span className="text-xs font-semibold text-[#2d5380] tabular-nums">
            หมวดที่ {activeIndex + 1} จาก {PROJECT_TABS.length}
          </span>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[36px] whitespace-nowrap rounded-xl border border-[#9fc0e6] bg-white px-4 py-1.5 text-xs font-semibold text-[#1b416e] hover:bg-[#dfecfc]"
            >
              ปิด
            </button>

            {user.role === 'admin' && !project.ack && (
              <button
                type="button"
                onClick={handleAcknowledge}
                className="inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#9cd8bd] bg-[#dff5eb] px-4 py-1.5 text-xs font-semibold text-[#116947] hover:bg-[#cdeedf]"
              >
                <Check className="h-3.5 w-3.5" />
                รับทราบงาน
              </button>
            )}

            {activeIndex < PROJECT_TABS.length - 1 && (
              <button
                type="button"
                onClick={() => setActiveTab(PROJECT_TABS[activeIndex + 1].id)}
                className="min-h-[36px] whitespace-nowrap rounded-xl border border-[#0f3463] bg-[#0f3463] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#174888]"
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
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-[#061830]/75 p-4"
        >
          <div className="w-full max-w-[400px] rounded-xl border border-[#9fc0e6] bg-white p-5 shadow-2xl">
            <h3
              id="view-delete-confirm-title"
              className="text-sm font-bold text-[#0f2a4a]"
            >
              ยืนยันการลบโครงการ
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-[#365375]">
              ต้องการลบโครงการ <b className="font-mono-num">{project.code}</b> (
              {project.title}) ออกจากระบบหรือไม่?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(false)}
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
      <StatusTransitionModal
        project={statusModalOpen ? project : null}
        onClose={() => setStatusModalOpen(false)}
      />
    </div>
  );
}
