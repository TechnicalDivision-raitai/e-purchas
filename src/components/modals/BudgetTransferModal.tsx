import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  PlusCircle,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { EXTERNAL_TRANSFER_SOURCE_PRESETS } from '../../data/constants';
import {
  calculateBudgetPoolUsage,
  validateBudgetTransfer,
} from '../../domain/budgetPools';
import { formatBudgetHierarchyPath } from '../../domain/expenseCategories';
import { useProcurement } from '../../storage/useProcurementStore';
import type { BudgetTransfer, BudgetTransferType } from '../../types/procurement';
import {
  currentFiscalYear,
  getFiscalYearOptions,
  todayBangkok,
  uid,
} from '../../utils/date';
import { formatMoney } from '../../utils/format';
import {
  AutoSuggestInput,
  collectNormalizedSuggestions,
} from '../common/AutoSuggestInput';

interface BudgetTransferModalProps {
  open: boolean;
  initialPoolId?: string;
  initialYear?: number;
  onClose: () => void;
}

export function BudgetTransferModal({
  open,
  initialPoolId,
  initialYear,
  onClose,
}: BudgetTransferModalProps) {
  const { state, user, saveBudgetTransfer, showToast } = useProcurement();
  const budgetPools = state.budgetPools || [];
  const budgetTransfers = state.budgetTransfers || [];

  const [transferType, setTransferType] =
    useState<BudgetTransferType>('between_pools');
  const [year, setYear] = useState<number>(initialYear || currentFiscalYear());
  const [transferDate, setTransferDate] = useState<string>(todayBangkok());
  const [docNo, setDocNo] = useState<string>('');
  const [fromPoolId, setFromPoolId] = useState<string>('');
  const [externalSource, setExternalSource] = useState<string>('');
  const [toPoolId, setToPoolId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [formError, setFormError] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    const preselectedPool = initialPoolId
      ? budgetPools.find((p) => p.id === initialPoolId)
      : undefined;
    const resolvedYear =
      preselectedPool?.year || initialYear || currentFiscalYear();

    setTransferType('between_pools');
    setYear(resolvedYear);
    setTransferDate(todayBangkok());
    setDocNo('');
    setFromPoolId(preselectedPool?.id || '');
    setExternalSource('');
    setToPoolId('');
    setAmount('');
    setReason('');
    setFormError('');
  }, [open, initialPoolId, initialYear, budgetPools]);

  const fiscalYearOptions = useMemo(() => {
    const base = getFiscalYearOptions();
    const extra = budgetPools.map((p) => Number(p.year));
    return [...new Set([...base, ...extra])]
      .filter((y) => Number.isFinite(y) && y > 0)
      .sort((a, b) => b - a);
  }, [budgetPools]);

  const yearPoolUsages = useMemo(() => {
    return budgetPools
      .filter((p) => Number(p.year) === Number(year))
      .sort((a, b) => a.name.localeCompare(b.name, 'th'))
      .map((pool) => calculateBudgetPoolUsage(pool, state.rows));
  }, [budgetPools, year, state.rows]);

  const externalSourceSuggestions = useMemo(
    () =>
      collectNormalizedSuggestions([
        ...EXTERNAL_TRANSFER_SOURCE_PRESETS,
        ...budgetTransfers
          .filter((t) => t.transferType === 'from_external')
          .map((t) => t.externalSource),
      ]),
    [budgetTransfers],
  );

  const numericAmount = useMemo(() => {
    const n = Number(amount);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
  }, [amount]);

  const sourceUsage = useMemo(
    () => yearPoolUsages.find((u) => u.pool.id === fromPoolId),
    [yearPoolUsages, fromPoolId],
  );
  const targetUsage = useMemo(
    () => yearPoolUsages.find((u) => u.pool.id === toPoolId),
    [yearPoolUsages, toPoolId],
  );

  const handleYearChange = (nextYear: number) => {
    setYear(nextYear);
    setFromPoolId('');
    setToPoolId('');
    setFormError('');
  };

  const handleModeChange = (nextMode: BudgetTransferType) => {
    setTransferType(nextMode);
    setFormError('');
    if (nextMode === 'from_external' && !toPoolId && fromPoolId) {
      setToPoolId(fromPoolId);
      setFromPoolId('');
    }
  };

  const handleSwapPools = () => {
    if (transferType !== 'between_pools') return;
    setFromPoolId(toPoolId);
    setToPoolId(fromPoolId);
    setFormError('');
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    const payload: BudgetTransfer = {
      id: `tr-${uid()}`,
      year: Number(year) || currentFiscalYear(),
      transferDate: transferDate.trim(),
      docNo: docNo.trim(),
      transferType,
      fromPoolId: transferType === 'between_pools' ? fromPoolId : undefined,
      fromPoolName:
        transferType === 'between_pools' ? sourceUsage?.pool.name : undefined,
      externalSource:
        transferType === 'from_external' ? externalSource.trim() : undefined,
      toPoolId,
      toPoolName: targetUsage?.pool.name || '',
      amount: numericAmount,
      reason: reason.trim(),
      createdBy: user.name,
      createdAt: new Date().toISOString(),
    };

    const validation = validateBudgetTransfer(payload, budgetPools, state.rows);
    if (validation.errors.length > 0) {
      setFormError(validation.errors.join('\n'));
      return;
    }

    const ok = saveBudgetTransfer(payload);
    if (ok) {
      const sourceLabel =
        transferType === 'between_pools'
          ? sourceUsage?.pool.name || 'หมวดต้นทาง'
          : externalSource.trim();
      showToast(
        `บันทึกการโอนงบประมาณ ฿${formatMoney(numericAmount)} จาก "${sourceLabel}" เข้า "${targetUsage?.pool.name || 'หมวดปลายทาง'}" แล้ว`,
      );
      onClose();
    }
  };

  if (!open) return null;

  const sourceInsufficient =
    transferType === 'between_pools' &&
    sourceUsage !== undefined &&
    numericAmount > 0 &&
    numericAmount - sourceUsage.remainingAmount > 0.005;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="budget-transfer-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#061830]/70 p-4 backdrop-blur-[2px]"
    >
      <div className="flex max-h-[92vh] w-full max-w-[680px] flex-col overflow-hidden rounded-xl border border-[#8fb3dc] bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[#b9d2ee] bg-gradient-to-r from-[#eef5fd] to-[#dcebfa] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#124fa8] text-white">
              <ArrowLeftRight className="h-4 w-4" />
            </span>
            <div>
              <h3
                id="budget-transfer-modal-title"
                className="text-sm font-bold text-[#0f2c52]"
              >
                โอนเงินงบประมาณ (BUDGET DATA)
              </h3>
              <p className="text-[11px] text-[#4c6b90]">
                รองรับทั้งโอนระหว่างหมวดงบในระบบ และโอนเข้าจากงบประมาณอื่น
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="rounded-md p-1 text-[#48668a] hover:bg-white/80 hover:text-[#112e54]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            <div>
              <div className="mb-1.5 text-[11.5px] font-semibold text-[#1d4069]">
                รูปแบบการโอนเงินงบประมาณ
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => handleModeChange('between_pools')}
                  className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition ${
                    transferType === 'between_pools'
                      ? 'border-[#1251a8] bg-[#edf5ff] ring-1 ring-[#1251a8]'
                      : 'border-[#c5daf0] bg-white hover:bg-[#f6fafe]'
                  }`}
                >
                  <span
                    className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg ${
                      transferType === 'between_pools'
                        ? 'bg-[#1251a8] text-white'
                        : 'bg-[#e3effc] text-[#1a529e]'
                    }`}
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                  </span>
                  <span>
                    <span className="block text-xs font-bold text-[#0f2c52]">
                      โอนระหว่างหมวดงบ
                    </span>
                    <span className="mt-0.5 block text-[11px] text-[#4f6d90]">
                      หักลดจากหมวดหนึ่งใน BUDGET DATA ไปเพิ่มให้อีกหมวดหนึ่ง
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleModeChange('from_external')}
                  className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition ${
                    transferType === 'from_external'
                      ? 'border-[#0f766e] bg-[#ecfdf5] ring-1 ring-[#0f766e]'
                      : 'border-[#c5daf0] bg-white hover:bg-[#f6fafe]'
                  }`}
                >
                  <span
                    className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg ${
                      transferType === 'from_external'
                        ? 'bg-[#0f766e] text-white'
                        : 'bg-[#dff5eb] text-[#0f6b47]'
                    }`}
                  >
                    <PlusCircle className="h-3.5 w-3.5" />
                  </span>
                  <span>
                    <span className="block text-xs font-bold text-[#0f2c52]">
                      โอนเข้าจากงบอื่นๆ
                    </span>
                    <span className="mt-0.5 block text-[11px] text-[#4f6d90]">
                      รับโอนเพิ่มจากงบกลาง เงินสะสม กองอื่น หรือแหล่งงบภายนอก
                    </span>
                  </span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
              <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                ปีงบประมาณ *
                <select
                  value={year}
                  onChange={(e) => handleYearChange(Number(e.target.value))}
                  className="mt-1.5 min-h-[38px] w-full rounded-lg border border-[#a8c4e4] bg-white px-3 py-2 text-xs font-normal text-[#132d4c]"
                >
                  {fiscalYearOptions.map((y) => (
                    <option key={y} value={y}>
                      ปีงบฯ {y}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                วันที่โอน *
                <input
                  type="date"
                  required
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                  className="mt-1.5 min-h-[38px] w-full rounded-lg border border-[#a8c4e4] bg-white px-3 py-2 font-mono-num text-xs font-normal text-[#132d4c]"
                />
              </label>

              <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                เลขที่บันทึก / ญัตติ / คำสั่ง
                <input
                  type="text"
                  maxLength={100}
                  placeholder="เช่น บันทึกที่ อบ 73903/..."
                  value={docNo}
                  onChange={(e) => setDocNo(e.target.value)}
                  className="mt-1.5 min-h-[38px] w-full rounded-lg border border-[#a8c4e4] bg-white px-3 py-2 text-xs font-normal text-[#132d4c]"
                />
              </label>
            </div>

            {yearPoolUsages.length === 0 ? (
              <div className="rounded-xl border border-[#ebd09c] bg-[#fff8e8] p-4 text-xs text-[#7c4d0c]">
                <div className="flex items-center gap-2 font-bold">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-[#c27803]" />
                  ไม่พบหมวด BUDGET DATA ในปีงบฯ {year}
                </div>
                <p className="mt-1 text-[11px]">
                  กรุณาเพิ่มหมวดวงเงินงบประมาณในปีงบฯ {year} ก่อน หรือเลือกปีงบประมาณอื่นที่มีหมวดงบอยู่แล้ว
                </p>
              </div>
            ) : transferType === 'between_pools' ? (
              <div className="space-y-3 rounded-xl border border-[#c6daf0] bg-[#f7fbff] p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11.5px] font-bold text-[#143a68]">
                    ระบุหมวดงบต้นทาง และหมวดงบปลายทาง (ปีงบฯ {year})
                  </span>
                  <button
                    type="button"
                    onClick={handleSwapPools}
                    disabled={!fromPoolId && !toPoolId}
                    className="inline-flex items-center gap-1 rounded-md border border-[#9fc0e6] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#134a96] transition hover:bg-[#edf4fc] disabled:opacity-45"
                  >
                    <ArrowLeftRight className="h-3 w-3" />
                    สลับต้นทาง ⇄ ปลายทาง
                  </button>
                </div>

                <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                  1. หมวดงบต้นทาง (โอนลด / จ่ายออก) *
                  <select
                    value={fromPoolId}
                    onChange={(e) => {
                      const nextFrom = e.target.value;
                      setFromPoolId(nextFrom);
                      if (nextFrom && nextFrom === toPoolId) setToPoolId('');
                      setFormError('');
                    }}
                    className="mt-1.5 min-h-[38px] w-full rounded-lg border border-[#a8c4e4] bg-white px-3 py-2 text-xs font-normal text-[#132d4c]"
                  >
                    <option value="">-- เลือกหมวดงบต้นทาง --</option>
                    {yearPoolUsages.map((u) => {
                      const hierarchy = formatBudgetHierarchyPath(u.pool);
                      return (
                        <option key={u.pool.id} value={u.pool.id}>
                          {u.pool.name}
                          {hierarchy ? ` (${hierarchy})` : ''} — คงเหลือ ฿
                          {formatMoney(u.remainingAmount)}
                        </option>
                      );
                    })}
                  </select>
                </label>

                <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                  2. หมวดงบปลายทาง (โอนเพิ่ม / รับเข้า) *
                  <select
                    value={toPoolId}
                    onChange={(e) => {
                      setToPoolId(e.target.value);
                      setFormError('');
                    }}
                    className="mt-1.5 min-h-[38px] w-full rounded-lg border border-[#a8c4e4] bg-white px-3 py-2 text-xs font-normal text-[#132d4c]"
                  >
                    <option value="">-- เลือกหมวดงบปลายทาง --</option>
                    {yearPoolUsages
                      .filter((u) => u.pool.id !== fromPoolId)
                      .map((u) => {
                        const hierarchy = formatBudgetHierarchyPath(u.pool);
                        return (
                          <option key={u.pool.id} value={u.pool.id}>
                            {u.pool.name}
                            {hierarchy ? ` (${hierarchy})` : ''} — ตั้งไว้ ฿
                            {formatMoney(u.pool.allocatedBudget)} (คงเหลือ ฿
                            {formatMoney(u.remainingAmount)})
                          </option>
                        );
                      })}
                  </select>
                </label>
              </div>
            ) : (
              <div className="space-y-3 rounded-xl border border-[#b7e2cf] bg-[#f4fbf8] p-3.5">
                <div className="text-[11.5px] font-bold text-[#0f5c41]">
                  ระบุแหล่งงบประมาณต้นทาง และหมวดงบปลายทาง (ปีงบฯ {year})
                </div>

                <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                  1. แหล่งงบประมาณต้นทาง (โอนเข้าจากงบอื่นๆ) *
                  <div className="mt-1.5">
                    <AutoSuggestInput
                      maxLength={200}
                      placeholder="เลือกหรือพิมพ์ เช่น งบกลาง, เงินสะสม, โอนเพิ่มจากกองคลัง"
                      value={externalSource}
                      suggestions={externalSourceSuggestions}
                      onChangeValue={(val) => {
                        setExternalSource(val);
                        setFormError('');
                      }}
                      className="min-h-[38px] w-full rounded-lg border border-[#9fd3be] bg-white px-3 py-2 text-xs font-normal text-[#132d4c]"
                    />
                  </div>
                </label>

                <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                  2. หมวดงบปลายทางใน BUDGET DATA (รับโอนเข้า) *
                  <select
                    value={toPoolId}
                    onChange={(e) => {
                      setToPoolId(e.target.value);
                      setFormError('');
                    }}
                    className="mt-1.5 min-h-[38px] w-full rounded-lg border border-[#9fd3be] bg-white px-3 py-2 text-xs font-normal text-[#132d4c]"
                  >
                    <option value="">-- เลือกหมวดงบปลายทาง --</option>
                    {yearPoolUsages.map((u) => {
                      const hierarchy = formatBudgetHierarchyPath(u.pool);
                      return (
                        <option key={u.pool.id} value={u.pool.id}>
                          {u.pool.name}
                          {hierarchy ? ` (${hierarchy})` : ''} — ตั้งไว้ ฿
                          {formatMoney(u.pool.allocatedBudget)} (คงเหลือ ฿
                          {formatMoney(u.remainingAmount)})
                        </option>
                      );
                    })}
                  </select>
                </label>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                จำนวนเงินที่โอน (บาท) *
                <input
                  type="number"
                  required
                  min={0.01}
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setFormError('');
                  }}
                  className="mt-1.5 min-h-[38px] w-full rounded-lg border border-[#a8c4e4] bg-white px-3 py-2 font-mono-num text-xs font-semibold text-[#132d4c]"
                />
              </label>

              <label className="block text-[11.5px] font-semibold text-[#1d4069]">
                ผู้บันทึก
                <input
                  type="text"
                  readOnly
                  value={user.name}
                  className="mt-1.5 min-h-[38px] w-full rounded-lg border border-[#d0e0f0] bg-[#f4f8fc] px-3 py-2 text-xs font-normal text-[#4b698b]"
                />
              </label>
            </div>

            {(sourceUsage || targetUsage) && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {transferType === 'between_pools' && sourceUsage && (
                  <div
                    className={`rounded-xl border p-3 text-[11px] ${
                      sourceInsufficient
                        ? 'border-[#f0b4b4] bg-[#fff5f5] text-[#9b2c2c]'
                        : 'border-[#d6e4f4] bg-[#f8fbff] text-[#28496e]'
                    }`}
                  >
                    <div className="font-bold text-[#133863]">
                      หมวดต้นทาง (โอนลด): {sourceUsage.pool.name}
                    </div>
                    <div className="mt-1.5 space-y-1 font-mono-num">
                      <div className="flex justify-between">
                        <span>วงเงินตั้งไว้เดิม:</span>
                        <span>
                          ฿{formatMoney(sourceUsage.pool.allocatedBudget)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>คงเหลือปัจจุบัน:</span>
                        <span>฿{formatMoney(sourceUsage.remainingAmount)}</span>
                      </div>
                      {numericAmount > 0 && (
                        <>
                          <div className="flex justify-between border-t border-black/10 pt-1 font-semibold">
                            <span>วงเงินตั้งไว้หลังโอน:</span>
                            <span>
                              ฿
                              {formatMoney(
                                Math.max(
                                  0,
                                  sourceUsage.pool.allocatedBudget -
                                    numericAmount,
                                ),
                              )}
                            </span>
                          </div>
                          <div
                            className={`flex justify-between font-bold ${
                              sourceInsufficient
                                ? 'text-[#b52c2c]'
                                : 'text-[#0f4c9a]'
                            }`}
                          >
                            <span>คงเหลือหลังโอน:</span>
                            <span>
                              ฿
                              {formatMoney(
                                sourceUsage.remainingAmount - numericAmount,
                              )}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {targetUsage && (
                  <div
                    className={`rounded-xl border border-[#b7e2cf] bg-[#f2fbf7] p-3 text-[11px] text-[#17573f] ${
                      transferType === 'from_external' ? 'sm:col-span-2' : ''
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-[#0f5139]">
                      <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                      หมวดปลายทาง (รับโอนเพิ่ม): {targetUsage.pool.name}
                    </div>
                    <div className="mt-1.5 space-y-1 font-mono-num">
                      <div className="flex justify-between">
                        <span>วงเงินตั้งไว้เดิม:</span>
                        <span>
                          ฿{formatMoney(targetUsage.pool.allocatedBudget)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>คงเหลือปัจจุบัน:</span>
                        <span>฿{formatMoney(targetUsage.remainingAmount)}</span>
                      </div>
                      {numericAmount > 0 && (
                        <>
                          <div className="flex justify-between border-t border-[#bfe5d3] pt-1 font-semibold text-[#0b5e40]">
                            <span>วงเงินตั้งไว้หลังโอน (+฿{formatMoney(numericAmount)}):</span>
                            <span>
                              ฿
                              {formatMoney(
                                targetUsage.pool.allocatedBudget + numericAmount,
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between font-bold text-[#0b5e40]">
                            <span>คงเหลือหลังโอน:</span>
                            <span>
                              ฿
                              {formatMoney(
                                targetUsage.remainingAmount + numericAmount,
                              )}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <label className="block text-[11.5px] font-semibold text-[#1d4069]">
              เหตุผล / รายละเอียดการโอนงบประมาณ
              <textarea
                rows={2}
                maxLength={500}
                placeholder="เช่น โอนเพิ่มเพื่อให้เพียงพอกับการจ้างเหมาซ่อมแซมถนน ตามมติสภาฯ / อำนาจผู้บริหาร"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#a8c4e4] bg-white px-3 py-2 text-xs font-normal text-[#132d4c]"
              />
            </label>

            {formError && (
              <div
                role="alert"
                className="rounded-lg border border-[#f0b4b4] bg-[#fff0f0] px-3 py-2 text-xs whitespace-pre-line text-[#b52c2c]"
              >
                {formError}
              </div>
            )}
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-[#c6daf0] bg-[#eef5fd] px-5 py-3.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#afc8e4] bg-white px-4 py-2 text-xs font-semibold text-[#274469] hover:bg-[#edf4fc]"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={yearPoolUsages.length === 0}
              className="rounded-lg bg-gradient-to-r from-[#0f489e] to-[#1972c9] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:from-[#0b387d] hover:to-[#135ba4] disabled:cursor-not-allowed disabled:opacity-45"
            >
              ยืนยันการโอนงบประมาณ
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
