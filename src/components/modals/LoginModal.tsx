import {
  ArrowRight,
  ChevronDown,
  Eye,
  EyeOff,
  FolderKanban,
  KeyRound,
  Lock,
  LogIn,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ADMIN_PASSWORD, USERS } from '../../data/constants';
import type { UserAccount } from '../../types/procurement';

interface LoginModalProps {
  onLogin: (account: UserAccount) => void;
}

export function LoginModal({ onLogin }: LoginModalProps) {
  const [adminMode, setAdminMode] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const adminUser = USERS.find((u) => u.role === 'admin') || USERS[0];
  const staffUser = USERS.find((u) => u.role === 'staff') || USERS[1];

  useEffect(() => {
    if (adminMode) {
      passwordInputRef.current?.focus();
    }
  }, [adminMode]);

  const handleQuickStaffLogin = () => {
    setError(null);
    onLogin({
      id: staffUser.id,
      role: staffUser.role,
      name: staffUser.name,
    });
  };

  const handleToggleAdmin = () => {
    setAdminMode((prev) => !prev);
    setError(null);
  };

  const handleAdminSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('กรุณากรอกรหัสผ่านผู้ดูแลระบบ');
      passwordInputRef.current?.focus();
      return;
    }
    if (password !== ADMIN_PASSWORD) {
      setError('รหัสผ่านผู้ดูแลระบบไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง');
      passwordInputRef.current?.select();
      return;
    }
    setError(null);
    onLogin({
      id: adminUser.id,
      role: adminUser.role,
      name: adminUser.name,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#061830]/80 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-[440px] overflow-hidden rounded-2xl border border-[#2b6cb5] bg-white shadow-2xl">
        <div className="bg-gradient-to-r from-[#092954] via-[#0f448a] to-[#1666ba] px-6 py-6 text-white">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#72b9ff]/40 bg-white/15">
              <FolderKanban className="h-6 w-6 text-white" />
            </span>
            <div>
              <h1 id="login-modal-title" className="text-lg font-bold tracking-tight">
                งานจัดซื้อจัดจ้าง • กองช่าง
              </h1>
              <p className="mt-0.5 text-xs text-[#b8dcff]">
                องค์การบริหารส่วนตำบลไร่ใต้ · เข้าระบบด่วน
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3 bg-[#f7fafe] p-6">
          <p className="text-xs font-semibold text-[#23446b]">
            เลือกสิทธิ์ผู้ใช้งานเพื่อดำเนินการต่อ
          </p>

          {/* Staff: Quick 1-click login */}
          <button
            type="button"
            onClick={handleQuickStaffLogin}
            className="group flex w-full items-center gap-3 rounded-xl border border-[#9fc2e8] bg-white p-3.5 text-left shadow-xs transition hover:border-[#104ca3] hover:bg-[#e5f0fc] focus:outline-none focus:ring-2 focus:ring-[#93c5fd]"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#0f489e] to-[#1a70c9] text-white shadow-xs transition group-hover:from-[#0b387d] group-hover:to-[#135ba4]">
              <Eye className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#0f2d52]">
                <span>เจ้าหน้าที่ (Staff)</span>
                <span className="rounded border border-[#a8caf0] bg-[#dcebfa] px-1.5 py-0.5 text-[10px] font-semibold text-[#114691]">
                  เข้าสู่ระบบได้เลย
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-[#456487]">
                ดูทะเบียนโครงการ ติดตามสถานะ พิมพ์รายงาน และส่งออกข้อมูล
              </p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-[#1859b5] transition-transform group-hover:translate-x-0.5 group-hover:text-[#0d3b82]" />
          </button>

          {/* Admin: Password-protected login */}
          <div
            className={`overflow-hidden rounded-xl border transition ${
              adminMode
                ? 'border-[#104ca3] bg-[#e9f2fc] ring-2 ring-[#a8d1ff]'
                : 'border-[#aecae8] bg-white hover:border-[#6da3df]'
            }`}
          >
            <button
              type="button"
              onClick={handleToggleAdmin}
              aria-expanded={adminMode}
              className="flex w-full items-center gap-3 p-3.5 text-left focus:outline-none"
            >
              <span
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition ${
                  adminMode
                    ? 'bg-gradient-to-br from-[#0f489e] to-[#1a70c9] text-white'
                    : 'bg-[#dbeafa] text-[#174d96]'
                }`}
              >
                <ShieldCheck className="h-4.5 w-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#0f2d52]">
                  <span>ผู้ดูแลระบบ (Admin)</span>
                  <span className="inline-flex items-center gap-1 rounded border border-[#bfd7f2] bg-[#e6f0fc] px-1.5 py-0.5 text-[10px] font-medium text-[#1b4e8f]">
                    <Lock className="h-2.5 w-2.5" />
                    ใช้รหัสผ่าน
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[#456487]">
                  เพิ่ม แก้ไข ลบโครงการ นำเข้า Excel และรับทราบงาน
                </p>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-[#356296] transition-transform ${
                  adminMode ? 'rotate-180 text-[#0f489e]' : ''
                }`}
              />
            </button>

            {adminMode && (
              <form
                onSubmit={handleAdminSubmit}
                className="space-y-3 border-t border-[#bfd7f2] bg-white px-4 py-3.5"
              >
                <div>
                  <label
                    htmlFor="admin-login-password"
                    className="block text-[11px] font-semibold text-[#1f426b]"
                  >
                    รหัสผ่านผู้ดูแลระบบ
                  </label>
                  <div className="relative mt-1.5">
                    <KeyRound className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[#4c7199]" />
                    <input
                      ref={passwordInputRef}
                      id="admin-login-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder="กรอกรหัสผ่านเพื่อเข้าสู่ระบบ"
                      className="min-h-[40px] w-full rounded-lg border border-[#a9c6e6] bg-[#f4f8fe] py-2 pr-10 pl-9 text-xs text-[#132d4c] placeholder:text-[#738eab] focus:border-[#175bbd] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#a8d1ff]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                      className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1.5 text-[#3e648f] hover:bg-[#dcebfa] hover:text-[#0f489e]"
                    >
                      {showPassword ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  {error && (
                    <p role="alert" className="mt-1.5 text-[11px] font-medium text-[#b82929]">
                      {error}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#0f489e] to-[#1972c9] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:from-[#0b387d] hover:to-[#135ba4]"
                >
                  <LogIn className="h-4 w-4" />
                  เข้าสู่ระบบผู้ดูแล
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
