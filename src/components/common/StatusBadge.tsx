import type { ProjectStatus } from '../../types/procurement';

const STATUS_STYLES: Record<ProjectStatus, string> = {
  รอดำเนินการ: 'bg-[#edf3fd] text-[#285ea8] border-[#c8dcf7]',
  กำลังดำเนินการ: 'bg-[#e6f3ff] text-[#1262ad] border-[#b8dbf8]',
  รออนุมัติ: 'bg-[#fff7e8] text-[#9b6c16] border-[#f2dca8]',
  ส่งกลับแก้ไข: 'bg-[#fff0f0] text-[#b43c3c] border-[#f5c7c7]',
  พักงาน: 'bg-[#f1f4f8] text-[#59687a] border-[#d8e0ea]',
  เสร็จสิ้น: 'bg-[#eaf8f2] text-[#177853] border-[#bce5d2]',
  ยกเลิก: 'bg-[#f3f4f6] text-[#6b7280] border-[#dfe3e8]',
};

export function StatusBadge({ status }: { status: ProjectStatus | string }) {
  const style =
    STATUS_STYLES[status as ProjectStatus] ||
    'bg-[#edf3fd] text-[#285ea8] border-[#c8dcf7]';

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-[11px] font-medium leading-tight ${style}`}
    >
      {status}
    </span>
  );
}
