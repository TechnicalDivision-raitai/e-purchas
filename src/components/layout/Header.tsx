import { Cloud, HardDrive, Menu } from 'lucide-react';
import { NAV_ITEMS } from '../../data/constants';
import { isGoogleSyncConfigured } from '../../services/googleSync';
import { useProcurement } from '../../storage/useProcurementStore';

interface HeaderProps {
  onOpenMobileMenu: () => void;
}

export function Header({ onOpenMobileMenu }: HeaderProps) {
  const { page, user, syncState } = useProcurement();
  const currentTitle = NAV_ITEMS.find((n) => n.id === page)?.label || 'ภาพรวม';
  const avatarChar = user.role === 'admin' ? 'พ' : 'S';
  const cloudEnabled = isGoogleSyncConfigured();

  const syncLabel = !cloudEnabled
    ? 'จัดเก็บในเบราว์เซอร์'
    : syncState === 'syncing'
      ? 'กำลังซิงค์ Google Sheet…'
      : syncState === 'error'
        ? 'ซิงค์คลาวด์ขัดข้อง (เก็บ Local แล้ว)'
        : 'ซิงค์ Google Sheet แล้ว';

  return (
    <header className="no-print flex h-[72px] items-center justify-between border-b border-[#d9e8f6] bg-gradient-to-r from-white via-white to-[#eff8ff] px-5 lg:px-9">
      <div className="flex items-center gap-3 text-xs text-[#8390a1]">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="เปิดเมนู"
          className="rounded-md border border-[#dce8f5] bg-white p-2 text-[#35465d] hover:bg-[#eef4fd] lg:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>
        <span>พื้นที่ทำงาน</span>
        <span className="text-[#c4cbd5]">/</span>
        <b className="font-semibold text-[#35465d]">{currentTitle}</b>
      </div>

      <div className="flex items-center gap-3 text-xs text-[#5d7794]">
        <span className="hidden items-center gap-1.5 rounded border border-[#d6e6f5] bg-[#f4f9ff] px-2.5 py-1 text-[11px] font-medium text-[#2d629b] sm:inline-flex">
          {cloudEnabled ? (
            <Cloud className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <HardDrive className="h-3.5 w-3.5 shrink-0" />
          )}
          {syncLabel}
        </span>
        <span className="text-[11px] font-medium text-[#536c89]">
          {user.role === 'admin' ? 'Admin' : 'Staff'}
        </span>
        <span
          aria-label={`บัญชีปัจจุบัน ${user.name}`}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#c8ddf5] bg-[#e3effd] text-xs font-semibold text-[#1d5bb5]"
        >
          {avatarChar}
        </span>
      </div>
    </header>
  );
}
