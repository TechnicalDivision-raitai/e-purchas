import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  Code2,
  ExternalLink,
  FileText,
  FolderOpen,
  Inbox,
  RefreshCw,
  Search,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import appsScriptCode from '../../../google-apps-script/Code.gs?raw';
import {
  PROJECT_TABS,
  SARABAN_CATEGORY_META,
  SARABAN_PRIMARY_CATEGORIES,
} from '../../data/constants';
import { DEFAULT_GOOGLE_SCRIPT_URL } from '../../services/googleSync';
import { useProcurement } from '../../storage/useProcurementStore';
import type {
  ProjectTabId,
  SarabanDocCategory,
  SarabanQueueItem,
  SarabanQueueStatus,
} from '../../types/procurement';
import { formatThaiDate, formatThaiDateTime } from '../../utils/date';
import { formatMoney, normalizeCodeKey } from '../../utils/format';

interface SarabanQueuePageProps {
  onViewProject: (id: string, tab?: ProjectTabId) => void;
}

const QUEUE_STATUS_META: Record<
  SarabanQueueStatus,
  { label: string; className: string }
> = {
  pending: {
    label: 'รอตรวจสอบ',
    className: 'border-[#e8c782] bg-[#fff4dd] text-[#8f5d09]',
  },
  approved: {
    label: 'รับเข้าแล้ว',
    className: 'border-[#9cd8bd] bg-[#dff5eb] text-[#116947]',
  },
  rejected: {
    label: 'ปฏิเสธ',
    className: 'border-[#ebb6b6] bg-[#ffecec] text-[#a12828]',
  },
};

export function SarabanQueuePage({ onViewProject }: SarabanQueuePageProps) {
  const {
    state,
    user,
    sarabanQueue,
    sarabanQueueLoading,
    sarabanQueueError,
    refreshSarabanQueue,
    approveSarabanQueueItem,
    rejectSarabanQueueItem,
    removeSarabanQueueItem,
    showToast,
  } = useProcurement();

  const [statusFilter, setStatusFilter] = useState<SarabanQueueStatus | 'all'>('pending');
  const [categoryFilter, setCategoryFilter] = useState<SarabanDocCategory | 'all'>('all');
  const [query, setQuery] = useState<string>('');
  const [busyKey, setBusyKey] = useState<string>('');
  const [inspectTarget, setInspectTarget] = useState<SarabanQueueItem | null>(null);
  const [inspectProjectId, setInspectProjectId] = useState<string>('');
  const [rejectTarget, setRejectTarget] = useState<SarabanQueueItem | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState<string>('');
  const [deleteTarget, setDeleteTarget] = useState<SarabanQueueItem | null>(null);
  const [showScriptPanel, setShowScriptPanel] = useState<boolean>(false);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const toggleExpand = (key: string) => {
    setExpandedIds((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isAdmin = user.role === 'admin';

  const counts = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    for (const item of sarabanQueue) {
      if (item.queueStatus === 'pending') pending++;
      else if (item.queueStatus === 'approved') approved++;
      else if (item.queueStatus === 'rejected') rejected++;
    }
    return {
      total: sarabanQueue.length,
      pending,
      approved,
      rejected,
    };
  }, [sarabanQueue]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sarabanQueue.filter((item) => {
      if (statusFilter !== 'all' && item.queueStatus !== statusFilter) return false;
      if (categoryFilter !== 'all') {
        const matchCategory =
          categoryFilter === 'tor_approval'
            ? item.docCategory === 'tor_approval' || item.docCategory === 'ref_price'
            : item.docCategory === categoryFilter;
        if (!matchCategory) return false;
      }
      if (!q) return true;
      return [
        item.queueId,
        item.projectCode,
        item.bookNo,
        item.subject,
        item.submittedBy,
        item.idempotencyKey,
        item.attachment?.fileName,
        SARABAN_CATEGORY_META[item.docCategory]?.label,
      ].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [sarabanQueue, statusFilter, categoryFilter, query]);

  const resolveMatchedProject = (item: SarabanQueueItem) => {
    if (item.procurementId) {
      const byId = state.rows.find((r) => r.id === item.procurementId);
      if (byId) return byId;
    }
    if (item.projectCode) {
      const targetCode = normalizeCodeKey(item.projectCode);
      return state.rows.find((r) => normalizeCodeKey(r.code) === targetCode);
    }
    return undefined;
  };

  const handleOpenInspect = (item: SarabanQueueItem) => {
    const matched = resolveMatchedProject(item);
    setInspectTarget(item);
    setInspectProjectId(matched?.id || '');
  };

  const handleConfirmInspectApprove = async () => {
    if (!inspectTarget || !inspectProjectId) return;
    setBusyKey(inspectTarget.queueId);
    try {
      const ok = await approveSarabanQueueItem(inspectTarget, inspectProjectId);
      if (ok) {
        setInspectTarget(null);
        setInspectProjectId('');
      }
    } finally {
      setBusyKey('');
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectTarget) return;
    setBusyKey(rejectTarget.queueId);
    try {
      const ok = await rejectSarabanQueueItem(rejectTarget, rejectReasonInput);
      if (ok) {
        setRejectTarget(null);
        setRejectReasonInput('');
      }
    } finally {
      setBusyKey('');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setBusyKey(deleteTarget.queueId);
    try {
      const ok = await removeSarabanQueueItem(deleteTarget);
      if (ok) {
        setDeleteTarget(null);
      }
    } finally {
      setBusyKey('');
    }
  };

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(appsScriptCode);
      showToast('คัดลอกโค้ด Google Apps Script แล้ว');
    } catch {
      showToast('ไม่สามารถคัดลอกอัตโนมัติได้ กรุณาคัดลอกจากกล่องโค้ด');
    }
  };

  const getQueueDisplayTitle = (item: SarabanQueueItem): string => {
    if (item.subject?.trim()) return item.subject.trim();
    if (item.docCategory === 'general_approval') {
      return item.attachment?.fileName
        ? `เอกสารแนบขออนุมัติ: ${item.attachment.fileName}`
        : 'แนบไฟล์ขออนุมัติ (ข้อมูลทั่วไป)';
    }
    if (item.attachment?.fileName) {
      return `${SARABAN_CATEGORY_META[item.docCategory]?.label || item.docCategory} · ${item.attachment.fileName}`;
    }
    return SARABAN_CATEGORY_META[item.docCategory]?.label || '(ไม่ระบุเรื่อง)';
  };

  const renderPayloadChips = (item: SarabanQueueItem) => {
    const p = item.payload || {};
    const chips: Array<{ label: string; value: string; highlight?: boolean }> = [];

    if (item.docCategory === 'general_approval') {
      chips.push({
        label: 'การอัปเดต',
        value: 'แนบเฉพาะไฟล์เข้าหน้าข้อมูลทั่วไป (ไม่แก้ไขข้อมูลตั้งต้น)',
      });
    } else if (item.docCategory === 'tor_order') {
      const orderNo = String(p.orderNo || '').trim();
      const orderDate = String(p.orderDate || '').trim();
      const assigneeName = String(p.assigneeName || '').trim();
      const notes = String(p.notes || '').trim();
      if (orderNo && orderNo !== item.bookNo) {
        chips.push({ label: 'เลขที่คำสั่ง', value: orderNo });
      }
      if (orderDate && orderDate !== item.bookDate) {
        chips.push({ label: 'วันที่คำสั่ง', value: formatThaiDate(orderDate) });
      }
      if (assigneeName) {
        chips.push({ label: 'ผู้รับผิดชอบ', value: assigneeName });
      }
      if (notes) {
        chips.push({ label: 'หมายเหตุ', value: notes });
      }
    } else if (item.docCategory === 'tor_approval' || item.docCategory === 'ref_price') {
      const refPriceNum =
        p.refPrice !== undefined && p.refPrice !== null && String(p.refPrice).trim() !== ''
          ? Number(p.refPrice)
          : NaN;
      if (Number.isFinite(refPriceNum) && refPriceNum > 0) {
        chips.push({
          label: 'ราคากลาง',
          value: `${formatMoney(refPriceNum)} บาท`,
          highlight: true,
        });
      }
      if (p.torAuthor?.trim()) {
        chips.push({ label: 'ผู้จัดทำ TOR', value: p.torAuthor.trim() });
      }
      if (p.details?.trim()) {
        chips.push({ label: 'รายละเอียด', value: p.details.trim() });
      }
    } else if (item.docCategory === 'disbursement') {
      const instNum =
        p.installment !== undefined &&
        p.installment !== null &&
        String(p.installment).trim() !== ''
          ? Number(p.installment)
          : NaN;
      if (Number.isInteger(instNum) && instNum >= 1) {
        chips.push({ label: 'งวดที่', value: String(instNum) });
      }
      const amtNum =
        p.amount !== undefined && p.amount !== null && String(p.amount).trim() !== ''
          ? Number(p.amount)
          : NaN;
      if (Number.isFinite(amtNum) && amtNum >= 0) {
        chips.push({
          label: 'จำนวนเงิน',
          value: `${formatMoney(amtNum)} บาท`,
          highlight: true,
        });
      }
      const voucherNo = String(p.voucherNo || '').trim();
      if (voucherNo) {
        chips.push({ label: 'เลขที่ฎีกา', value: voucherNo });
      }
      if (p.status === 'paid' || p.status === 'pending') {
        chips.push({
          label: 'สถานะเบิกจ่าย',
          value: p.status === 'paid' ? 'เบิกจ่ายแล้ว' : 'รอดำเนินการ',
        });
      }
    }

    if (chips.length === 0) return null;

    return (
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        {chips.map((c, idx) => (
          <span
            key={idx}
            className="inline-flex items-center gap-1 rounded-md border border-[#dde8f5] bg-[#f5f9fe] px-2 py-0.5 text-[11px] text-[#355478]"
          >
            <span>{c.label}:</span>
            <b
              className={`font-mono-num ${
                c.highlight ? 'text-[#0d825b]' : 'text-[#122e4f]'
              }`}
            >
              {c.value}
            </b>
          </span>
        ))}
      </div>
    );
  };

  const inspectCategoryMeta = inspectTarget
    ? SARABAN_CATEGORY_META[inspectTarget.docCategory]
    : null;
  const inspectTargetTabLabel = inspectCategoryMeta
    ? PROJECT_TABS.find((t) => t.id === inspectCategoryMeta.targetTab)?.label ||
      inspectCategoryMeta.targetTab
    : '';

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4edf7] bg-white px-6 py-4">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-[#dde8f5] bg-[#f3f7fc] p-1">
          {(
            [
              ['pending', `รอตรวจสอบ (${counts.pending})`],
              ['approved', `รับเข้าแล้ว (${counts.approved})`],
              ['rejected', `ปฏิเสธ (${counts.rejected})`],
              ['all', `ทั้งหมด (${counts.total})`],
            ] as const
          ).map(([key, label]) => {
            const active = statusFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`rounded-lg px-3 py-1.5 text-[12px] transition ${
                  active
                    ? 'bg-white font-bold text-[#0f2d52] shadow-xs'
                    : 'font-medium text-[#4d698a] hover:text-[#12396b]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowScriptPanel((v) => !v)}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#cadbf0] bg-white px-3.5 py-2 text-[12px] font-semibold text-[#23456e] transition hover:border-[#8bb7e8] hover:bg-[#f2f7fe]"
          >
            <Code2 className="h-3.5 w-3.5 text-[#3b5d85]" />
            {showScriptPanel ? 'ซ่อนโค้ด Apps Script' : 'โค้ด Apps Script เชื่อมต่อ'}
          </button>

          <button
            type="button"
            disabled={sarabanQueueLoading}
            onClick={() => void refreshSarabanQueue(true)}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#0d9468] px-3.5 py-2 text-[12px] font-semibold text-white shadow-xs transition hover:bg-[#0a7a55] disabled:opacity-55"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${sarabanQueueLoading ? 'animate-spin' : ''}`}
            />
            รีเฟรชคิว
          </button>
        </div>
      </div>

      {counts.total > 4 && (
        <div className="flex flex-wrap items-center gap-2.5 border-b border-[#eaf1f9] bg-[#fafcff] px-6 py-2.5">
          <select
            aria-label="กรองหมวดเอกสาร"
            value={categoryFilter}
            onChange={(e) =>
              setCategoryFilter(e.target.value as SarabanDocCategory | 'all')
            }
            className="min-h-[32px] rounded-md border border-[#c5d9ef] bg-white px-2.5 py-1 text-xs font-medium text-[#173659]"
          >
            <option value="all">ทุกหมวดเอกสาร (4 หมวดหมู่)</option>
            {SARABAN_PRIMARY_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {SARABAN_CATEGORY_META[cat].label}
              </option>
            ))}
          </select>

          <div className="relative min-w-[200px] max-w-[360px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[#5c7c9e]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาเลขที่หนังสือ เรื่อง รหัสโครงการ ผู้ส่ง…"
              className="min-h-[32px] w-full rounded-md border border-[#c5d9ef] bg-white py-1 pr-3 pl-8 text-xs text-[#173659]"
            />
          </div>
        </div>
      )}

      {sarabanQueueError && (
        <div className="mx-6 mt-4 rounded-xl border border-[#f2c48c] bg-[#fff7eb] px-4 py-3 text-xs text-[#7c4d0c]">
          <b>แจ้งเตือนการเชื่อมต่อคิวสารบรรณ:</b> {sarabanQueueError} ·
          หากยังไม่ได้อัปเดตฟังก์ชันใน Google Apps Script สามารถกด{' '}
          <button
            type="button"
            onClick={() => setShowScriptPanel(true)}
            className="font-semibold text-[#0f4ca6] underline"
          >
            “โค้ด Apps Script เชื่อมต่อ”
          </button>{' '}
          เพื่อคัดลอกนำไปวางและ Deploy ใหม่
        </div>
      )}

      <div className="p-6">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#c5d9ef] bg-[#f8fbff] px-6 py-12 text-center">
            <Inbox className="h-8 w-8 text-[#7da0c4]" />
            <p className="mt-2.5 text-sm font-semibold text-[#23456e]">
              {sarabanQueueLoading
                ? 'กำลังโหลดคิวจากระบบสารบรรณ…'
                : statusFilter === 'pending'
                  ? 'ไม่มีเอกสารรอตรวจสอบจากระบบสารบรรณ'
                  : 'ยังไม่มีรายการคิวในตัวกรองนี้'}
            </p>
            <p className="mt-1 text-xs text-[#597494]">
              รองรับเอกสาร 4 หมวดหมู่: ขออนุมัติ (ข้อมูลทั่วไป), แต่งตั้งผู้รับผิดชอบ TOR และราคากลาง, จัดทำ TOR และราคากลาง และฎีกาเบิกจ่ายเงิน
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => {
              const catMeta = SARABAN_CATEGORY_META[item.docCategory];
              const statusMeta = QUEUE_STATUS_META[item.queueStatus];
              const matched = resolveMatchedProject(item);
              const isBusy = busyKey === item.queueId;
              const itemKey = item.queueId || item.idempotencyKey;
              const isExpanded = Boolean(expandedIds[itemKey]);

              return (
                <article
                  key={itemKey}
                  className="rounded-xl border border-[#d6e4f2] bg-white px-5 py-3.5 transition hover:border-[#8bb7e8] hover:shadow-xs"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-[#eef4fc] px-2 py-0.5 font-mono-num text-[11.5px] font-bold text-[#144b96]">
                          {item.queueId || '—'}
                        </span>
                      </div>

                      <div className="text-[13.5px] leading-snug">
                        {matched ? (
                          <button
                            type="button"
                            onClick={() => onViewProject(matched.id, catMeta?.targetTab)}
                            className="text-left font-bold text-[#0f2a4a] transition hover:text-[#0d825b] hover:underline"
                          >
                            <span className="font-mono-num text-[#0d825b]">
                              [{matched.code}]
                            </span>{' '}
                            {matched.title}
                          </button>
                        ) : (
                          <span className="font-semibold text-[#b45309]">
                            ยังไม่พบโครงการตรงกัน (
                            {item.projectCode || item.procurementId || 'รอเลือกโครงการ'})
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() => toggleExpand(itemKey)}
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-[#c5d9ef] bg-[#f5f9fe] px-2.5 py-1.5 text-[11.5px] font-semibold text-[#23456e] transition hover:border-[#8bb7e8] hover:bg-[#e6f0fc]"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="h-3.5 w-3.5" />
                            ซ่อนรายละเอียด
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-3.5 w-3.5" />
                            รายละเอียด
                          </>
                        )}
                      </button>

                      {isAdmin && item.queueStatus === 'pending' && (
                        <>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleOpenInspect(item)}
                            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#0d9468] px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-xs transition hover:bg-[#0a7a55] disabled:opacity-45"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            ตรวจสอบ &amp; รับเข้า
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => {
                              setRejectTarget(item);
                              setRejectReasonInput('');
                            }}
                            className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-[#d1dfee] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#334e6f] transition hover:border-[#e3a3a3] hover:bg-[#fff5f5] hover:text-[#a82c2c] disabled:opacity-45"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            ปฏิเสธ
                          </button>
                        </>
                      )}

                      {item.queueStatus !== 'pending' && matched && (
                        <button
                          type="button"
                          onClick={() => onViewProject(matched.id, catMeta?.targetTab)}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-[#c5d9ef] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#144b96] transition hover:bg-[#eef5ff]"
                        >
                          <FolderOpen className="h-3.5 w-3.5" />
                          ดูโครงการ
                        </button>
                      )}

                      {isAdmin && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setDeleteTarget(item)}
                          title="ลบรายการคิว"
                          aria-label={`ลบคิว ${item.queueId}`}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-[#d1dfee] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#4b6584] transition hover:border-[#edb8b8] hover:bg-[#fff5f5] hover:text-[#a82c2c] disabled:opacity-45"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          ลบคิว
                        </button>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 space-y-2 border-t border-[#e6eff8] pt-3">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-[#5c7696]">
                        <span className="rounded border border-[#c5d9ef] bg-[#f5f9ff] px-2 py-0.5 font-semibold text-[#17406e]">
                          {catMeta?.label || item.docCategory}
                        </span>
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[10.5px] font-semibold ${statusMeta.className}`}
                        >
                          {statusMeta.label}
                        </span>
                        <span>·</span>
                        <span>ส่งโดย {item.submittedBy || 'ไม่ระบุ'}</span>
                        {item.createdAt && (
                          <>
                            <span>·</span>
                            <span className="tabular-nums">
                              {formatThaiDateTime(item.createdAt)}
                            </span>
                          </>
                        )}
                      </div>

                      <div className="text-[13px] font-semibold leading-snug text-[#153152]">
                        {getQueueDisplayTitle(item)}
                      </div>

                      {(item.bookNo || item.bookDate || item.attachment?.fileUrl) && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-[#4b688a]">
                          {item.bookNo && (
                            <span>
                              เลขที่หนังสือ:{' '}
                              <b className="text-[#153152]">{item.bookNo}</b>
                            </span>
                          )}
                          {item.bookDate && (
                            <span>
                              ลงวันที่:{' '}
                              <b className="text-[#153152]">
                                {formatThaiDate(item.bookDate)}
                              </b>
                            </span>
                          )}
                          {item.attachment?.fileUrl ? (
                            <a
                              href={item.attachment.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={item.attachment.fileName || 'เปิดไฟล์แนบ'}
                              className="inline-flex items-center gap-1 rounded-md border border-[#bdd6f2] bg-[#eef5ff] px-2 py-0.5 text-[11.5px] font-semibold text-[#1552a3] transition hover:border-[#85b6eb] hover:bg-[#dcebfa]"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              <span className="max-w-[220px] truncate">
                                {item.attachment.fileName || 'เปิดไฟล์แนบ'}
                              </span>
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                          ) : (
                            <span className="text-[11.5px] text-[#8ba0b8]">
                              ไม่มีไฟล์แนบ
                            </span>
                          )}
                        </div>
                      )}

                      {!item.bookNo && !item.bookDate && !item.attachment?.fileUrl && (
                        <div className="text-[11.5px] text-[#8ba0b8]">ไม่มีไฟล์แนบ</div>
                      )}

                      {renderPayloadChips(item)}

                      {item.queueStatus !== 'pending' && (
                        <div className="pt-0.5 text-[11px] text-[#557191]">
                          ผู้ตรวจสอบ:{' '}
                          <b className="text-[#153152]">{item.reviewedBy || '—'}</b>
                          {item.reviewedAt
                            ? ` · เวลา ${formatThaiDateTime(item.reviewedAt)}`
                            : ''}
                          {item.queueStatus === 'rejected' && item.rejectReason && (
                            <span className="ml-2 font-medium text-[#a12828]">
                              · เหตุผล: {item.rejectReason}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {showScriptPanel && (
        <div className="mx-6 mb-6 overflow-hidden rounded-xl border border-[#9fc0e6] bg-[#fafcff]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#c2d8f0] bg-[#eef4fc] px-5 py-3.5">
            <div>
              <h3 className="text-xs font-semibold text-[#12396b]">
                โค้ด Google Apps Script Backend (`SarabanProcurementQueue`)
              </h3>
              <p className="mt-0.5 text-[11px] text-[#4c6a8d]">
                Endpoint ปัจจุบัน:{' '}
                <span className="font-mono-num">{DEFAULT_GOOGLE_SCRIPT_URL}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleCopyScript()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0f4ca6] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#0b3a80]"
            >
              <ClipboardCopy className="h-3.5 w-3.5" />
              คัดลอกโค้ด Apps Script
            </button>
          </div>
          <div className="space-y-3 p-5 text-xs">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-[#d4e3f3] bg-white p-3">
                <div className="font-semibold text-[#12396b]">GET Endpoints</div>
                <ul className="mt-1.5 space-y-1 font-mono-num text-[11px] text-[#355478]">
                  <li>?action=getProcurementOptions&amp;fiscalYear=all</li>
                  <li>?action=getProcurementQueue&amp;queueStatus=all&amp;t=...</li>
                </ul>
              </div>
              <div className="rounded-lg border border-[#d4e3f3] bg-white p-3">
                <div className="font-semibold text-[#12396b]">
                  POST Endpoints (text/plain;charset=utf-8)
                </div>
                <ul className="mt-1.5 space-y-1 font-mono-num text-[11px] text-[#355478]">
                  <li>action: pushProcurementQueue (idempotencyKey)</li>
                  <li>action: reviewProcurementQueue (approved / rejected)</li>
                  <li>action: deleteProcurementQueue (pending / approved / rejected)</li>
                </ul>
              </div>
            </div>

            <pre className="max-h-[320px] overflow-auto rounded-lg border border-[#24446b] bg-[#0b1f38] p-4 font-mono-num text-[11px] leading-relaxed text-[#d9ebff]">
              {appsScriptCode}
            </pre>
          </div>
        </div>
      )}

      {inspectTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="inspect-queue-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#061830]/75 p-4 backdrop-blur-[2px]"
        >
          <div className="w-full max-w-[540px] rounded-xl border border-[#9fc0e6] bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-[#e6f0fc] px-2 py-0.5 font-mono-num text-[11px] font-bold text-[#0f4ca6]">
                    {inspectTarget.queueId}
                  </span>
                  <span className="rounded border border-[#a8c6e8] bg-[#f5f9ff] px-2 py-0.5 text-[11px] font-semibold text-[#17406e]">
                    {inspectCategoryMeta?.label || inspectTarget.docCategory}
                  </span>
                </div>
                <h3
                  id="inspect-queue-title"
                  className="mt-2 text-sm font-bold text-[#0f2a4a]"
                >
                  ตรวจสอบและยืนยันรับเอกสารเข้าโครงการ
                </h3>
              </div>
            </div>

            <div className="mt-3 space-y-2 rounded-lg border border-[#d6e4f2] bg-[#f7fafe] p-3.5 text-xs text-[#284566]">
              <div className="font-semibold text-[#0f2a4a]">
                {getQueueDisplayTitle(inspectTarget)}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px]">
                {inspectTarget.bookNo && (
                  <span>
                    เลขที่หนังสือ: <b>{inspectTarget.bookNo}</b>
                  </span>
                )}
                {inspectTarget.bookDate && (
                  <span>
                    ลงวันที่: <b>{formatThaiDate(inspectTarget.bookDate)}</b>
                  </span>
                )}
                <span>
                  ผู้ส่ง: <b>{inspectTarget.submittedBy || '—'}</b>
                </span>
              </div>
              {renderPayloadChips(inspectTarget)}
              {inspectTarget.attachment?.fileUrl && (
                <div className="pt-1">
                  <a
                    href={inspectTarget.attachment.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-[#0f4ca6] underline"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    เปิดตรวจสอบไฟล์แนบ ({inspectTarget.attachment.fileName || 'ไฟล์แนบ'})
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>

            <label className="mt-4 block text-xs font-semibold text-[#1d4069]">
              โครงการปลายทางที่จะรับข้อมูลเข้า *
              <select
                value={inspectProjectId}
                onChange={(e) => setInspectProjectId(e.target.value)}
                className="mt-1.5 min-h-[38px] w-full rounded-lg border border-[#9fc0e6] bg-white px-3 py-1.5 text-xs font-medium text-[#132d4c]"
              >
                <option value="">
                  -- เลือกโครงการ (อ้างอิงจากสารบรรณ:{' '}
                  {inspectTarget.projectCode || inspectTarget.procurementId || 'ไม่ระบุ'}) --
                </option>
                {state.rows.map((r) => (
                  <option key={r.id} value={r.id}>
                    [{r.code}] {r.title}
                  </option>
                ))}
              </select>
            </label>

            {inspectTargetTabLabel && (
              <p className="mt-2 text-[11px] leading-relaxed text-[#4b688a]">
                {inspectTarget.docCategory === 'general_approval' ? (
                  <>
                    ระบบจะแนบเฉพาะไฟล์เข้าแท็บ{' '}
                    <b className="text-[#0d825b]">“{inspectTargetTabLabel}”</b>{' '}
                    ของโครงการที่เลือกโดย<b>ไม่แก้ไขข้อมูลตั้งต้นใดๆ</b> พร้อมส่งสถานะ{' '}
                    <b className="text-[#0d825b]">approved</b> กลับไปยังระบบสารบรรณ
                  </>
                ) : (
                  <>
                    ระบบจะอัปเดตเฉพาะช่องที่มีค่าส่งมาและแนบไฟล์เข้าแท็บ{' '}
                    <b className="text-[#0d825b]">“{inspectTargetTabLabel}”</b>{' '}
                    โดยคงค่าเดิมของช่องที่ไม่ได้ส่งไว้ตามเดิม พร้อมส่งสถานะ{' '}
                    <b className="text-[#0d825b]">approved</b> กลับไปยังระบบสารบรรณ
                  </>
                )}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={Boolean(busyKey)}
                onClick={() => {
                  setInspectTarget(null);
                  setInspectProjectId('');
                }}
                className="rounded-lg border border-[#afc8e4] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#274469] hover:bg-[#edf4fc]"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={!inspectProjectId || Boolean(busyKey)}
                onClick={() => void handleConfirmInspectApprove()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0d9468] px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#0a7a55] disabled:opacity-45"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                ยืนยันรับเข้าโครงการ
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-queue-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#061830]/75 p-4 backdrop-blur-[2px]"
        >
          <div className="w-full max-w-[440px] rounded-xl border border-[#9fc0e6] bg-white p-5 shadow-2xl">
            <h3 id="reject-queue-title" className="text-sm font-bold text-[#0f2a4a]">
              ปฏิเสธ / ส่งกลับคิวจากสารบรรณ
            </h3>
            <p className="mt-1.5 text-xs text-[#4b688a]">
              รายการ <b className="font-mono-num">{rejectTarget.queueId}</b> ·{' '}
              {getQueueDisplayTitle(rejectTarget)}
            </p>
            <label className="mt-3 block text-xs font-semibold text-[#1d4069]">
              เหตุผลการปฏิเสธ / ส่งกลับ *
              <textarea
                rows={3}
                value={rejectReasonInput}
                onChange={(e) => setRejectReasonInput(e.target.value)}
                placeholder="ระบุเหตุผลเพื่อส่งสถานะกลับไปยังระบบสารบรรณ…"
                className="mt-1.5 w-full rounded-lg border border-[#a8c4e4] bg-[#f4f8fe] p-2.5 text-xs font-normal text-[#132d4c]"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="rounded-lg border border-[#afc8e4] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#274469] hover:bg-[#edf4fc]"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={!rejectReasonInput.trim() || Boolean(busyKey)}
                onClick={() => void handleConfirmReject()}
                className="inline-flex items-center gap-1 rounded-lg bg-[#b82828] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#961d1d] disabled:opacity-45"
              >
                <Check className="h-3.5 w-3.5" />
                ยืนยันปฏิเสธคิว
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-queue-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#061830]/75 p-4 backdrop-blur-[2px]"
        >
          <div className="w-full max-w-[420px] rounded-xl border border-[#9fc0e6] bg-white p-5 shadow-2xl">
            <h3 id="delete-queue-title" className="text-sm font-bold text-[#0f2a4a]">
              ยืนยันการลบรายการคิว
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-[#365375]">
              ต้องการลบคิว <b className="font-mono-num">{deleteTarget.queueId}</b> (
              {getQueueDisplayTitle(deleteTarget)}) ออกจาก{' '}
              <span className="font-mono-num">SarabanProcurementQueue</span> หรือไม่?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-[#afc8e4] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#274469] hover:bg-[#edf4fc]"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={Boolean(busyKey)}
                onClick={() => void handleConfirmDelete()}
                className="rounded-lg bg-[#b82828] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#961d1d] disabled:opacity-45"
              >
                ยืนยันลบคิว
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
