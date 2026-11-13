import {
  BookOpen,
  ClockAlert,
  FileSpreadsheet,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  LogOut,
  Settings2,
  X,
} from 'lucide-react';
import { NAV_ITEMS, USERS } from '../../data/constants';
import { getInboxProjects, isOverdueProject } from '../../domain/procurement';
import { useProcurement } from '../../storage/useProcurementStore';
import type { PageId } from '../../types/procurement';

const NAV_ICONS: Record<PageId, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  inbox: Inbox,
  register: FolderKanban,
  overdue: ClockAlert,
  excel: FileSpreadsheet,
  workflow: Settings2,
  guide: BookOpen,
};

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onSwitchUser: (nextUserId: string) => void;
  onLogout: () => void;
}

export function Sidebar({
  mobileOpen,
  onCloseMobile,
  onSwitchUser,
  onLogout,
}: SidebarProps) {
  const { state, user, page, navigate } = useProcurement();
  const isAdmin = user.role === 'admin';

  const inboxCount = getInboxProjects(state.rows, user.id).length;
  const overdueCount = state.rows.filter((r) => isOverdueProject(r)).length;

  const getCount = (id: PageId): number | null => {
    if (id === 'inbox') return inboxCount;
    if (id === 'overdue') return overdueCount;
    return null;
  };

  const handleNav = (id: PageId) => {
    navigate(id);
    onCloseMobile();
  };

  return (
    <>
      {mobileOpen && (
        <div
          className="no-print fixed inset-0 z-20 bg-[#142e4a]/40 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}
      <aside
        aria-label="เมนูหลัก"
        className={`no-print fixed inset-y-0 left-0 z-30 flex w-[248px] flex-col overflow-y-auto border-r border-[#cbdff4] bg-gradient-to-b from-[#e7f2ff] via-[#f4faff] to-white px-4 py-6 transition-transform duration-200 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        <div className="mb-6 flex items-center justify-between px-1">
          <a
            href="#dashboard"
            onClick={(e) => {
              e.preventDefault();
              handleNav('dashboard');
            }}
            className="flex min-w-0 items-center gap-2.5 text-[#154c91] no-underline"
          >
            <span
              aria-hidden="true"
              className="grid h-10 w-9 shrink-0 place-items-center rounded-[10px] border border-white/60 bg-gradient-to-br from-[#1555bd] to-[#2789e8] text-white shadow-sm"
            >
              <FolderKanban className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[16px] font-bold leading-snug tracking-tight text-[#154c91]">
                งานจัดซื้อจัดจ้าง
              </span>
              <span className="block truncate text-[11.5px] font-medium leading-snug text-[#5682ad]">
                กองช่าง อบต.ไร่ใต้
              </span>
            </span>
          </a>

          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="ปิดเมนู"
            className="rounded-md p-1.5 text-[#4e7298] hover:bg-[#dcecff] lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3 flex items-center justify-between px-2.5 text-[10.5px] font-medium tracking-wide text-[#6d92b6]">
          <span>พื้นที่ปฏิบัติงาน</span>
          <span className="rounded border border-[#c3ddf7] bg-[#dcecff] px-1.5 py-0.5 text-[10px] font-semibold text-[#356ca9]">
            {isAdmin ? 'Admin' : 'Staff'}
          </span>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = NAV_ICONS[item.id];
            const selected = page === item.id;
            const count = getCount(item.id);

            return (
              <div key={item.id}>
                {item.dividerBefore && (
                  <div className="my-3.5 h-px bg-[#d6e6f5]" aria-hidden="true" />
                )}
                <button
                  type="button"
                  data-page={item.id}
                  aria-current={selected ? 'page' : undefined}
                  onClick={() => handleNav(item.id)}
                  className={`flex min-h-[42px] w-full items-center gap-3 rounded-[10px] border px-3.5 py-2.5 text-left text-[13px] transition-colors ${
                    selected
                      ? 'border-[#a9ccfa] bg-gradient-to-r from-[#e3efff] to-white font-semibold text-[#1e5cc3] shadow-xs'
                      : 'border-transparent bg-transparent font-medium text-[#5d7a9a] hover:border-[#c9dff4] hover:bg-[#eaf4ff] hover:text-[#245e9d]'
                  }`}
                >
                  <Icon
                    className={`h-[17px] w-[17px] shrink-0 ${
                      selected ? 'text-[#1e5cc3]' : 'text-[#6c88a8]'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                  {count !== null && (
                    <span
                      className={`ml-auto rounded border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                        selected
                          ? 'border-[#1e5cc3] bg-[#1e5cc3] text-white'
                          : 'border-[#d7e7fa] bg-[#e5f0fd] text-[#4c7caf]'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </nav>

        <div className="mt-auto pt-5">
          <div className="mb-4 rounded-[9px] border border-[#d2e5f8] bg-[#eaf4ff] p-3.5 text-[11px]">
            <div className="font-semibold text-[#376a9f]">เริ่มต้นใช้งานอย่างมั่นใจ</div>
            <p className="mt-1 mb-2.5 text-[10.5px] leading-relaxed text-[#6b85a1]">
              แบบจำลอง ขั้นตอน และขอบเขตระบบ
            </p>
            <button
              type="button"
              onClick={() => handleNav('guide')}
              className="whitespace-nowrap rounded-md border border-[#c1daf2] bg-white px-2.5 py-1 text-[11px] font-medium text-[#2a6aa9] transition hover:bg-[#f5faff]"
            >
              อ่านคู่มือ ↗
            </button>
          </div>

          {isAdmin && (
            <label className="mb-3 block px-1 text-[10.5px] font-medium text-[#6e849d]">
              สลับบทบาทผู้ดูแล/เจ้าหน้าที่
              <select
                value={user.id}
                onChange={(e) => onSwitchUser(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-[#cbdff1] bg-[#fbfdff] px-2.5 py-2 text-xs text-[#2d445f] focus:border-[#5da5e4] focus:outline-none focus:ring-2 focus:ring-[#c8e5ff]"
              >
                {USERS.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="rounded-lg border border-[#d9e7f4] bg-white p-2.5 text-[11px]">
            <div className="truncate font-semibold text-[#2a4563]">{user.name}</div>
            <div className="mt-0.5 text-[10px] text-[#7b90a8]">
              {isAdmin ? 'สิทธิ์ผู้ดูแลระบบ' : 'สิทธิ์เจ้าหน้าที่ (ดูอย่างเดียว)'}
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="mt-2.5 flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-[#dce6f2] bg-[#f8fbff] px-2.5 py-1.5 text-[11px] font-medium text-[#4e6783] transition hover:border-[#bfd6ee] hover:bg-[#edf5fd]"
            >
              <LogOut className="h-3.5 w-3.5" />
              ออกจากระบบ
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
