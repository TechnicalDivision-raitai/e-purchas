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
    <header className="no-print flex h-[72px] items-center justify-between border-b border-[#bdd3ec] bg-gradient-to-r from-[#f8fbff] via-[#eef5fd] to-[#dbeafa] px-5 lg:px-9">
      <div className="flex items-center gap-3 text-xs text-[#547194]">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="เปิดเมนู"
          className="rounded-md border border-[#b5cde8] bg-white p-2 text-[#163d6e] hover:bg-[#e1edfb] lg:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>
        <span>พื้นที่ทำงาน</span>
        <span className="text-[#9cb6d4]">/</span>
        <b className="font-semibold text-[#0f2f57]">{currentTitle}</b>
      </div>

      <div className="flex items-center gap-3 text-xs text-[#3b5c85]">
        <span className="hidden items-center gap-1.5 rounded border border-[#acc8ea] bg-[#e3effc] px-2.5 py-1 text-[11px] font-medium text-[#154b94] sm:inline-flex">
          {cloudEnabled ? (
            <Cloud className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <HardDrive className="h-3.5 w-3.5 shrink-0" />
          )}
          {syncLabel}
        </span>
        <span className="text-[11px] font-semibold text-[#2d507a]">
          {user.role === 'admin' ? 'Admin' : 'Staff'}
        </span>
        <span
          aria-label={`บัญชีปัจจุบัน ${user.name}`}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#2b6cb8] bg-gradient-to-br from-[#124da8] to-[#1e74cc] text-xs font-semibold text-white shadow-xs"
        >
          {avatarChar}
        </span>
      </div>
    </header>
  );
}
