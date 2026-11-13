import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { validateWorkflowSteps } from '../../domain/procurement';
import { useProcurement } from '../../storage/useProcurementStore';

export function WorkflowPage() {
  const { state, user, commit, appendHistory, showToast } = useProcurement();
  const isAdmin = user.role === 'admin';

  const [jsonText, setJsonText] = useState<string>(() =>
    JSON.stringify(state.steps, null, 2),
  );
  const [error, setError] = useState<string>('');

  useEffect(() => {
    setJsonText(JSON.stringify(state.steps, null, 2));
  }, [state.steps]);

  const handleSave = () => {
    setError('');
    try {
      if (!isAdmin) {
        throw new Error('ไม่มีสิทธิ์');
      }
      const nextSteps = validateWorkflowSteps(jsonText, state.rows);
      const saved = commit((draft) => {
        draft.steps = nextSteps;
        for (const r of draft.rows) {
          appendHistory(r, 'ผู้ดูแลปรับการตั้งค่ากระบวนการ');
        }
      });
      if (saved) {
        showToast('บันทึกกระบวนการแล้ว');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="overflow-hidden rounded-[10px] border border-[#dce8f5] bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-[#e6eff8] bg-gradient-to-r from-white to-[#f7fbff] px-5 py-4">
        <h2 className="text-[14px] font-semibold text-[#315c88]">
          แบบจำลองขั้นตอน (JSON)
        </h2>
        <span className="rounded border border-[#f2dca8] bg-[#fff7e8] px-2 py-0.5 text-[11px] font-medium text-[#9b6c16]">
          กระบวนการที่ยืนยันแล้ว
        </span>
      </div>

      <div className="space-y-4 p-5">
        <p className="text-xs leading-relaxed text-[#5c7490]">
          ตั้งชื่อ ลำดับ บทบาท เงื่อนไขข้อมูล และเส้นทางถัดไปในจุดเดียว
          การข้ามขั้นตอนต้องระบุ id ปลายทางใน next · การย้อนลำดับต้องมีเหตุผล ·
          การปิดงานทำได้ที่ขั้นตอนสุดท้ายเท่านั้น
        </p>

        <div className="rounded-lg border border-[#f2deb9] bg-[#fff8ed] p-3.5 text-[11.5px] leading-relaxed text-[#8d672b]">
          required รองรับชื่อฟิลด์หลักที่มีค่า ส่วน condition และ documents เป็นคำอธิบายประกอบ
          ยังไม่ตรวจเงื่อนไขตามประเภท / วิธี / วงเงิน หรือเอกสารอัตโนมัติ
          <br />
          ใช้ roles: admin เท่านั้น · staff อ่านอย่างเดียว · ห้ามลบ id ที่มีข้อมูลใช้งานอยู่
        </div>

        <label className="block">
          <span className="sr-only">ขั้นตอน JSON</span>
          <textarea
            aria-label="ขั้นตอน JSON"
            value={jsonText}
            readOnly={!isAdmin}
            onChange={(e) => setJsonText(e.target.value)}
            rows={18}
            className="w-full rounded-lg border border-[#d6e2ef] bg-[#f8fbff] p-3.5 font-mono-num text-xs leading-relaxed text-[#253c56] focus:border-[#5da5e4] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#c8e5ff]"
          />
        </label>

        {error && (
          <div
            role="alert"
            className="rounded-md border border-[#f5c7c7] bg-[#fff2f2] p-3 text-xs text-[#b43c3c]"
          >
            {error}
          </div>
        )}

        {isAdmin ? (
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#1762ce] px-4 py-2 text-xs font-medium text-white transition hover:bg-[#124ea8]"
          >
            <Save className="h-3.5 w-3.5" />
            บันทึกขั้นตอน
          </button>
        ) : (
          <p className="text-xs text-[#7088a3]">ผู้ดูแลระบบเท่านั้นที่แก้ไขขั้นตอนได้</p>
        )}
      </div>
    </section>
  );
}
