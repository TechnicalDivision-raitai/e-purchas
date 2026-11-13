import type { ProjectStatus } from '../../types/procurement';

const STATUS_STYLES: Record<ProjectStatus, string> = {
  รอดำเนินการ: 'bg-[#dce9fc] text-[#174896] border-[#a5c5f2]',
  กำลังดำเนินการ: 'bg-[#cde8ff] text-[#0b4f94] border-[#8ec6f5]',
  รออนุมัติ: 'bg-[#fff3dc] text-[#8f5f0c] border-[#e8c782]',
  ส่งกลับแก้ไข: 'bg-[#ffe8e8] text-[#a32c2c] border-[#edb0b0]',
  พักงาน: 'bg-[#e7edf5] text-[#45566b] border-[#c4d0df]',
  เสร็จสิ้น: 'bg-[#dff5eb] text-[#116947] border-[#9cd8bd]',
  ยกเลิก: 'bg-[#eceef2] text-[#555d6b] border-[#cfd5de]',
};

export function StatusBadge({ status }: { status: ProjectStatus | string }) {
  const style =
    STATUS_STYLES[status as ProjectStatus] ||
    'bg-[#dce9fc] text-[#174896] border-[#a5c5f2]';

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-[11px] font-medium leading-tight ${style}`}
    >
      {status}
    </span>
  );
}
