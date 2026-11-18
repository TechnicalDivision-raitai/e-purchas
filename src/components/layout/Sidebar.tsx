import {
  ArrowDownToLine,
  ClockAlert,
  FileSpreadsheet,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  LogOut,
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
  saraban: ArrowDownToLine,
  excel: FileSpreadsheet,
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
  const { state, user, page, sarabanPendingCount, navigate, setInboxTab } = useProcurement();
  const isAdmin = user.role === 'admin';

  const inboxCount = getInboxProjects(state.rows, user.id).length;
  const overdueCount = state.rows.filter((r) => isOverdueProject(r)).length;

  const getCount = (id: PageId): number | null => {
    if (id === 'inbox') return inboxCount;
    if (id === 'overdue') return overdueCount > 0 ? overdueCount : null;
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
          className="no-print fixed inset-0 z-20 bg-[#061529]/60 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}
      <aside
        aria-label="เมนูหลัก"
        className={`no-print fixed inset-y-0 left-0 z-30 flex w-[248px] flex-col overflow-y-auto border-r border-[#1a4375] bg-gradient-to-b from-[#0a2342] via-[#0e325c] to-[#134278] px-4 py-6 text-white transition-transform duration-200 lg:translate-x-0 ${
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
            className="flex min-w-0 items-center gap-2.5 text-white no-underline"
          >
            <span
              aria-hidden="true"
              className="grid h-10 w-9 shrink-0 place-items-center rounded-[10px] border border-[#72b9ff]/40 bg-gradient-to-br from-[#1967cf] to-[#2ea0f5] text-white shadow-sm"
            >
              <FolderKanban className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[16px] font-bold leading-snug tracking-tight text-white">
                งานจัดซื้อจัดจ้าง
              </span>
              <span className="block truncate text-[11.5px] font-medium leading-snug text-[#9bc9ff]">
                กองช่าง อบต.ไร่ใต้
              </span>
            </span>
          </a>

          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="ปิดเมนู"
            className="rounded-md p-1.5 text-[#a9d1ff] hover:bg-[#19477d] lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3 flex items-center justify-between px-2.5 text-[10.5px] font-medium tracking-wide text-[#8fbbe8]">
          <span>ระบบงานจัดซื้อจัดจ้าง</span>
          <span className="rounded border border-[#3d78bd] bg-[#164a88] px-1.5 py-0.5 text-[10px] font-semibold text-[#d2e8ff]">
            {isAdmin ? 'Admin' : 'Staff'}
          </span>
        </div>

        <nav className="flex flex-col gap-1.5">
          {NAV_ITEMS.map((item) => {
            const Icon = NAV_ICONS[item.id];
            const selected = page === item.id;
            const count = getCount(item.id);

            return (
              <div key={item.id}>
                {item.dividerBefore && (
                  <div className="my-3 h-px bg-[#204c82]" aria-hidden="true" />
                )}
                <button
                  type="button"
                  data-page={item.id}
                  aria-current={selected ? 'page' : undefined}
                  onClick={() => handleNav(item.id)}
                  className={`flex min-h-[46px] w-full items-center gap-2.5 rounded-[14px] border-[3px] px-3 py-2 text-left text-[13px] transition-all ${
                    selected
                      ? 'border-[#0b3873] bg-gradient-to-r from-[#1159bd] via-[#176dd4] to-[#1e83eb] font-bold text-white shadow-[inset_0_0_0_2px_#7cd1ff,0_0_0_1px_rgba(124,209,255,0.28),0_6px_18px_rgba(14,84,184,0.45)]'
                      : 'border-transparent bg-transparent font-medium text-[#cbe2fc] hover:border-[#214f85] hover:bg-[#143d6e] hover:text-white'
                  }`}
                >
                  <Icon
                    className={`h-[17px] w-[17px] shrink-0 ${
                      selected ? 'text-[#8ce0ff]' : 'text-[#89b9ee]'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                  {(count !== null || (item.id === 'inbox' && sarabanPendingCount > 0)) && (
                    <span className="ml-auto flex shrink-0 items-center gap-1">
                      {item.id === 'inbox' && sarabanPendingCount > 0 && (
                        <span
                          title={`${sarabanPendingCount} เอกสารใหม่จากระบบสารบรรณรอตรวจสอบ`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setInboxTab('saraban');
                            handleNav('inbox');
                          }}
                          className="grid h-6 min-w-[26px] place-items-center rounded-full bg-[#fbbf24] px-1.5 text-[11px] font-bold tabular-nums text-[#091c36] shadow-xs ring-1 ring-[#fde68a]/60 transition hover:bg-[#fcd34d]"
                        >
                          +{sarabanPendingCount}
                        </span>
                      )}
                      {count !== null && (
                        <span
                          className={`grid h-6 min-w-[24px] place-items-center rounded-full px-1.5 text-[11px] tabular-nums ${
                            selected
                              ? 'bg-[#091c36] font-bold text-white shadow-inner'
                              : 'border border-[#2f66a6] bg-[#0e325c] font-semibold text-[#c7e2ff]'
                          }`}
                        >
                          {count}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </nav>

        <div className="mt-auto pt-5">
          {isAdmin && (
            <label className="mb-3 block px-1 text-[10.5px] font-medium text-[#9cc4ee]">
              สลับบทบาทผู้ดูแล/เจ้าหน้าที่
              <select
                value={user.id}
                onChange={(e) => onSwitchUser(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-[#2c629f] bg-[#0b294d] px-2.5 py-2 text-xs text-white focus:border-[#5da5e4] focus:outline-none focus:ring-2 focus:ring-[#3a86e8]/50"
              >
                {USERS.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="rounded-lg border border-[#25558e] bg-[#0b294d] p-2.5 text-[11px]">
            <div className="truncate font-semibold text-white">{user.name}</div>
            <div className="mt-0.5 text-[10px] text-[#9ac2ec]">
              {isAdmin ? 'สิทธิ์ผู้ดูแลระบบ' : 'สิทธิ์เจ้าหน้าที่ (ดูอย่างเดียว)'}
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="mt-2.5 flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-[#356cad] bg-[#14437a] px-2.5 py-1.5 text-[11px] font-medium text-[#e4f1ff] transition hover:border-[#5593db] hover:bg-[#1b5496]"
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
