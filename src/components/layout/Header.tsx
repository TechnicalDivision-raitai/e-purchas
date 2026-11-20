import { Cloud, HardDrive, Menu, Plus } from 'lucide-react';
import { NAV_ITEMS } from '../../data/constants';
import { isGoogleSyncConfigured } from '../../services/googleSync';
import { useProcurement } from '../../storage/useProcurementStore';

interface HeaderProps {
  onOpenMobileMenu: () => void;
  onCreateProject?: () => void;
}

export function Header({ onOpenMobileMenu, onCreateProject }: HeaderProps) {
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
    <header className="no-print sticky top-0 z-10 flex h-[72px] items-center justify-between gap-3 border-b border-[#bdd3ec] bg-gradient-to-r from-[#f8fbff] via-[#eef5fd] to-[#dbeafa] px-5 shadow-xs lg:px-9">
      <div className="flex min-w-0 items-center gap-3 text-xs text-[#547194]">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="เปิดเมนู"
          className="rounded-md border border-[#b5cde8] bg-white p-2 text-[#163d6e] hover:bg-[#e1edfb] lg:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>
        <span className="hidden sm:inline">ระบบงานจัดซื้อจัดจ้าง</span>
        <span className="hidden text-[#9cb6d4] sm:inline">/</span>
        <b className="truncate font-semibold text-[#0f2f57]">{currentTitle}</b>
      </div>

      <div className="flex shrink-0 items-center gap-2.5 text-xs text-[#3b5c85] sm:gap-3">
        {user.role === 'admin' && onCreateProject && (
          <button
            type="button"
            onClick={onCreateProject}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#0d4294] bg-gradient-to-r from-[#0f489e] to-[#1972c9] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:from-[#0b387d] hover:to-[#135ba4]"
          >
            <Plus className="h-4 w-4" />
            เพิ่มโครงการ
          </button>
        )}
        <span className="hidden items-center gap-1.5 rounded border border-[#acc8ea] bg-[#e3effc] px-2.5 py-1 text-[11px] font-medium text-[#154b94] md:inline-flex">
          {cloudEnabled ? (
            <Cloud className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <HardDrive className="h-3.5 w-3.5 shrink-0" />
          )}
          {syncLabel}
        </span>
        <span className="hidden text-[11px] font-semibold text-[#2d507a] sm:inline">
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
