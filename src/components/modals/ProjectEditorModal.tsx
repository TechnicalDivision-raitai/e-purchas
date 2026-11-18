import {
  Ban,
  CheckCircle2,
  CheckSquare,
  Clock,
  FileText,
  FolderKanban,
  PackageCheck,
  Save,
  ShoppingCart,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {
  ACCEPTANCE_RESULTS,
  COMMITTEE_ROLES,
  DEFAULT_DEPARTMENT,
  MAX_PROJECT_ATTACHMENT_BYTES,
  PROJECT_TABS,
  PROJECT_TYPES,
  STATUSES,
} from '../../data/constants';
import {
  cleanAcceptanceRounds,
  cleanCancelledRounds,
  cleanCommitteeMembers,
  cleanDeliveryRounds,
  cleanInstallmentCount,
  cleanVoucherEntries,
  createAcceptanceDraft,
  createVoucherDraft,
  deriveProgressFromTabs,
  getAttachmentMeta,
  getInstallmentSummary,
  getResponsibleName,
  getTorPreparedDate,
  validateProject,
} from '../../domain/procurement';
import {
  isGoogleSyncConfigured,
  uploadFileToGoogleDrive,
} from '../../services/googleSync';
import { useProcurement } from '../../storage/useProcurementStore';
import type {
  AcceptanceRound,
  AttachmentCategory,
  AttachmentFile,
  CommitteeMember,
  DeliveryRound,
  ProjectDetails,
  ProjectRecord,
  ProjectStatus,
  ProjectTabId,
  ProjectType,
  VoucherEntry,
} from '../../types/procurement';
import {
  formatThaiDate,
  getFiscalYearOptions,
  isValidIsoDate,
  todayBangkok,
  uid,
} from '../../utils/date';
import { formatMoney } from '../../utils/format';
import {
  AutoSuggestInput,
  collectNormalizedSuggestions,
} from '../common/AutoSuggestInput';

interface ProjectEditorModalProps {
  projectId: string | null;
  initialTab?: ProjectTabId;
  onClose: () => void;
}

const TAB_ICONS: Record<ProjectTabId, typeof FolderKanban> = {
  general: FolderKanban,
  tor: Users,
  order: ShoppingCart,
  acceptance: CheckSquare,
  voucher: Clock,
};

interface DraftState {
  year: number;
  code: string;
  type: ProjectType;
  title: string;
  method: string;
  fund: string;
  budget: string;
  reference: string;
  agreed: string;
  responsibleName: string;
  start: string;
  notes: string;
  docNo: string;
  docDate: string;
  vendor: string;
  details: ProjectDetails;
  torMembers: CommitteeMember[];
  acceptanceMembers: CommitteeMember[];
  deliveryRounds: DeliveryRound[];
  acceptanceRounds: AcceptanceRound[];
  voucherEntries: VoucherEntry[];
  files: AttachmentFile[];
  statusMode: 'auto' | 'manual';
  manualStatus: ProjectStatus;
}

function createDraftFromRecord(old: ProjectRecord | undefined): DraftState {
  const details = old?.projectDetails || {};
  const acceptance = createAcceptanceDraft(details);
  const vouchers = createVoucherDraft(details);
  const torMembers: CommitteeMember[] = structuredClone(
    details.torMembers ?? [{ name: '', position: '', role: 'ประธานกรรมการ' }],
  );

  return {
    year: old ? old.year : 2570,
    code: old ? old.code : '',
    type: old ? old.type : 'ซื้อ',
    title: old ? old.title : '',
    method: old ? old.method : 'เฉพาะเจาะจง',
    fund: old ? old.fund : '',
    budget: old ? String(old.budget ?? 0) : '0',
    reference: old ? String(old.reference ?? 0) : '0',
    agreed: old ? String(old.agreed ?? 0) : '0',
    responsibleName: old ? getResponsibleName(old) : '',
    start: old ? old.start : todayBangkok(),
    notes: old ? old.notes : '',
    docNo: old ? old.docNo : '',
    docDate: old ? old.docDate : '',
    vendor: old ? old.vendor : '',
    details: {
      ...details,
      torPreparedDate: getTorPreparedDate(details),
    },
    torMembers,
    acceptanceMembers: acceptance.members,
    deliveryRounds: acceptance.deliveries,
    acceptanceRounds: acceptance.rounds,
    voucherEntries: vouchers,
    files: structuredClone(old?.files || []),
    statusMode:
      old?.manualStatusOverride ||
      old?.status === 'พักงาน' ||
      old?.status === 'ยกเลิก'
        ? 'manual'
        : 'auto',
    manualStatus: old?.status || 'รอจัดทำTOR และราคากลาง',
  };
}

export function ProjectEditorModal({
  projectId,
  initialTab = 'general',
  onClose,
}: ProjectEditorModalProps) {
  const { state, user, commit, appendHistory, showToast } = useProcurement();
  const isNew = projectId === 'new';
  const existing = useMemo(
    () => (isNew || !projectId ? undefined : state.rows.find((r) => r.id === projectId)),
    [isNew, projectId, state.rows],
  );

  const [activeTab, setActiveTab] = useState<ProjectTabId>(initialTab);
  const [draft, setDraft] = useState<DraftState>(() => createDraftFromRecord(existing));
  const [formError, setFormError] = useState<string>('');
  const [uploadErrors, setUploadErrors] = useState<Record<AttachmentCategory, string>>({
    general: '',
    tor: '',
    order: '',
    acceptance: '',
    voucher: '',
  });
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [showCancelPanel, setShowCancelPanel] = useState<boolean>(false);

  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const panelContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
    setDraft(createDraftFromRecord(existing));
    setFormError('');
    setUploadErrors({ general: '', tor: '', order: '', acceptance: '', voucher: '' });
    setShowCancelPanel(
      Boolean(existing?.projectDetails?.cancelledRounds?.length),
    );
  }, [projectId, initialTab, existing]);

  const activeIndex = Math.max(
    0,
    PROJECT_TABS.findIndex((t) => t.id === activeTab),
  );

  const installmentSummary = useMemo(
    () =>
      getInstallmentSummary({
        ...draft.details,
        voucherEntries: draft.voucherEntries,
      }),
    [draft.details, draft.voucherEntries],
  );

  const autoProgressPreview = useMemo(
    () =>
      deriveProgressFromTabs(
        {
          reference: Number(draft.reference) || 0,
          agreed: Number(draft.agreed) || 0,
          docNo: draft.docNo,
          docDate: draft.docDate,
          vendor: draft.vendor,
          due: draft.details.deliveryDue || existing?.due || '',
          projectDetails: {
            ...draft.details,
            torMembers: draft.torMembers,
            acceptanceMembers: draft.acceptanceMembers,
            deliveryRounds: draft.deliveryRounds,
            acceptanceRounds: draft.acceptanceRounds,
            voucherEntries: draft.voucherEntries,
          },
          files: draft.files,
          status: existing?.status || 'รอจัดทำTOR และราคากลาง',
        },
        true,
      ),
    [draft, existing],
  );

  const suggestionPools = useMemo(() => {
    const people: string[] = [];
    const positions: string[] = [];
    const vendors: string[] = [];
    const funds: string[] = [];
    const methods: string[] = [];

    for (const r of state.rows) {
      if (r.responsibleName) people.push(r.responsibleName);
      if (r.vendor) vendors.push(r.vendor);
      if (r.fund) funds.push(r.fund);
      if (r.method) methods.push(r.method);
      for (const m of r.projectDetails?.torMembers || []) {
        if (m.name) people.push(m.name);
        if (m.position) positions.push(m.position);
      }
      for (const m of r.projectDetails?.acceptanceMembers || []) {
        if (m.name) people.push(m.name);
        if (m.position) positions.push(m.position);
      }
    }

    for (const m of draft.torMembers) {
      if (m.name) people.push(m.name);
      if (m.position) positions.push(m.position);
    }
    for (const m of draft.acceptanceMembers) {
      if (m.name) people.push(m.name);
      if (m.position) positions.push(m.position);
    }

    return {
      people: collectNormalizedSuggestions(people),
      positions: collectNormalizedSuggestions(positions),
      vendors: collectNormalizedSuggestions(vendors),
      funds: collectNormalizedSuggestions(funds),
      methods: collectNormalizedSuggestions(methods),
    };
  }, [state.rows, draft.torMembers, draft.acceptanceMembers]);

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

  const updateDetail = <K extends keyof ProjectDetails>(
    key: K,
    value: ProjectDetails[K],
  ) => {
    setDraft((prev) => ({
      ...prev,
      details: { ...prev.details, [key]: value },
    }));
  };

  const handleAddFiles = async (
    e: ChangeEvent<HTMLInputElement>,
    category: AttachmentCategory,
  ) => {
    const fileList = e.target.files;
    if (!fileList?.length) return;

    setUploadErrors((prev) => ({ ...prev, [category]: '' }));
    if (category === 'general') setFormError('');
    setIsUploading(true);

    try {
      const driveEnabled = isGoogleSyncConfigured();
      const pending = await Promise.all(
        [...fileList].map(async (file): Promise<AttachmentFile> => {
          const meta = getAttachmentMeta(file, category);
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
            reader.readAsDataURL(file);
          });

          if (driveEnabled) {
            try {
              const base64Only = dataUrl.split(',')[1] || '';
              const driveResult = await uploadFileToGoogleDrive(
                file,
                base64Only,
                category,
                draft.code || 'draft',
              );
              if (driveResult?.url) {
                return {
                  ...meta,
                  id: uid(),
                  category,
                  url: driveResult.url,
                  driveFileId: driveResult.driveFileId,
                };
              }
            } catch {
              // Fallback cleanly to local Base64 storage if Drive upload fails
            }
          }

          return { ...meta, id: uid(), category, data: dataUrl };
        }),
      );

      const localFiles = [...draft.files, ...pending].filter((f) => Boolean(f.data));
      const totalLocalSize = localFiles.reduce((sum, f) => sum + f.size, 0);
      if (totalLocalSize > MAX_PROJECT_ATTACHMENT_BYTES * 5) {
        throw new Error('ไฟล์แนบรวมทุกหมวดต้องไม่เกิน 250 MB ต่อโครงการ');
      }

      setDraft((prev) => ({ ...prev, files: [...prev.files, ...pending] }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (category === 'general') {
        setFormError(msg);
      } else {
        setUploadErrors((prev) => ({ ...prev, [category]: msg }));
      }
    } finally {
      e.target.value = '';
      setIsUploading(false);
    }
  };

  const handleRemoveFile = (fileId: string) => {
    setDraft((prev) => ({
      ...prev,
      files: prev.files.filter((f) => f.id !== fileId),
    }));
  };

  const handleSave = (e?: FormEvent) => {
    if (e) e.preventDefault();
    setFormError('');

    const formEl = panelContainerRef.current?.closest('form');
    if (formEl && !formEl.reportValidity()) {
      const invalidEl = formEl.querySelector(':invalid');
      const panelEl = invalidEl?.closest('[data-project-panel]');
      const panelId = panelEl?.getAttribute('data-project-panel') as ProjectTabId | null;
      if (panelId) setActiveTab(panelId);
      return;
    }

    try {
      const cleanedTorMembers = cleanCommitteeMembers(draft.torMembers);
      const cleanedAcceptanceMembers = cleanCommitteeMembers(draft.acceptanceMembers);
      const cleanedDeliveries = cleanDeliveryRounds(draft.deliveryRounds);
      const cleanedRounds = cleanAcceptanceRounds(draft.acceptanceRounds);
      const cleanedVouchers = cleanVoucherEntries(draft.voucherEntries);
      const cleanedInstallmentCount = cleanInstallmentCount(draft.details.installmentCount);
      const cleanedCancelledRounds = cleanCancelledRounds(
        draft.details.cancelledRounds,
        cleanedInstallmentCount,
      );
      const cleanedCancelReason = String(
        draft.details.installmentCancelReason || '',
      ).trim();

      const latestVoucher = cleanedVouchers[cleanedVouchers.length - 1];
      const hasAnyVoucherAmount = cleanedVouchers.some(
        (v) => v.voucherAmount !== '' && v.voucherAmount != null,
      );
      const totalVoucherAmount = hasAnyVoucherAmount
        ? cleanedVouchers.reduce((sum, v) => sum + (Number(v.voucherAmount) || 0), 0)
        : ('' as const);
      const allVouchersPaid =
        cleanedVouchers.length > 0 &&
        cleanedVouchers.every((v) => Boolean(v.paymentDate));

      const details: ProjectDetails = {
        ...draft.details,
        installmentCount: cleanedInstallmentCount,
        cancelledRounds: cleanedCancelledRounds,
        installmentCancelReason: cleanedCancelReason,
        torMembers: cleanedTorMembers,
        acceptanceMembers: cleanedAcceptanceMembers,
        deliveryRounds: cleanedDeliveries,
        acceptanceRounds: cleanedRounds,
        voucherEntries: cleanedVouchers,
        voucherNo: cleanedVouchers
          .map((v) => v.voucherNo)
          .filter(Boolean)
          .join(', '),
        voucherDate: latestVoucher?.voucherDate || '',
        voucherAmount: totalVoucherAmount,
        paymentDate: allVouchersPaid ? latestVoucher?.paymentDate || '' : '',
        voucherNotes: latestVoucher?.voucherNotes || '',
      };

      const dateFields: Array<keyof ProjectDetails> = [
        'torPreparedDate',
        'torOrderDate',
        'torDate',
        'referenceDate',
        'deliveryDue',
        'committeeDate',
        'acceptanceDate',
        'voucherDate',
        'paymentDate',
      ];
      for (const k of dateFields) {
        const val = details[k];
        if (val && !isValidIsoDate(val)) {
          setFormError('วันที่ในข้อมูลเพิ่มเติมไม่ถูกต้อง');
          return;
        }
      }

      if (details.voucherAmount !== '' && details.voucherAmount != null) {
        const vAmt = Number(details.voucherAmount);
        if (!Number.isFinite(vAmt) || vAmt < 0) {
          setFormError('จำนวนเงินตามฎีกาไม่ถูกต้อง');
          return;
        }
        details.voucherAmount = vAmt;
      }

      const assignee = existing ? existing.assignee : user.id;
      const department = existing?.department || DEFAULT_DEPARTMENT;

      const baseRecord: ProjectRecord = {
        id: existing ? existing.id : '',
        year: Number(draft.year) || 2570,
        code: draft.code.trim(),
        type: draft.type,
        title: draft.title.trim(),
        method: draft.method.trim(),
        fund: draft.fund.trim(),
        budget: Number(draft.budget) || 0,
        reference: Number(draft.reference) || 0,
        agreed: Number(draft.agreed) || 0,
        responsibleName: draft.responsibleName.trim(),
        assignee,
        department,
        start: draft.start,
        due: details.deliveryDue || existing?.due || '',
        docNo: draft.docNo.trim(),
        docDate: draft.docDate,
        vendor: draft.vendor.trim(),
        notes: draft.notes,
        status: existing?.status || 'รอจัดทำTOR และราคากลาง',
        step: existing?.step || state.steps[0]?.id || 's1',
        ack: existing?.ack ?? false,
        stageData: existing?.stageData || {},
        history: existing?.history || [],
        projectDetails: details,
        files: draft.files,
      };

      const autoProgress = deriveProgressFromTabs(baseRecord, true);
      const finalStatus: ProjectStatus =
        draft.statusMode === 'manual' ? draft.manualStatus : autoProgress.status;
      const nowIso = new Date().toISOString();
      const statusChanged = !existing || existing.status !== finalStatus;

      const value: ProjectRecord = {
        ...baseRecord,
        step: autoProgress.step,
        status: finalStatus,
        due: autoProgress.due,
        ackAt: existing?.ackAt,
        manualStatusOverride: draft.statusMode === 'manual',
        statusUpdatedAt:
          statusChanged ||
          !existing?.statusUpdatedAt ||
          (draft.statusMode === 'manual' && !existing?.manualStatusOverride)
            ? nowIso
            : existing.statusUpdatedAt,
      };

      const errors = validateProject(
        { ...value, due: '' },
        state.rows,
        existing?.id || '',
      );
      if (errors.length) {
        setFormError(errors.join('\n'));
        return;
      }

      const saved = commit((nextState) => {
        if (existing) {
          const current = nextState.rows.find((x) => x.id === existing.id);
          if (!current) throw new Error('ไม่พบโครงการ');
          const before = structuredClone(current);
          Object.assign(current, value);
          if (before.assignee !== current.assignee) {
            current.ack = false;
            current.ackAt = undefined;
          }
          const changedKeys = (
            [
              'year',
              'code',
              'type',
              'title',
              'method',
              'fund',
              'budget',
              'reference',
              'agreed',
              'responsibleName',
              'start',
              'notes',
              'docNo',
              'docDate',
              'vendor',
              'status',
            ] as const
          ).filter((k) => String(before[k]) !== String(value[k]));
          const detailsChanged =
            JSON.stringify(before.projectDetails || {}) !==
            JSON.stringify(value.projectDetails);
          const filesChanged =
            JSON.stringify(before.files) !== JSON.stringify(value.files);

          appendHistory(
            current,
            `แก้ไขข้อมูล: ${changedKeys.join(', ')}${
              detailsChanged ? ' / ข้อมูล TOR สั่งซื้อ ตรวจรับ หรือฎีกา' : ''
            }${filesChanged ? ' / ไฟล์แนบ' : ''}`,
          );
        } else {
          const row: ProjectRecord = {
            ...value,
            id: uid(),
            ack: false,
            ackAt: undefined,
            stageData: {},
            history: [],
          };
          appendHistory(row, 'สร้างโครงการ');
          nextState.rows.push(row);
        }
      });

      if (saved) {
        showToast('บันทึกโครงการแล้ว');
        onClose();
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    }
  };

  const renderMemberSection = (kind: 'tor' | 'acceptance') => {
    const members = kind === 'tor' ? draft.torMembers : draft.acceptanceMembers;
    const setMembers = (updater: (list: CommitteeMember[]) => CommitteeMember[]) => {
      setDraft((prev) =>
        kind === 'tor'
          ? { ...prev, torMembers: updater(prev.torMembers) }
          : { ...prev, acceptanceMembers: updater(prev.acceptanceMembers) },
      );
    };

    const addMember = () => {
      if (members.length >= 30) return;
      setMembers((list) => [
        ...list,
        {
          name: '',
          position: '',
          role: list.length ? 'กรรมการ' : 'ประธานกรรมการ',
        },
      ]);
    };

    return (
      <div className="col-span-full mt-1">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold text-[#17406e]">
            {kind === 'tor'
              ? 'คณะกรรมการจัดทำ TOR และราคากลาง'
              : 'รายชื่อคณะกรรมการตรวจรับ'}{' '}
            <span className="font-mono-num text-[#3d6591]">({members.length} คน)</span>
          </h4>
          <button
            type="button"
            disabled={members.length >= 30}
            onClick={addMember}
            className="whitespace-nowrap text-xs font-semibold text-[#0f58ad] hover:underline disabled:opacity-45"
          >
            {kind === 'tor' ? '＋ เพิ่มกรรมการ' : '＋ เพิ่มกรรมการตรวจรับ'}
          </button>
        </div>

        <div className="space-y-2.5">
          {members.length === 0 ? (
            <p className="text-[11px] text-[#5c7899]">
              ยังไม่มีรายชื่อกรรมการ กด “เพิ่มกรรมการ” เพื่อเพิ่ม
            </p>
          ) : (
            members.map((m, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 items-center gap-2 rounded-xl border border-[#b4cde8] bg-[#edf4fc] p-3 md:grid-cols-[20px_minmax(0,1fr)_minmax(0,1fr)_175px_30px]"
              >
                <span className="font-mono-num text-[11px] font-semibold text-[#3d6591]">
                  {idx + 1}
                </span>

                <AutoSuggestInput
                  value={m.name}
                  maxLength={200}
                  placeholder="ชื่อ–นามสกุล…"
                  aria-label={`ชื่อกรรมการคนที่ ${idx + 1}`}
                  suggestions={suggestionPools.people}
                  onChangeValue={(nextVal) =>
                    setMembers((list) =>
                      list.map((item, i) =>
                        i === idx ? { ...item, name: nextVal } : item,
                      ),
                    )
                  }
                  className="min-h-[34px] w-full rounded-md border border-[#a8c4e4] bg-white px-2.5 py-1.5 text-xs text-[#132d4c]"
                />

                <AutoSuggestInput
                  value={m.position}
                  maxLength={200}
                  placeholder="ตำแหน่งราชการ…"
                  aria-label={`ตำแหน่งกรรมการคนที่ ${idx + 1}`}
                  suggestions={suggestionPools.positions}
                  onChangeValue={(nextVal) =>
                    setMembers((list) =>
                      list.map((item, i) =>
                        i === idx ? { ...item, position: nextVal } : item,
                      ),
                    )
                  }
                  className="min-h-[34px] w-full rounded-md border border-[#a8c4e4] bg-white px-2.5 py-1.5 text-xs text-[#132d4c]"
                />

                <select
                  value={m.role}
                  aria-label={`หน้าที่กรรมการคนที่ ${idx + 1}`}
                  onChange={(e) =>
                    setMembers((list) =>
                      list.map((item, i) =>
                        i === idx
                          ? { ...item, role: e.target.value as CommitteeMember['role'] }
                          : item,
                      ),
                    )
                  }
                  className="min-h-[34px] w-full rounded-md border border-[#a8c4e4] bg-white px-2.5 py-1.5 text-xs text-[#132d4c]"
                >
                  {COMMITTEE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label={`ลบกรรมการคนที่ ${idx + 1}`}
                  title="ลบกรรมการ"
                  onClick={() =>
                    setMembers((list) => list.filter((_, i) => i !== idx))
                  }
                  className="grid h-7 w-7 place-items-center rounded-md text-[#54759b] hover:bg-[#ffeaea] hover:text-[#a82c2c]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const renderCategoryUpload = (category: AttachmentCategory, label: string) => {
    const files = draft.files.filter((f) => (f.category || 'general') === category);
    const inputId = `${category}AttachmentsInput`;

    return (
      <div className="col-span-full border-b border-[#cfe0f2] pt-1 pb-4">
        <label
          htmlFor={inputId}
          className="block text-[11.5px] font-semibold text-[#1d4069]"
        >
          {label}
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label
            htmlFor={inputId}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#9fc0e6] bg-[#e6f0fc] px-3 py-1.5 text-xs font-semibold text-[#154b94] hover:bg-[#d6e7fa]"
          >
            <Upload className="h-3.5 w-3.5" />
            {isUploading ? 'กำลังอัปโหลด…' : 'เลือกไฟล์แนบ…'}
          </label>
          <input
            id={inputId}
            type="file"
            multiple
            disabled={isUploading}
            accept=".pdf,.xlsx,.xls,.docx,.doc,.png,.jpg,.jpeg,.zip,.rar"
            onChange={(e) => handleAddFiles(e, category)}
            className="sr-only"
          />
          <span className="text-xs text-[#4b6a8d] tabular-nums">
            {files.length} ไฟล์แนบในหมวดนี้
          </span>
        </div>
        <p className="mt-1.5 text-[10.5px] text-[#5c7899]">
          {isGoogleSyncConfigured()
            ? 'รองรับไฟล์ขนาดใหญ่สูงสุด 50 MB ต่อไฟล์ (อัปโหลดไปยัง Google Drive หรือจัดเก็บในฐานข้อมูลเบราว์เซอร์อัตโนมัติ)'
            : 'รองรับไฟล์ขนาดใหญ่สูงสุด 50 MB ต่อไฟล์ · แนบได้หลายไฟล์ต่อหมวด'}
        </p>

        {files.length > 0 && (
          <div className="mt-2.5 space-y-1.5">
            {files.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between gap-2 rounded-md border border-[#b4cde8] bg-white px-3 py-2 text-xs text-[#153152]"
              >
                <span className="flex min-w-0 items-center gap-2 truncate">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-[#185bb5]" />
                  <span className="truncate">{f.name}</span>
                  <span className="shrink-0 font-mono-num text-[11px] text-[#557191]">
                    ·{' '}
                    {f.size >= 1024 * 1024
                      ? `${(f.size / (1024 * 1024)).toFixed(1)} MB`
                      : `${Math.max(1, Math.round(f.size / 1024))} KB`}
                  </span>
                  {f.url && (
                    <span className="shrink-0 rounded border border-[#9cd8bd] bg-[#dff5eb] px-1.5 py-0.5 text-[10px] font-semibold text-[#116947]">
                      Drive
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveFile(f.id)}
                  className="shrink-0 rounded border border-[#edb8b8] px-2 py-0.5 text-[11px] font-medium text-[#a82c2c] hover:bg-[#ffebeb]"
                >
                  นำออก
                </button>
              </div>
            ))}
          </div>
        )}

        {uploadErrors[category] && (
          <p role="alert" className="mt-2 text-xs text-[#b52c2c]">
            {uploadErrors[category]}
          </p>
        )}
      </div>
    );
  };

  const toggleCancelledRound = (round: number) => {
    setDraft((prev) => {
      const current = new Set(prev.details.cancelledRounds || []);
      if (current.has(round)) current.delete(round);
      else current.add(round);
      return {
        ...prev,
        details: {
          ...prev.details,
          cancelledRounds: [...current].sort((a, b) => a - b),
        },
      };
    });
  };

  const handleCancelRemainingInstallments = (andCloseProject: boolean) => {
    const maxN = installmentSummary.installmentCount;
    if (maxN < 1) return;

    const nonEmptyVoucherRounds = new Set(
      draft.voucherEntries
        .filter(
          (v) =>
            v.voucherNo.trim() ||
            v.voucherDate ||
            v.voucherAmount !== '' ||
            v.paymentDate ||
            v.voucherNotes.trim(),
        )
        .map((v) => v.round),
    );

    const remainingToCancel = Array.from({ length: maxN }, (_, i) => i + 1).filter(
      (r) => !nonEmptyVoucherRounds.has(r),
    );
    const nextCancelled = [
      ...new Set([...(draft.details.cancelledRounds || []), ...remainingToCancel]),
    ].sort((a, b) => a - b);
    const nextCancelledSet = new Set(nextCancelled);
    const nextActiveRounds = Array.from({ length: maxN }, (_, i) => i + 1).filter(
      (r) => !nextCancelledSet.has(r),
    );
    const allActivePaid =
      nextActiveRounds.length > 0 &&
      nextActiveRounds.every((r) =>
        draft.voucherEntries.some((v) => v.round === r && Boolean(v.paymentDate)),
      );

    setDraft((prev) => ({
      ...prev,
      details: {
        ...prev.details,
        cancelledRounds: nextCancelled,
      },
      statusMode: andCloseProject
        ? allActivePaid
          ? 'auto'
          : 'manual'
        : prev.statusMode,
      manualStatus: andCloseProject
        ? nextActiveRounds.length > 0
          ? 'เสร็จสิ้น'
          : 'ยกเลิก'
        : prev.manualStatus,
    }));

    setShowCancelPanel(true);

    if (andCloseProject) {
      showToast(
        nextActiveRounds.length > 0
          ? 'ยกเลิกงวดงานที่เหลือและปรับสถานะเป็น “เสร็จสิ้น” แล้ว (กดบันทึกเพื่อยืนยัน)'
          : 'ยกเลิกงวดงานทั้งหมดและปรับสถานะเป็น “ยกเลิก” แล้ว (กดบันทึกเพื่อยืนยัน)',
      );
    } else if (remainingToCancel.length > 0) {
      showToast(`ยกเลิกงวดงานที่เหลือ (${remainingToCancel.length} งวด) แล้ว`);
    }
  };

  const renderInstallmentCancelPanel = () => {
    const maxN = installmentSummary.installmentCount;
    if (maxN < 1 || !showCancelPanel) return null;

    const allRounds = Array.from({ length: maxN }, (_, i) => i + 1);
    const cancelledSet = new Set(installmentSummary.cancelledRounds);
    const nonEmptyVoucherRounds = new Set(
      installmentSummary.voucherEntries.map((v) => v.round),
    );
    const paidVoucherRounds = new Set(
      installmentSummary.voucherEntries
        .filter((v) => Boolean(v.paymentDate))
        .map((v) => v.round),
    );
    const remainingUnvouchered = allRounds.filter(
      (r) => !cancelledSet.has(r) && !nonEmptyVoucherRounds.has(r),
    );

    return (
      <div className="col-span-full rounded-2xl border border-[#e3b8b8] bg-[#fff7f7] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="flex items-center gap-2 text-xs font-semibold text-[#8c2323]">
              <Ban className="h-4 w-4 text-[#b82828]" />
              จัดการยกเลิกงวดงานที่เหลือ / ปิดจบโครงการกรณีส่งมอบไม่ครบ
            </h4>
            <p className="mt-0.5 text-[11px] text-[#7a4b4b]">
              คลิกที่งวดเพื่อยกเลิกหรือคืนค่างวด (เช่น กรณียกเลิกสัญญา) ระบบจะคำนวณเฉพาะงวดที่เหลืออยู่
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCancelPanel(false)}
            className="rounded-md border border-[#e3b8b8] bg-white px-2.5 py-1 text-[11px] font-medium text-[#7a3333] hover:bg-[#ffebeb]"
          >
            ซ่อน
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {allRounds.map((r) => {
            const isCancelled = cancelledSet.has(r);
            const isPaid = paidVoucherRounds.has(r);
            const hasVoucher = nonEmptyVoucherRounds.has(r);
            return (
              <button
                key={r}
                type="button"
                onClick={() => toggleCancelledRound(r)}
                className={`rounded-lg border px-2.5 py-1.5 font-mono-num text-[11px] font-semibold transition ${
                  isCancelled
                    ? 'border-[#e49e9e] bg-[#ffe4e4] text-[#9b2222] line-through'
                    : isPaid
                      ? 'border-[#9cd8bd] bg-[#dff5eb] text-[#116947] hover:bg-[#cdeedf]'
                      : hasVoucher
                        ? 'border-[#9fc0e6] bg-[#e9f2fc] text-[#0f4ca6] hover:bg-[#dcebfa]'
                        : 'border-[#c4d5e8] bg-white text-[#2b4d75] hover:border-[#e3a3a3] hover:bg-[#fff0f0]'
                }`}
                title={
                  isCancelled
                    ? 'คลิกเพื่อคืนค่างวดนี้'
                    : 'คลิกเพื่อยกเลิกงวดนี้'
                }
              >
                งวดที่ {r}
                {isCancelled ? ' (ยกเลิก)' : isPaid ? ' ✓' : hasVoucher ? ' · รอเบิก' : ''}
              </button>
            );
          })}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          {remainingUnvouchered.length > 0 && (
            <button
              type="button"
              onClick={() => handleCancelRemainingInstallments(false)}
              className="rounded-lg border border-[#d98c8c] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#9c2323] hover:bg-[#ffebeb]"
            >
              ยกเลิกงวดที่ยังไม่ทำฎีกาทั้งหมด ({remainingUnvouchered.length} งวด)
            </button>
          )}

          <button
            type="button"
            onClick={() => handleCancelRemainingInstallments(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0d825b] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#096747]"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            ยกเลิกงวดที่เหลือและปิดจบโครงการ
          </button>

          {installmentSummary.cancelledRounds.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setDraft((prev) => ({
                  ...prev,
                  details: {
                    ...prev.details,
                    cancelledRounds: [],
                    installmentCancelReason: '',
                  },
                  statusMode: 'auto',
                }))
              }
              className="rounded-lg border border-[#b4cde8] bg-white px-3 py-1.5 text-[11px] font-medium text-[#2b5280] hover:bg-[#edf4fc]"
            >
              คืนค่างวดที่ยกเลิกทั้งหมด
            </button>
          )}
        </div>

        <label className="block text-[11px] font-semibold text-[#6e3030]">
          เหตุผลการยกเลิกงวดงาน / ยกเลิกสัญญา
          <input
            type="text"
            maxLength={500}
            placeholder="เช่น ยกเลิกสัญญาตั้งแต่งวดที่ … เนื่องจากผู้รับจ้างไม่สามารถส่งมอบงานต่อได้"
            value={draft.details.installmentCancelReason || ''}
            onChange={(e) =>
              updateDetail('installmentCancelReason', e.target.value)
            }
            className="mt-1 min-h-[36px] w-full rounded-lg border border-[#e3b8b8] bg-white px-3 py-1.5 text-xs font-normal text-[#132d4c]"
          />
        </label>
      </div>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="editor-modal-title"
      className="no-print fixed inset-0 z-40 flex items-center justify-center bg-[#061830]/75 p-3 backdrop-blur-[2px] sm:p-5"
    >
      <div className="flex max-h-[92dvh] w-full max-w-[1060px] flex-col overflow-hidden rounded-[17px] border border-[#2b6cb5] bg-[#f8fbff] shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-4 bg-gradient-to-r from-[#092954] via-[#0f448a] to-[#1666ba] px-6 py-5 text-white">
          <div className="min-w-0">
            <h2 id="editor-modal-title" className="text-lg font-bold sm:text-[21px]">
              {existing ? 'แก้ไขโครงการ' : 'บันทึกโครงการใหม่'}
            </h2>
            <p className="mt-1 text-xs text-[#b8dcff] tabular-nums">
              รหัสโครงการ: {draft.code || 'ยังไม่ระบุ'} | ปีงบประมาณ พ.ศ. {draft.year}
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

        <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
          <div
            role="tablist"
            aria-label="หมวดข้อมูลโครงการ"
            className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-[#b8d0eb] bg-[#dceafa] px-4 py-2.5"
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

          <div
            ref={panelContainerRef}
            className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7"
          >
            {PROJECT_TABS.map((tab, idx) => (
              <section
                key={tab.id}
                data-project-panel={tab.id}
                role="tabpanel"
                hidden={activeTab !== tab.id}
              >
                <div className="mb-5 border-b border-[#cfe0f2] pb-3.5">
                  <h3 className="text-[14px] font-semibold text-[#113969]">
                    {idx + 1}. {tab.heading}
                  </h3>
                  <p className="mt-1 text-xs text-[#4b6a8d]">{tab.description}</p>
                </div>

                {tab.id === 'general' && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                      ปีงบประมาณ พ.ศ. *
                      <select
                        value={draft.year}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, year: Number(e.target.value) }))
                        }
                        className="mt-1.5 min-h-[40px] w-full rounded-[10px] border border-[#a8c4e4] bg-[#f4f8fe] px-3 py-2 text-xs font-normal text-[#132d4c]"
                      >
                        {getFiscalYearOptions(draft.year).map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                      เลขทะเบียน *
                      <input
                        type="text"
                        required
                        maxLength={80}
                        value={draft.code}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, code: e.target.value }))
                        }
                        className="mt-1.5 min-h-[40px] w-full rounded-[10px] border border-[#a8c4e4] bg-[#f4f8fe] px-3 py-2 text-xs font-normal text-[#132d4c]"
                      />
                    </label>

                    <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                      ประเภทงาน *
                      <select
                        value={draft.type}
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            type: e.target.value as ProjectType,
                          }))
                        }
                        className="mt-1.5 min-h-[40px] w-full rounded-[10px] border border-[#a8c4e4] bg-[#f4f8fe] px-3 py-2 text-xs font-normal text-[#132d4c]"
                      >
                        {PROJECT_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="col-span-full block text-[11.5px] font-semibold text-[#1d4069]">
                      ชื่อโครงการ *
                      <input
                        type="text"
                        required
                        maxLength={500}
                        placeholder="กรอกชื่อโครงการหรือรายการจัดซื้อจัดจ้าง"
                        value={draft.title}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, title: e.target.value }))
                        }
                        className="mt-1.5 min-h-[40px] w-full rounded-[10px] border border-[#a8c4e4] bg-[#f4f8fe] px-3 py-2 text-xs font-normal text-[#132d4c]"
                      />
                    </label>

                    <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                      วิธีจัดซื้อจัดจ้าง *
                      <div className="mt-1.5">
                        <AutoSuggestInput
                          required
                          maxLength={200}
                          value={draft.method}
                          suggestions={suggestionPools.methods}
                          onChangeValue={(nextVal) =>
                            setDraft((p) => ({ ...p, method: nextVal }))
                          }
                          className="min-h-[40px] w-full rounded-[10px] border border-[#a8c4e4] bg-[#f4f8fe] px-3 py-2 text-xs font-normal text-[#132d4c]"
                        />
                      </div>
                    </label>

                    <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                      แหล่งงบประมาณ
                      <div className="mt-1.5">
                        <AutoSuggestInput
                          value={draft.fund}
                          suggestions={suggestionPools.funds}
                          onChangeValue={(nextVal) =>
                            setDraft((p) => ({ ...p, fund: nextVal }))
                          }
                          className="min-h-[40px] w-full rounded-[10px] border border-[#a8c4e4] bg-[#f4f8fe] px-3 py-2 text-xs font-normal text-[#132d4c]"
                        />
                      </div>
                    </label>

                    <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                      วงเงินงบประมาณ (บาท) *
                      <input
                        type="number"
                        required
                        min={0}
                        step="0.01"
                        value={draft.budget}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, budget: e.target.value }))
                        }
                        className="mt-1.5 min-h-[40px] w-full rounded-[10px] border border-[#a8c4e4] bg-[#f4f8fe] px-3 py-2 font-mono-num text-xs font-normal text-[#132d4c]"
                      />
                    </label>

                    <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                      ผู้รับผิดชอบ *
                      <div className="mt-1.5">
                        <AutoSuggestInput
                          required
                          maxLength={200}
                          placeholder="กรอกชื่อผู้รับผิดชอบ"
                          value={draft.responsibleName}
                          suggestions={suggestionPools.people}
                          onChangeValue={(nextVal) =>
                            setDraft((p) => ({
                              ...p,
                              responsibleName: nextVal,
                            }))
                          }
                          className="min-h-[40px] w-full rounded-[10px] border border-[#a8c4e4] bg-[#f4f8fe] px-3 py-2 text-xs font-normal text-[#132d4c]"
                        />
                      </div>
                    </label>

                    <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                      วันที่ขออนุมัติ *
                      <input
                        type="date"
                        required
                        value={draft.start}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, start: e.target.value }))
                        }
                        className="mt-1.5 min-h-[40px] w-full rounded-[10px] border border-[#a8c4e4] bg-[#f4f8fe] px-3 py-2 font-mono-num text-xs font-normal text-[#132d4c]"
                      />
                    </label>

                    <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                      สถานะโครงการ
                      <select
                        value={
                          draft.statusMode === 'auto' ? '__auto__' : draft.manualStatus
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '__auto__') {
                            setDraft((p) => ({ ...p, statusMode: 'auto' }));
                          } else {
                            setDraft((p) => ({
                              ...p,
                              statusMode: 'manual',
                              manualStatus: val as ProjectStatus,
                            }));
                          }
                        }}
                        className="mt-1.5 min-h-[40px] w-full rounded-[10px] border border-[#a8c4e4] bg-[#f4f8fe] px-3 py-2 text-xs font-normal text-[#132d4c]"
                      >
                        <option value="__auto__">
                          อัตโนมัติตามข้อมูลแท็บ ({autoProgressPreview.status})
                        </option>
                        {draft.statusMode === 'manual' &&
                          !STATUSES.includes(draft.manualStatus) && (
                            <option value={draft.manualStatus}>
                              กำหนดเอง: {draft.manualStatus}
                            </option>
                          )}
                        {STATUSES.map((st) => (
                          <option key={st} value={st}>
                            กำหนดเอง: {st}
                          </option>
                        ))}
                      </select>
                    </label>

                    <p className="col-span-full text-[11px] text-[#8aa0b7]">
                      ชื่อผู้รับผิดชอบไม่เปลี่ยนบัญชีที่ได้รับงานในกล่องงานของฉัน
                    </p>

                    <label className="col-span-full block text-[11.5px] font-semibold text-[#1d4069]">
                      รายละเอียดโครงการ/รายการจัดซื้อจัดจ้าง
                      <textarea
                        rows={4}
                        placeholder="ระบุรายละเอียดโครงการ ขอบเขต ปริมาณ หรือรายการจัดซื้อจัดจ้าง…"
                        value={draft.notes}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, notes: e.target.value }))
                        }
                        className="mt-1.5 w-full rounded-[10px] border border-[#a8c4e4] bg-[#f4f8fe] p-3 text-xs font-normal text-[#132d4c]"
                      />
                    </label>

                    {renderCategoryUpload(
                      'general',
                      'เอกสารแนบโครงการ (PDF, Word, Excel, รูปภาพ, ZIP · สูงสุด 50 MB/ไฟล์)',
                    )}
                  </div>
                )}

                {tab.id === 'tor' && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                      เลขที่คำสั่งแต่งตั้ง คกก. จัดทำ TOR/ราคากลาง
                      <input
                        type="text"
                        maxLength={100}
                        placeholder="เช่น 142/2567"
                        value={draft.details.torOrderNo || ''}
                        onChange={(e) => updateDetail('torOrderNo', e.target.value)}
                        className="mt-1.5 min-h-[40px] w-full rounded-[10px] border border-[#a8c4e4] bg-[#f4f8fe] px-3 py-2 text-xs font-normal text-[#132d4c]"
                      />
                    </label>

                    <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                      วันที่ออกคำสั่ง
                      <input
                        type="date"
                        value={draft.details.torOrderDate || ''}
                        onChange={(e) => updateDetail('torOrderDate', e.target.value)}
                        className="mt-1.5 min-h-[40px] w-full rounded-[10px] border border-[#a8c4e4] bg-[#f4f8fe] px-3 py-2 font-mono-num text-xs font-normal text-[#132d4c]"
                      />
                    </label>

                    <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                      วันที่จัดทำ TOR และราคากลาง
                      <input
                        type="date"
                        value={draft.details.torPreparedDate || ''}
                        onChange={(e) =>
                          updateDetail('torPreparedDate', e.target.value)
                        }
                        className="mt-1.5 min-h-[40px] w-full rounded-[10px] border border-[#a8c4e4] bg-[#f4f8fe] px-3 py-2 font-mono-num text-xs font-normal text-[#132d4c]"
                      />
                    </label>

                    <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                      ราคากลาง (บาท)
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="0.00"
                        value={draft.reference}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, reference: e.target.value }))
                        }
                        className="mt-1.5 min-h-[40px] w-full rounded-[10px] border border-[#a8c4e4] bg-[#f4f8fe] px-3 py-2 font-mono-num text-xs font-normal text-[#132d4c]"
                      />
                      <span className="mt-1 block font-mono-num text-[11px] font-normal text-[#6f8ca9]">
                        {formatMoney(draft.reference)} บาท
                      </span>
                    </label>

                    {!draft.details.torPreparedDate &&
                      draft.details.torDate &&
                      draft.details.referenceDate &&
                      draft.details.torDate !== draft.details.referenceDate && (
                        <p className="col-span-full rounded-lg border border-[#f2deb9] bg-[#fff8ed] p-3 text-xs text-[#8d672b]">
                          ข้อมูลเดิมมีวันที่ต่างกัน: TOR {draft.details.torDate} / ราคากลาง{' '}
                          {draft.details.referenceDate} กรุณาเลือกวันที่ร่วมในช่องด้านบน
                          ข้อมูลเดิมยังคงเก็บไว้
                        </p>
                      )}

                    {renderMemberSection('tor')}

                    {renderCategoryUpload(
                      'tor',
                      'ไฟล์แนบคำสั่งแต่งตั้ง TOR และเอกสารราคากลาง (PDF, Excel, Word)',
                    )}

                    {draft.details.torNo && (
                      <div className="col-span-full text-xs text-[#6f8ba8]">
                        เลขที่เอกสาร TOR เดิม: {draft.details.torNo}
                      </div>
                    )}

                    {(draft.details.torNotes || existing?.projectDetails?.torNotes) && (
                      <label className="col-span-full block text-[11.5px] font-semibold text-[#1d4069]">
                        รายละเอียด TOR / ขอบเขตงานเดิม
                        <textarea
                          rows={3}
                          value={draft.details.torNotes || ''}
                          onChange={(e) => updateDetail('torNotes', e.target.value)}
                          className="mt-1.5 w-full rounded-[10px] border border-[#a8c4e4] bg-[#f4f8fe] p-3 text-xs font-normal text-[#132d4c]"
                        />
                      </label>
                    )}
                  </div>
                )}

                {tab.id === 'order' && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                      เลขที่ใบสั่งซื้อ / สั่งจ้าง (เอกสารหลัก)
                      <input
                        type="text"
                        value={draft.docNo}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, docNo: e.target.value }))
                        }
                        className="mt-1.5 min-h-[40px] w-full rounded-[10px] border border-[#a8c4e4] bg-[#f4f8fe] px-3 py-2 text-xs font-normal text-[#132d4c]"
                      />
                    </label>

                    <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                      วันที่ใบสั่งซื้อ / สั่งจ้าง
                      <input
                        type="date"
                        value={draft.docDate}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, docDate: e.target.value }))
                        }
                        className="mt-1.5 min-h-[40px] w-full rounded-[10px] border border-[#a8c4e4] bg-[#f4f8fe] px-3 py-2 font-mono-num text-xs font-normal text-[#132d4c]"
                      />
                    </label>

                    <label className="col-span-full block text-[11.5px] font-semibold text-[#1d4069]">
                      ผู้ขาย / ผู้รับจ้าง
                      <div className="mt-1.5">
                        <AutoSuggestInput
                          value={draft.vendor}
                          suggestions={suggestionPools.vendors}
                          onChangeValue={(nextVal) =>
                            setDraft((p) => ({ ...p, vendor: nextVal }))
                          }
                          className="min-h-[40px] w-full rounded-[10px] border border-[#a8c4e4] bg-[#f4f8fe] px-3 py-2 text-xs font-normal text-[#132d4c]"
                        />
                      </div>
                    </label>

                    <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                      วงเงินตกลงซื้อ / จ้าง (บาท)
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={draft.agreed}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, agreed: e.target.value }))
                        }
                        className="mt-1.5 min-h-[40px] w-full rounded-[10px] border border-[#a8c4e4] bg-[#f4f8fe] px-3 py-2 font-mono-num text-xs font-normal text-[#132d4c]"
                      />
                    </label>

                    <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                      กำหนดส่งมอบ
                      <input
                        type="date"
                        value={draft.details.deliveryDue || ''}
                        onChange={(e) => updateDetail('deliveryDue', e.target.value)}
                        className="mt-1.5 min-h-[40px] w-full rounded-[10px] border border-[#a8c4e4] bg-[#f4f8fe] px-3 py-2 font-mono-num text-xs font-normal text-[#132d4c]"
                      />
                    </label>

                    <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                      จำนวนงวดงาน (งวด)
                      <input
                        type="number"
                        min={1}
                        max={100}
                        step={1}
                        placeholder="เช่น 1 หรือ 12"
                        value={draft.details.installmentCount ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const nextCount =
                            raw === '' ? '' : Math.min(100, Math.max(1, Math.trunc(Number(raw)) || 1));
                          setDraft((prev) => ({
                            ...prev,
                            details: {
                              ...prev.details,
                              installmentCount: nextCount,
                              cancelledRounds:
                                typeof nextCount === 'number'
                                  ? (prev.details.cancelledRounds || []).filter(
                                      (r) => r <= nextCount,
                                    )
                                  : [],
                            },
                          }));
                        }}
                        className="mt-1.5 min-h-[40px] w-full rounded-[10px] border border-[#a8c4e4] bg-[#f4f8fe] px-3 py-2 font-mono-num text-xs font-normal text-[#132d4c]"
                      />
                    </label>

                    <div className="flex flex-col justify-end text-[11px] text-[#4b6a8d]">
                      {installmentSummary.installmentCount > 0 ? (
                        <div className="rounded-[10px] border border-[#b4cde8] bg-[#edf4fc] px-3 py-2.5 leading-relaxed">
                          กำหนดส่งมอบและเบิกฎีกา{' '}
                          <b className="font-mono-num text-[#0f4ca6]">
                            {installmentSummary.installmentCount} งวด
                          </b>
                          {installmentSummary.cancelledRounds.length > 0 && (
                            <span className="text-[#a82c2c]">
                              {' '}
                              (ยกเลิก {installmentSummary.cancelledRounds.length} งวด · เหลือ{' '}
                              {installmentSummary.activeRounds.length} งวด)
                            </span>
                          )}
                          {' · '}ระบบจะยึดจำนวนนี้ในแท็บ 4 และแท็บ 5
                        </div>
                      ) : (
                        <div className="rounded-[10px] border border-[#d6e4f3] bg-[#f6fafe] px-3 py-2.5 text-[#5b7796]">
                          ระบุจำนวนงวดงาน (เช่น 12 งวดสำหรับจ้างเหมารายเดือน) เพื่อติดตามการส่งมอบและฎีกาให้ครบทุกงวด
                        </div>
                      )}
                    </div>

                    <label className="col-span-full block text-[11.5px] font-semibold text-[#1d4069]">
                      รายละเอียดการสั่งซื้อ / สั่งจ้าง
                      <textarea
                        rows={4}
                        value={draft.details.orderNotes || ''}
                        onChange={(e) => updateDetail('orderNotes', e.target.value)}
                        className="mt-1.5 w-full rounded-[10px] border border-[#a8c4e4] bg-[#f4f8fe] p-3 text-xs font-normal text-[#132d4c]"
                      />
                    </label>

                    {renderCategoryUpload(
                      'order',
                      'เอกสารสั่งซื้อ / สั่งจ้าง (PDF, Excel, Word)',
                    )}
                  </div>
                )}

                {tab.id === 'acceptance' && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                      เลขที่คำสั่งแต่งตั้ง
                      <input
                        type="text"
                        maxLength={100}
                        placeholder="เช่น 185/2567"
                        value={draft.details.committeeNo || ''}
                        onChange={(e) => updateDetail('committeeNo', e.target.value)}
                        className="mt-1.5 min-h-[40px] w-full rounded-[10px] border border-[#a8c4e4] bg-[#f4f8fe] px-3 py-2 text-xs font-normal text-[#132d4c]"
                      />
                    </label>

                    <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                      วันที่ออกคำสั่ง
                      <input
                        type="date"
                        value={draft.details.committeeDate || ''}
                        onChange={(e) => updateDetail('committeeDate', e.target.value)}
                        className="mt-1.5 min-h-[40px] w-full rounded-[10px] border border-[#a8c4e4] bg-[#f4f8fe] px-3 py-2 font-mono-num text-xs font-normal text-[#132d4c]"
                      />
                    </label>

                    {renderMemberSection('acceptance')}

                    {renderCategoryUpload(
                      'acceptance',
                      'ไฟล์แนบคำสั่งแต่งตั้งคณะกรรมการตรวจรับ (PDF, Excel, Word)',
                    )}

                    {installmentSummary.installmentCount > 0 && (
                      <div className="col-span-full flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#9fc0e6] bg-[#e9f2fc] px-4 py-3 text-xs text-[#153e70]">
                        <span>
                          งวดงานตามคำสั่งซื้อ/จ้าง:{' '}
                          <b className="font-mono-num">
                            {installmentSummary.installmentCount} งวด
                          </b>
                          {installmentSummary.cancelledRounds.length > 0 && (
                            <span className="text-[#a82c2c]">
                              {' '}
                              (ยกเลิก {installmentSummary.cancelledRounds.length} งวด ·
                              คงเหลือต้องส่ง {installmentSummary.activeRounds.length} งวด)
                            </span>
                          )}
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          {(() => {
                            const existingRounds = new Set(
                              draft.deliveryRounds.map((d) => d.round),
                            );
                            const missingDeliveryRounds =
                              installmentSummary.activeRounds.filter(
                                (r) => !existingRounds.has(r),
                              );
                            if (missingDeliveryRounds.length === 0) return null;
                            return (
                              <button
                                type="button"
                                onClick={() =>
                                  setDraft((prev) => {
                                    const nonBlank = prev.deliveryRounds.filter(
                                      (d) =>
                                        d.docNo.trim() || d.date || d.notes.trim(),
                                    );
                                    const nonBlankSet = new Set(
                                      nonBlank.map((d) => d.round),
                                    );
                                    const additions = installmentSummary.activeRounds
                                      .filter((r) => !nonBlankSet.has(r))
                                      .map((r) => ({
                                        round: r,
                                        docNo: '',
                                        date: '',
                                        notes: '',
                                      }));
                                    return {
                                      ...prev,
                                      deliveryRounds: [...nonBlank, ...additions].sort(
                                        (a, b) => a.round - b.round,
                                      ),
                                    };
                                  })
                                }
                                className="rounded-lg bg-[#0f4ca6] px-3 py-1 text-[11px] font-semibold text-white hover:bg-[#0b3a80]"
                              >
                                ＋ สร้างรายการส่งมอบให้ครบ ({installmentSummary.activeRounds.length} งวด)
                              </button>
                            );
                          })()}
                          <button
                            type="button"
                            onClick={() => setShowCancelPanel((v) => !v)}
                            className="rounded-lg border border-[#d99b9b] bg-white px-3 py-1 text-[11px] font-semibold text-[#9c2323] hover:bg-[#fff0f0]"
                          >
                            {showCancelPanel
                              ? 'ซ่อนจัดการยกเลิกงวด'
                              : 'ยกเลิกงวดงานที่เหลือ'}
                          </button>
                        </div>
                      </div>
                    )}

                    {renderInstallmentCancelPanel()}

                    <div className="col-span-full rounded-2xl border border-[#b4cde8] bg-[#edf4fc] p-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <h4 className="flex items-center gap-2 text-xs font-semibold text-[#17406e]">
                          <span className="grid h-6 w-6 place-items-center rounded-md bg-[#0f4ca6] text-white">
                            <PackageCheck className="h-3.5 w-3.5" />
                          </span>
                          การส่งมอบ{' '}
                          <span className="font-mono-num text-[#3d6591]">
                            ({draft.deliveryRounds.length} ครั้ง)
                          </span>
                        </h4>
                        <button
                          type="button"
                          disabled={draft.deliveryRounds.length >= 100}
                          onClick={() =>
                            setDraft((prev) => {
                              const usedRounds = new Set(
                                prev.deliveryRounds.map((r) => Number(r.round)),
                              );
                              const nextActive =
                                installmentSummary.activeRounds.find(
                                  (r) => !usedRounds.has(r),
                                );
                              const nextRound =
                                nextActive ??
                                Math.max(
                                  0,
                                  ...prev.deliveryRounds.map(
                                    (r) => Number(r.round) || 0,
                                  ),
                                ) + 1;
                              return {
                                ...prev,
                                deliveryRounds: [
                                  ...prev.deliveryRounds,
                                  {
                                    round: nextRound,
                                    docNo: '',
                                    date: '',
                                    notes: '',
                                  },
                                ],
                              };
                            })
                          }
                          className="whitespace-nowrap text-xs font-semibold text-[#0f58ad] hover:underline disabled:opacity-45"
                        >
                          ＋ เพิ่มการส่งมอบ
                        </button>
                      </div>

                      {draft.deliveryRounds.length === 0 ? (
                        <p className="text-[11px] text-[#5c7899]">
                          ยังไม่มีข้อมูลการส่งมอบ กด “เพิ่มการส่งมอบ” เพื่อเพิ่ม
                        </p>
                      ) : (
                        <div className="space-y-2.5">
                          {draft.deliveryRounds.map((delivItem, dIdx) => {
                            const isCancelledRound =
                              installmentSummary.cancelledRounds.includes(
                                delivItem.round,
                              );
                            return (
                              <div
                                key={dIdx}
                                className={`relative rounded-xl border p-3.5 pr-9 ${
                                  isCancelledRound
                                    ? 'border-[#e3b8b8] bg-[#fff9f9]'
                                    : 'border-[#aec7e4] bg-white'
                                }`}
                              >
                                <button
                                  type="button"
                                  aria-label={`ลบการส่งมอบครั้งที่ ${dIdx + 1}`}
                                  title="ลบการส่งมอบ"
                                  onClick={() =>
                                    setDraft((prev) => ({
                                      ...prev,
                                      deliveryRounds: prev.deliveryRounds.filter(
                                        (_, i) => i !== dIdx,
                                      ),
                                    }))
                                  }
                                  className="absolute top-3 right-2.5 rounded p-1 text-xs text-[#8ba4bd] hover:bg-[#fff0f1] hover:text-[#b95b68]"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>

                                {isCancelledRound && (
                                  <div className="mb-2 inline-block rounded bg-[#ffe4e4] px-2 py-0.5 text-[10.5px] font-semibold text-[#9b2222]">
                                    งวดที่ {delivItem.round} ถูกยกเลิกแล้ว
                                  </div>
                                )}

                                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                                  <label className="block text-[11px] text-[#556f8c]">
                                    งวดที่
                                    {installmentSummary.installmentCount > 0 ? (
                                      <select
                                        value={delivItem.round}
                                        onChange={(e) =>
                                          setDraft((prev) => ({
                                            ...prev,
                                            deliveryRounds: prev.deliveryRounds.map(
                                              (item, i) =>
                                                i === dIdx
                                                  ? {
                                                      ...item,
                                                      round: Number(e.target.value),
                                                    }
                                                  : item,
                                            ),
                                          }))
                                        }
                                        className="mt-1 min-h-[34px] w-full rounded-md border border-[#c6d9ec] bg-white px-2.5 py-1.5 font-mono-num text-xs text-[#132d4c]"
                                      >
                                        {Array.from(
                                          {
                                            length: installmentSummary.installmentCount,
                                          },
                                          (_, i) => i + 1,
                                        ).map((r) => (
                                          <option key={r} value={r}>
                                            งวดที่ {r}
                                            {installmentSummary.cancelledRounds.includes(
                                              r,
                                            )
                                              ? ' (ยกเลิก)'
                                              : ''}
                                          </option>
                                        ))}
                                        {delivItem.round >
                                          installmentSummary.installmentCount && (
                                          <option value={delivItem.round}>
                                            งวดที่ {delivItem.round} (เกินกำหนดงวด)
                                          </option>
                                        )}
                                      </select>
                                    ) : (
                                      <input
                                        type="number"
                                        min={1}
                                        step={1}
                                        value={delivItem.round}
                                        onChange={(e) =>
                                          setDraft((prev) => ({
                                            ...prev,
                                            deliveryRounds: prev.deliveryRounds.map(
                                              (item, i) =>
                                                i === dIdx
                                                  ? {
                                                      ...item,
                                                      round: Number(e.target.value),
                                                    }
                                                  : item,
                                            ),
                                          }))
                                        }
                                        className="mt-1 min-h-[34px] w-full rounded-md border border-[#c6d9ec] bg-white px-2.5 py-1.5 font-mono-num text-xs text-[#132d4c]"
                                      />
                                    )}
                                  </label>

                                  <label className="block text-[11px] text-[#556f8c]">
                                    เลขที่หนังสือส่งมอบ / ใบส่งของ
                                    <input
                                      type="text"
                                      maxLength={200}
                                      placeholder="เช่น ใบส่งของเลขที่…"
                                      value={delivItem.docNo}
                                      onChange={(e) =>
                                        setDraft((prev) => ({
                                          ...prev,
                                          deliveryRounds: prev.deliveryRounds.map(
                                            (item, i) =>
                                              i === dIdx
                                                ? { ...item, docNo: e.target.value }
                                                : item,
                                          ),
                                        }))
                                      }
                                      className="mt-1 min-h-[34px] w-full rounded-md border border-[#c6d9ec] bg-white px-2.5 py-1.5 text-xs text-[#132d4c]"
                                    />
                                  </label>

                                  <label className="block text-[11px] text-[#556f8c]">
                                    วันที่ส่งมอบ
                                    <input
                                      type="date"
                                      value={delivItem.date}
                                      onChange={(e) =>
                                        setDraft((prev) => ({
                                          ...prev,
                                          deliveryRounds: prev.deliveryRounds.map(
                                            (item, i) =>
                                              i === dIdx
                                                ? { ...item, date: e.target.value }
                                                : item,
                                          ),
                                        }))
                                      }
                                      className="mt-1 min-h-[34px] w-full rounded-md border border-[#c6d9ec] bg-white px-2.5 py-1.5 font-mono-num text-xs text-[#132d4c]"
                                    />
                                  </label>

                                  <label className="col-span-full block">
                                    <span className="sr-only">
                                      รายละเอียดการส่งมอบครั้งที่ {dIdx + 1}
                                    </span>
                                    <input
                                      type="text"
                                      maxLength={2000}
                                      placeholder="รายละเอียดการส่งมอบงาน / พัสดุ…"
                                      value={delivItem.notes}
                                      onChange={(e) =>
                                        setDraft((prev) => ({
                                          ...prev,
                                          deliveryRounds: prev.deliveryRounds.map(
                                            (item, i) =>
                                              i === dIdx
                                                ? { ...item, notes: e.target.value }
                                                : item,
                                          ),
                                        }))
                                      }
                                      className="min-h-[34px] w-full rounded-md border border-[#c6d9ec] bg-white px-2.5 py-1.5 text-xs text-[#132d4c]"
                                    />
                                  </label>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="col-span-full rounded-2xl border border-[#b4cde8] bg-[#edf4fc] p-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <h4 className="flex items-center gap-2 text-xs font-semibold text-[#17406e]">
                          <span className="grid h-6 w-6 place-items-center rounded-md bg-[#0f4ca6] text-white">
                            ✓
                          </span>
                          ผลการตรวจรับ{' '}
                          <span className="font-mono-num text-[#3d6591]">
                            ({draft.acceptanceRounds.length} ครั้ง)
                          </span>
                        </h4>
                        <button
                          type="button"
                          disabled={draft.acceptanceRounds.length >= 100}
                          onClick={() =>
                            setDraft((prev) => {
                              const usedRounds = new Set(
                                prev.acceptanceRounds.map((r) => Number(r.round)),
                              );
                              const nextActive =
                                installmentSummary.activeRounds.find(
                                  (r) => !usedRounds.has(r),
                                );
                              const nextRound =
                                nextActive ??
                                Math.max(
                                  0,
                                  ...prev.acceptanceRounds.map(
                                    (r) => Number(r.round) || 0,
                                  ),
                                ) + 1;
                              return {
                                ...prev,
                                acceptanceRounds: [
                                  ...prev.acceptanceRounds,
                                  {
                                    round: nextRound,
                                    date: '',
                                    result: '',
                                    notes: '',
                                  },
                                ],
                              };
                            })
                          }
                          className="whitespace-nowrap text-xs font-semibold text-[#0f58ad] hover:underline disabled:opacity-45"
                        >
                          ＋ เพิ่มการตรวจรับ
                        </button>
                      </div>

                      {draft.acceptanceRounds.length === 0 ? (
                        <p className="text-[11px] text-[#5c7899]">
                          ยังไม่มีผลการตรวจรับ กด “เพิ่มการตรวจรับ” เพื่อเพิ่ม
                        </p>
                      ) : (
                        <div className="space-y-2.5">
                          {draft.acceptanceRounds.map((roundItem, rIdx) => (
                            <div
                              key={rIdx}
                              className="relative rounded-xl border border-[#aec7e4] bg-white p-3.5 pr-9"
                            >
                              <button
                                type="button"
                                aria-label={`ลบการตรวจรับครั้งที่ ${rIdx + 1}`}
                                title="ลบการตรวจรับ"
                                onClick={() =>
                                  setDraft((prev) => ({
                                    ...prev,
                                    acceptanceRounds: prev.acceptanceRounds.filter(
                                      (_, i) => i !== rIdx,
                                    ),
                                  }))
                                }
                                className="absolute top-3 right-2.5 rounded p-1 text-xs text-[#8ba4bd] hover:bg-[#fff0f1] hover:text-[#b95b68]"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>

                              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                                <label className="block text-[11px] text-[#556f8c]">
                                  งวดที่
                                  {installmentSummary.installmentCount > 0 ? (
                                    <select
                                      value={roundItem.round}
                                      onChange={(e) =>
                                        setDraft((prev) => ({
                                          ...prev,
                                          acceptanceRounds:
                                            prev.acceptanceRounds.map((item, i) =>
                                              i === rIdx
                                                ? {
                                                    ...item,
                                                    round: Number(e.target.value),
                                                  }
                                                : item,
                                            ),
                                        }))
                                      }
                                      className="mt-1 min-h-[34px] w-full rounded-md border border-[#c6d9ec] bg-white px-2.5 py-1.5 font-mono-num text-xs text-[#132d4c]"
                                    >
                                      {Array.from(
                                        {
                                          length: installmentSummary.installmentCount,
                                        },
                                        (_, i) => i + 1,
                                      ).map((r) => (
                                        <option key={r} value={r}>
                                          งวดที่ {r}
                                          {installmentSummary.cancelledRounds.includes(
                                            r,
                                          )
                                            ? ' (ยกเลิก)'
                                            : ''}
                                        </option>
                                      ))}
                                      {roundItem.round >
                                        installmentSummary.installmentCount && (
                                        <option value={roundItem.round}>
                                          งวดที่ {roundItem.round} (เกินกำหนดงวด)
                                        </option>
                                      )}
                                    </select>
                                  ) : (
                                    <input
                                      type="number"
                                      min={1}
                                      step={1}
                                      value={roundItem.round}
                                      onChange={(e) =>
                                        setDraft((prev) => ({
                                          ...prev,
                                          acceptanceRounds:
                                            prev.acceptanceRounds.map((item, i) =>
                                              i === rIdx
                                                ? {
                                                    ...item,
                                                    round: Number(e.target.value),
                                                  }
                                                : item,
                                            ),
                                        }))
                                      }
                                      className="mt-1 min-h-[34px] w-full rounded-md border border-[#c6d9ec] bg-white px-2.5 py-1.5 font-mono-num text-xs text-[#132d4c]"
                                    />
                                  )}
                                </label>

                                <label className="block text-[11px] text-[#556f8c]">
                                  วันที่ตรวจรับ
                                  <input
                                    type="date"
                                    value={roundItem.date}
                                    onChange={(e) =>
                                      setDraft((prev) => ({
                                        ...prev,
                                        acceptanceRounds: prev.acceptanceRounds.map(
                                          (item, i) =>
                                            i === rIdx
                                              ? { ...item, date: e.target.value }
                                              : item,
                                        ),
                                      }))
                                    }
                                    className="mt-1 min-h-[34px] w-full rounded-md border border-[#c6d9ec] bg-white px-2.5 py-1.5 font-mono-num text-xs text-[#132d4c]"
                                  />
                                </label>

                                <label className="block text-[11px] text-[#556f8c]">
                                  ผลการตรวจรับ
                                  <select
                                    value={roundItem.result}
                                    onChange={(e) =>
                                      setDraft((prev) => ({
                                        ...prev,
                                        acceptanceRounds: prev.acceptanceRounds.map(
                                          (item, i) =>
                                            i === rIdx
                                              ? {
                                                  ...item,
                                                  result: e.target
                                                    .value as AcceptanceRound['result'],
                                                }
                                              : item,
                                        ),
                                      }))
                                    }
                                    className="mt-1 min-h-[34px] w-full rounded-md border border-[#c6d9ec] bg-white px-2.5 py-1.5 text-xs text-[#132d4c]"
                                  >
                                    <option value="">เลือกผลการตรวจรับ</option>
                                    {ACCEPTANCE_RESULTS.map((res) => (
                                      <option key={res} value={res}>
                                        {res}
                                      </option>
                                    ))}
                                  </select>
                                </label>

                                <label className="col-span-full block">
                                  <span className="sr-only">
                                    รายละเอียดผลตรวจรับครั้งที่ {rIdx + 1}
                                  </span>
                                  <input
                                    type="text"
                                    maxLength={2000}
                                    placeholder="รายละเอียดผลการตรวจรับ…"
                                    value={roundItem.notes}
                                    onChange={(e) =>
                                      setDraft((prev) => ({
                                        ...prev,
                                        acceptanceRounds: prev.acceptanceRounds.map(
                                          (item, i) =>
                                            i === rIdx
                                              ? { ...item, notes: e.target.value }
                                              : item,
                                        ),
                                      }))
                                    }
                                    className="min-h-[34px] w-full rounded-md border border-[#c6d9ec] bg-white px-2.5 py-1.5 text-xs text-[#132d4c]"
                                  />
                                </label>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {draft.details.acceptanceNo && (
                      <label className="col-span-full block text-[11.5px] font-semibold text-[#1d4069]">
                        เลขที่เอกสารตรวจรับเดิม
                        <input
                          type="text"
                          value={draft.details.acceptanceNo}
                          onChange={(e) => updateDetail('acceptanceNo', e.target.value)}
                          className="mt-1.5 min-h-[40px] w-full rounded-[10px] border border-[#a8c4e4] bg-[#f4f8fe] px-3 py-2 text-xs font-normal text-[#132d4c]"
                        />
                      </label>
                    )}
                  </div>
                )}

                {tab.id === 'voucher' &&
                  (() => {
                    const recordedDeliveries = draft.deliveryRounds.filter(
                      (d) => d.date || d.docNo?.trim() || d.notes?.trim() || d.round,
                    );
                    const unlinkedDeliveries = draft.deliveryRounds.filter(
                      (d) =>
                        (d.date || d.docNo?.trim() || d.notes?.trim()) &&
                        !draft.voucherEntries.some(
                          (v) =>
                            v.round === d.round &&
                            (v.voucherNo.trim() ||
                              v.voucherDate ||
                              v.voucherAmount !== '' ||
                              v.paymentDate ||
                              v.voucherNotes.trim()),
                        ),
                    );
                    const totalVoucherAmt = draft.voucherEntries.reduce(
                      (sum, v) => sum + (Number(v.voucherAmount) || 0),
                      0,
                    );
                    const paidCount = draft.voucherEntries.filter((v) =>
                      Boolean(v.paymentDate),
                    ).length;
                    const agreedNum = Number(draft.agreed) || 0;

                    return (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-3 rounded-xl border border-[#b4cde8] bg-[#edf4fc] p-4 sm:grid-cols-3">
                          <div>
                            <div className="text-[11px] font-medium text-[#4a6a8e]">
                              จำนวนฎีกาที่บันทึก
                            </div>
                            <div className="mt-0.5 font-mono-num text-sm font-bold text-[#0f3463]">
                              {draft.voucherEntries.length} ครั้ง{' '}
                              {installmentSummary.installmentCount > 0 && (
                                <span className="text-[11px] font-semibold text-[#185bb5]">
                                  (ตามสัญญา {installmentSummary.activeRounds.length}
                                  {installmentSummary.cancelledRounds.length > 0
                                    ? `/${installmentSummary.installmentCount}`
                                    : ''}{' '}
                                  งวด)
                                </span>
                              )}{' '}
                              <span className="text-[11px] font-medium text-[#0e7452]">
                                · เบิกจ่ายแล้ว {paidCount}
                              </span>
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] font-medium text-[#4a6a8e]">
                              ยอดรวมตามฎีกาทั้งหมด
                            </div>
                            <div className="mt-0.5 font-mono-num text-sm font-bold text-[#0f4ca6]">
                              {formatMoney(totalVoucherAmt)} บาท
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] font-medium text-[#4a6a8e]">
                              คงเหลือจากวงเงินตกลง ({formatMoney(agreedNum)})
                            </div>
                            <div
                              className={`mt-0.5 font-mono-num text-sm font-bold ${
                                agreedNum > 0 && totalVoucherAmt > agreedNum
                                  ? 'text-[#b82828]'
                                  : 'text-[#153152]'
                              }`}
                            >
                              {formatMoney(Math.max(0, agreedNum - totalVoucherAmt))} บาท
                            </div>
                          </div>
                        </div>

                        {installmentSummary.installmentCount > 0 && (
                          <div className="rounded-xl border border-[#b4cde8] bg-[#f5f9ff] p-4">
                            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                              <div className="text-xs font-semibold text-[#17406e]">
                                ติดตามการส่งมอบและจัดทำฎีกาตามงวดงาน (
                                {installmentSummary.voucheredActiveRounds.length}/
                                {installmentSummary.activeRounds.length} งวด)
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {installmentSummary.missingVoucherRounds.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDraft((prev) => {
                                        const existingNonBlank =
                                          prev.voucherEntries.filter(
                                            (v) =>
                                              v.voucherNo.trim() ||
                                              v.voucherDate ||
                                              v.voucherAmount !== '' ||
                                              v.paymentDate ||
                                              v.voucherNotes.trim(),
                                          );
                                        const nonBlankSet = new Set(
                                          existingNonBlank.map((v) => v.round),
                                        );
                                        const additions =
                                          installmentSummary.activeRounds
                                            .filter((r) => !nonBlankSet.has(r))
                                            .map((r) => {
                                              const dlv =
                                                prev.deliveryRounds.find(
                                                  (d) => d.round === r,
                                                );
                                              return {
                                                round: r,
                                                voucherNo: '',
                                                voucherDate: '',
                                                voucherAmount: '' as const,
                                                paymentDate: '',
                                                voucherNotes: dlv?.docNo
                                                  ? `อ้างอิงหนังสือส่งมอบ ${dlv.docNo}`
                                                  : '',
                                              };
                                            });
                                        return {
                                          ...prev,
                                          voucherEntries: [
                                            ...existingNonBlank,
                                            ...additions,
                                          ].sort((a, b) => a.round - b.round),
                                        };
                                      })
                                    }
                                    className="rounded-lg bg-[#0f4ca6] px-3 py-1 text-[11px] font-semibold text-white hover:bg-[#0b3a80]"
                                  >
                                    ＋ เพิ่มฎีกาที่เหลือ (
                                    {installmentSummary.missingVoucherRounds.length} งวด)
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setShowCancelPanel((v) => !v)}
                                  className="rounded-lg border border-[#d99b9b] bg-white px-3 py-1 text-[11px] font-semibold text-[#9c2323] hover:bg-[#fff0f0]"
                                >
                                  {showCancelPanel
                                    ? 'ซ่อนจัดการยกเลิกงวด'
                                    : 'ยกเลิกงวดงานที่เหลือ / ปิดจบโครงการ'}
                                </button>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                              {Array.from(
                                { length: installmentSummary.installmentCount },
                                (_, i) => i + 1,
                              ).map((r) => {
                                const isCancelled =
                                  installmentSummary.cancelledRounds.includes(r);
                                const matchingV = draft.voucherEntries.filter(
                                  (v) =>
                                    v.round === r &&
                                    (v.voucherNo.trim() ||
                                      v.voucherDate ||
                                      v.voucherAmount !== '' ||
                                      v.paymentDate ||
                                      v.voucherNotes.trim()),
                                );
                                const isPaid = matchingV.some((v) =>
                                  Boolean(v.paymentDate),
                                );
                                const hasVoucher = matchingV.length > 0;
                                const hasDelivery = recordedDeliveries.some(
                                  (d) =>
                                    d.round === r &&
                                    (d.date || d.docNo?.trim() || d.notes?.trim()),
                                );

                                return (
                                  <span
                                    key={r}
                                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono-num text-[10.5px] font-semibold ${
                                      isCancelled
                                        ? 'border-[#e49e9e] bg-[#ffe4e4] text-[#9b2222] line-through'
                                        : isPaid
                                          ? 'border-[#9cd8bd] bg-[#dff5eb] text-[#116947]'
                                          : hasVoucher
                                            ? 'border-[#9fc0e6] bg-[#e9f2fc] text-[#0f4ca6]'
                                            : hasDelivery
                                              ? 'border-[#8ec6f5] bg-white text-[#0b4f94]'
                                              : 'border-[#d4e3f3] bg-white text-[#5c7899]'
                                    }`}
                                  >
                                    งวด {r}
                                    {isCancelled
                                      ? ' (ยกเลิก)'
                                      : isPaid
                                        ? ' ✓'
                                        : hasVoucher
                                          ? ' · รอเบิก'
                                          : hasDelivery
                                            ? ' · ส่งงานแล้ว'
                                            : ''}
                                  </span>
                                );
                              })}
                            </div>

                            {installmentSummary.missingVoucherRounds.length > 0 && (
                              <p className="mt-2.5 rounded-lg border border-[#f2deb9] bg-[#fff8ed] px-3 py-2 text-[11px] text-[#8d6018]">
                                ยังจัดทำฎีกาไม่ครบตามงวดงาน (เหลืองวดที่{' '}
                                {installmentSummary.missingVoucherRounds.join(', ')})
                                · สถานะโครงการจะยังคงเป็น{' '}
                                <b>“กำลังดำเนินการ”</b>{' '}
                                จนกว่าจะจัดทำฎีกาครบทุกงวด หรือกด{' '}
                                <b>“ยกเลิกงวดงานที่เหลือ / ปิดจบโครงการ”</b>
                              </p>
                            )}
                          </div>
                        )}

                        {renderInstallmentCancelPanel()}

                        {unlinkedDeliveries.length > 0 && (
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#8ec6f5] bg-[#e6f3ff] px-4 py-3 text-xs text-[#0b4f94]">
                            <span>
                              พบการส่งมอบงานจากแท็บ 4 ที่ยังไม่มีรายการฎีกาเชื่อมโยง (
                              {unlinkedDeliveries
                                .map((d) => `งวดที่ ${d.round}`)
                                .join(', ')}
                              )
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setDraft((prev) => {
                                  const existingNonBlank = prev.voucherEntries.filter(
                                    (v) =>
                                      v.voucherNo.trim() ||
                                      v.voucherDate ||
                                      v.voucherAmount !== '' ||
                                      v.paymentDate ||
                                      v.voucherNotes.trim(),
                                  );
                                  const newEntries = unlinkedDeliveries
                                    .filter(
                                      (d) =>
                                        !installmentSummary.cancelledRounds.includes(
                                          d.round,
                                        ),
                                    )
                                    .map((d) => ({
                                      round: d.round,
                                      voucherNo: '',
                                      voucherDate: '',
                                      voucherAmount: '' as const,
                                      paymentDate: '',
                                      voucherNotes: d.docNo
                                        ? `อ้างอิงหนังสือส่งมอบ ${d.docNo}`
                                        : '',
                                    }));
                                  return {
                                    ...prev,
                                    voucherEntries: [...existingNonBlank, ...newEntries].sort(
                                      (a, b) => a.round - b.round,
                                    ),
                                  };
                                })
                              }
                              className="whitespace-nowrap rounded-lg bg-[#0f4ca6] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#0b3a80]"
                            >
                              ＋ สร้างฎีกาตามงวดส่งมอบ ({unlinkedDeliveries.length} งวด)
                            </button>
                          </div>
                        )}

                        <div className="rounded-2xl border border-[#b4cde8] bg-[#edf4fc] p-4">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <h4 className="flex items-center gap-2 text-xs font-semibold text-[#17406e]">
                              <span className="grid h-6 w-6 place-items-center rounded-md bg-[#0f4ca6] text-white">
                                <Clock className="h-3.5 w-3.5" />
                              </span>
                              รายการฎีกาและการเบิกจ่ายรายงวด{' '}
                              <span className="font-mono-num text-[#3d6591]">
                                ({draft.voucherEntries.length} รายการ)
                              </span>
                            </h4>
                            <button
                              type="button"
                              disabled={draft.voucherEntries.length >= 100}
                              onClick={() =>
                                setDraft((prev) => {
                                  const usedVoucherRounds = new Set(
                                    prev.voucherEntries.map((v) => v.round),
                                  );
                                  const nextRound =
                                    installmentSummary.activeRounds.find(
                                      (r) => !usedVoucherRounds.has(r),
                                    ) ??
                                    prev.deliveryRounds.find(
                                      (d) =>
                                        !usedVoucherRounds.has(d.round) &&
                                        !installmentSummary.cancelledRounds.includes(
                                          d.round,
                                        ),
                                    )?.round ??
                                    Math.max(
                                      0,
                                      ...prev.voucherEntries.map(
                                        (v) => Number(v.round) || 0,
                                      ),
                                    ) + 1;
                                  return {
                                    ...prev,
                                    voucherEntries: [
                                      ...prev.voucherEntries,
                                      {
                                        round: nextRound,
                                        voucherNo: '',
                                        voucherDate: '',
                                        voucherAmount: '',
                                        paymentDate: '',
                                        voucherNotes: '',
                                      },
                                    ],
                                  };
                                })
                              }
                              className="whitespace-nowrap text-xs font-semibold text-[#0f58ad] hover:underline disabled:opacity-45"
                            >
                              ＋ เพิ่มรายการฎีกา
                            </button>
                          </div>

                          {draft.voucherEntries.length === 0 ? (
                            <p className="text-[11px] text-[#5c7899]">
                              ยังไม่มีรายการฎีกา กด “＋ เพิ่มรายการฎีกา” เพื่อเพิ่มงวดเบิกจ่าย
                            </p>
                          ) : (
                            <div className="space-y-3">
                              {draft.voucherEntries.map((vItem, vIdx) => {
                                const linkedDelivery = recordedDeliveries.find(
                                  (d) => d.round === vItem.round,
                                );
                                const isCancelledRound =
                                  installmentSummary.cancelledRounds.includes(
                                    vItem.round,
                                  );

                                return (
                                  <div
                                    key={vIdx}
                                    className={`relative rounded-xl border p-4 pr-10 ${
                                      isCancelledRound
                                        ? 'border-[#e3b8b8] bg-[#fff9f9]'
                                        : 'border-[#aec7e4] bg-white'
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      aria-label={`ลบรายการฎีกาครั้งที่ ${vIdx + 1}`}
                                      title="ลบรายการฎีกา"
                                      onClick={() =>
                                        setDraft((prev) => ({
                                          ...prev,
                                          voucherEntries: prev.voucherEntries.filter(
                                            (_, i) => i !== vIdx,
                                          ),
                                        }))
                                      }
                                      className="absolute top-3.5 right-3 rounded p-1 text-xs text-[#8ba4bd] hover:bg-[#fff0f1] hover:text-[#b95b68]"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>

                                    <div className="mb-3 flex flex-wrap items-center gap-2">
                                      <span className="rounded-md bg-[#eef4fc] px-2 py-0.5 font-mono-num text-[11px] font-bold text-[#0f4ca6]">
                                        ฎีกาครั้งที่ {vIdx + 1}
                                      </span>
                                      {isCancelledRound && (
                                        <span className="rounded-md border border-[#e49e9e] bg-[#ffe4e4] px-2 py-0.5 text-[10.5px] font-semibold text-[#9b2222]">
                                          งวดนี้ถูกยกเลิกแล้ว
                                        </span>
                                      )}
                                      {linkedDelivery &&
                                      (linkedDelivery.docNo || linkedDelivery.date) ? (
                                        <span className="rounded-md border border-[#9fdcc2] bg-[#e6f9f1] px-2 py-0.5 text-[10.5px] font-medium text-[#0f7454]">
                                          เชื่อมโยงการส่งมอบงวดที่ {linkedDelivery.round}
                                          {linkedDelivery.docNo
                                            ? ` · เลขที่ ${linkedDelivery.docNo}`
                                            : ''}
                                          {linkedDelivery.date
                                            ? ` (${formatThaiDate(linkedDelivery.date)})`
                                            : ''}
                                        </span>
                                      ) : (
                                        <span className="rounded-md border border-[#d4e3f3] bg-[#f7fafd] px-2 py-0.5 text-[10.5px] text-[#5c7899]">
                                          งวดที่ {vItem.round} (ยังไม่มีรายละเอียดส่งมอบในแท็บ 4)
                                        </span>
                                      )}
                                      {vItem.paymentDate ? (
                                        <span className="rounded-md border border-[#9cd8bd] bg-[#dff5eb] px-2 py-0.5 text-[10.5px] font-semibold text-[#116947]">
                                          ✓ เบิกจ่ายแล้ว
                                        </span>
                                      ) : (
                                        <span className="rounded-md border border-[#e8c782] bg-[#fff3dc] px-2 py-0.5 text-[10.5px] font-medium text-[#8f5f0c]">
                                          รอเบิกจ่าย
                                        </span>
                                      )}
                                    </div>

                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                      <label className="block text-[11px] font-semibold text-[#1d4069]">
                                        เชื่อมโยงงวดส่งมอบงาน
                                        {installmentSummary.installmentCount > 0 ? (
                                          <select
                                            value={vItem.round}
                                            onChange={(e) =>
                                              setDraft((prev) => ({
                                                ...prev,
                                                voucherEntries: prev.voucherEntries.map(
                                                  (item, i) =>
                                                    i === vIdx
                                                      ? {
                                                          ...item,
                                                          round: Number(e.target.value),
                                                        }
                                                      : item,
                                                ),
                                              }))
                                            }
                                            className="mt-1 min-h-[38px] w-full rounded-lg border border-[#a8c4e4] bg-[#f4f8fe] px-2.5 py-1.5 text-xs font-normal text-[#132d4c]"
                                          >
                                            {Array.from(
                                              {
                                                length:
                                                  installmentSummary.installmentCount,
                                              },
                                              (_, i) => i + 1,
                                            ).map((r) => {
                                              const d = recordedDeliveries.find(
                                                (dlv) => dlv.round === r,
                                              );
                                              const cancelled =
                                                installmentSummary.cancelledRounds.includes(
                                                  r,
                                                );
                                              return (
                                                <option key={r} value={r}>
                                                  งวดที่ {r}
                                                  {cancelled ? ' (ยกเลิก)' : ''}
                                                  {d?.docNo ? ` · ${d.docNo}` : ''}
                                                  {d?.date
                                                    ? ` (${formatThaiDate(d.date)})`
                                                    : ''}
                                                </option>
                                              );
                                            })}
                                            {vItem.round >
                                              installmentSummary.installmentCount && (
                                              <option value={vItem.round}>
                                                งวดที่ {vItem.round} (กำหนดเอง)
                                              </option>
                                            )}
                                          </select>
                                        ) : recordedDeliveries.length > 0 ? (
                                          <select
                                            value={vItem.round}
                                            onChange={(e) =>
                                              setDraft((prev) => ({
                                                ...prev,
                                                voucherEntries: prev.voucherEntries.map(
                                                  (item, i) =>
                                                    i === vIdx
                                                      ? {
                                                          ...item,
                                                          round: Number(e.target.value),
                                                        }
                                                      : item,
                                                ),
                                              }))
                                            }
                                            className="mt-1 min-h-[38px] w-full rounded-lg border border-[#a8c4e4] bg-[#f4f8fe] px-2.5 py-1.5 text-xs font-normal text-[#132d4c]"
                                          >
                                            {recordedDeliveries.map((d) => (
                                              <option key={d.round} value={d.round}>
                                                งวดที่ {d.round}
                                                {d.docNo ? ` · ${d.docNo}` : ''}
                                                {d.date ? ` (${formatThaiDate(d.date)})` : ''}
                                              </option>
                                            ))}
                                            {!recordedDeliveries.some(
                                              (d) => d.round === vItem.round,
                                            ) && (
                                              <option value={vItem.round}>
                                                งวดที่ {vItem.round} (กำหนดเอง)
                                              </option>
                                            )}
                                          </select>
                                        ) : (
                                          <input
                                            type="number"
                                            min={1}
                                            step={1}
                                            value={vItem.round}
                                            onChange={(e) =>
                                              setDraft((prev) => ({
                                                ...prev,
                                                voucherEntries: prev.voucherEntries.map(
                                                  (item, i) =>
                                                    i === vIdx
                                                      ? {
                                                          ...item,
                                                          round: Math.max(
                                                            1,
                                                            Number(e.target.value) || 1,
                                                          ),
                                                        }
                                                      : item,
                                                ),
                                              }))
                                            }
                                            className="mt-1 min-h-[38px] w-full rounded-lg border border-[#a8c4e4] bg-[#f4f8fe] px-2.5 py-1.5 font-mono-num text-xs font-normal text-[#132d4c]"
                                          />
                                        )}
                                      </label>

                                      <label className="block text-[11px] font-semibold text-[#1d4069]">
                                        เลขที่ฎีกา
                                        <input
                                          type="text"
                                          maxLength={100}
                                          placeholder="เช่น ฎก.01/2570"
                                          value={vItem.voucherNo}
                                          onChange={(e) =>
                                            setDraft((prev) => ({
                                              ...prev,
                                              voucherEntries: prev.voucherEntries.map(
                                                (item, i) =>
                                                  i === vIdx
                                                    ? { ...item, voucherNo: e.target.value }
                                                    : item,
                                              ),
                                            }))
                                          }
                                          className="mt-1 min-h-[38px] w-full rounded-lg border border-[#a8c4e4] bg-[#f4f8fe] px-3 py-1.5 text-xs font-normal text-[#132d4c]"
                                        />
                                      </label>

                                      <label className="block text-[11px] font-semibold text-[#1d4069]">
                                        วันที่ฎีกา
                                        <input
                                          type="date"
                                          value={vItem.voucherDate}
                                          onChange={(e) =>
                                            setDraft((prev) => ({
                                              ...prev,
                                              voucherEntries: prev.voucherEntries.map(
                                                (item, i) =>
                                                  i === vIdx
                                                    ? {
                                                        ...item,
                                                        voucherDate: e.target.value,
                                                      }
                                                    : item,
                                              ),
                                            }))
                                          }
                                          className="mt-1 min-h-[38px] w-full rounded-lg border border-[#a8c4e4] bg-[#f4f8fe] px-3 py-1.5 font-mono-num text-xs font-normal text-[#132d4c]"
                                        />
                                      </label>

                                      <label className="block text-[11px] font-semibold text-[#1d4069]">
                                        จำนวนเงินตามฎีกา (บาท)
                                        <input
                                          type="number"
                                          min={0}
                                          step="0.01"
                                          placeholder="0.00"
                                          value={vItem.voucherAmount}
                                          onChange={(e) =>
                                            setDraft((prev) => ({
                                              ...prev,
                                              voucherEntries: prev.voucherEntries.map(
                                                (item, i) =>
                                                  i === vIdx
                                                    ? {
                                                        ...item,
                                                        voucherAmount:
                                                          e.target.value === ''
                                                            ? ''
                                                            : Number(e.target.value),
                                                      }
                                                    : item,
                                              ),
                                            }))
                                          }
                                          className="mt-1 min-h-[38px] w-full rounded-lg border border-[#a8c4e4] bg-[#f4f8fe] px-3 py-1.5 font-mono-num text-xs font-normal text-[#132d4c]"
                                        />
                                      </label>

                                      <label className="block text-[11px] font-semibold text-[#1d4069]">
                                        วันที่เบิกจ่าย
                                        <input
                                          type="date"
                                          value={vItem.paymentDate}
                                          onChange={(e) =>
                                            setDraft((prev) => ({
                                              ...prev,
                                              voucherEntries: prev.voucherEntries.map(
                                                (item, i) =>
                                                  i === vIdx
                                                    ? {
                                                        ...item,
                                                        paymentDate: e.target.value,
                                                      }
                                                    : item,
                                              ),
                                            }))
                                          }
                                          className="mt-1 min-h-[38px] w-full rounded-lg border border-[#a8c4e4] bg-[#f4f8fe] px-3 py-1.5 font-mono-num text-xs font-normal text-[#132d4c]"
                                        />
                                      </label>

                                      <label className="block text-[11px] font-semibold text-[#1d4069] sm:col-span-2 lg:col-span-1">
                                        รายละเอียดฎีกา / หมายเหตุ
                                        <input
                                          type="text"
                                          maxLength={2000}
                                          placeholder="เช่น ค่าจ้างประจำเดือน…"
                                          value={vItem.voucherNotes}
                                          onChange={(e) =>
                                            setDraft((prev) => ({
                                              ...prev,
                                              voucherEntries: prev.voucherEntries.map(
                                                (item, i) =>
                                                  i === vIdx
                                                    ? {
                                                        ...item,
                                                        voucherNotes: e.target.value,
                                                      }
                                                    : item,
                                              ),
                                            }))
                                          }
                                          className="mt-1 min-h-[38px] w-full rounded-lg border border-[#a8c4e4] bg-[#f4f8fe] px-3 py-1.5 text-xs font-normal text-[#132d4c]"
                                        />
                                      </label>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <p className="text-[11px] text-[#8aa0b7]">
                          สามารถเพิ่มฎีกาได้หลายงวดตามการส่งมอบงาน (เช่น จ้างเหมาบริการรายเดือน) · สถานะจะปรับเป็น “เสร็จสิ้น” อัตโนมัติเมื่อทุกงวดที่ส่งมอบบันทึกวันที่เบิกจ่ายครบถ้วน
                        </p>

                        {renderCategoryUpload(
                          'voucher',
                          'เอกสารฎีกา (PDF, Excel, Word, รูปภาพ, ZIP)',
                        )}
                      </div>
                    );
                  })()}
              </section>
            ))}

            <p className="mt-6 border-t border-[#cfe0f2] pt-4 text-[11px] leading-relaxed text-[#547091]">
              * ฟิลด์บังคับอยู่ในข้อมูลทั่วไป · ทุกแท็บบันทึกพร้อมกัน ·
              ระบบอ้างอิงขั้นตอนและสถานะงานตามแท็บหลักด้านบนอัตโนมัติ
            </p>

            {formError && (
              <div
                role="alert"
                className="mt-4 whitespace-pre-line rounded-md border border-[#edb0b0] bg-[#ffeaea] p-3 text-xs font-medium text-[#a32c2c]"
              >
                {formError}
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[#bdd3ec] bg-[#eef5fd] px-6 py-4">
            <span
              aria-live="polite"
              className="text-xs font-semibold text-[#2d5380] tabular-nums"
            >
              หมวดที่ {activeIndex + 1} จาก {PROJECT_TABS.length}
            </span>

            <div className="flex flex-wrap items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[36px] whitespace-nowrap rounded-xl border border-[#9fc0e6] bg-white px-4 py-1.5 text-xs font-semibold text-[#1b416e] hover:bg-[#dfecfc]"
              >
                ยกเลิก
              </button>

              {activeIndex < PROJECT_TABS.length - 1 && (
                <button
                  type="button"
                  onClick={() => setActiveTab(PROJECT_TABS[activeIndex + 1].id)}
                  className="min-h-[36px] whitespace-nowrap rounded-xl border border-[#0f3463] bg-[#0f3463] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#174888]"
                >
                  ถัดไป (หมวดที่ {activeIndex + 2})
                </button>
              )}

              <button
                type="submit"
                disabled={isUploading}
                className="inline-flex min-h-[36px] items-center gap-2 whitespace-nowrap rounded-xl border border-[#0b7055] bg-[#0c7a5c] px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#085c45] disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                บันทึกข้อมูลโครงการ
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
