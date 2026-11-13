import { Eye, FolderKanban, LogIn, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { USERS } from '../../data/constants';
import type { UserAccount, UserRole } from '../../types/procurement';

interface LoginModalProps {
  onLogin: (account: UserAccount) => void;
}

export function LoginModal({ onLogin }: LoginModalProps) {
  const [selectedRole, setSelectedRole] = useState<UserRole>('admin');
  const [displayName, setDisplayName] = useState<string>('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const baseUser = USERS.find((u) => u.role === selectedRole) || USERS[0];
    const trimmedName = displayName.replace(/\s+/g, ' ').trim();
    onLogin({
      id: baseUser.id,
      role: baseUser.role,
      name: trimmedName || baseUser.name,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f233a]/60 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-[440px] overflow-hidden rounded-2xl border border-[#c6dcf2] bg-white shadow-2xl">
        <div className="bg-gradient-to-r from-[#124f9b] to-[#1778bd] px-6 py-6 text-white">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/25 bg-white/15">
              <FolderKanban className="h-6 w-6 text-white" />
            </span>
            <div>
              <h1 id="login-modal-title" className="text-lg font-bold tracking-tight">
                งานจัดซื้อจัดจ้าง • กองช่าง
              </h1>
              <p className="mt-0.5 text-xs text-[#cde7ff]">
                องค์การบริหารส่วนตำบลไร่ใต้
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div>
            <p className="text-xs font-medium text-[#4a627d]">
              กรุณาเลือกบทบาทและเข้าสู่ระบบก่อนใช้งาน
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            <button
              type="button"
              onClick={() => setSelectedRole('admin')}
              className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition ${
                selectedRole === 'admin'
                  ? 'border-[#1762ce] bg-[#edf5ff] ring-2 ring-[#c8e3ff]'
                  : 'border-[#dce8f5] bg-[#f9fbfe] hover:border-[#b7d2ef]'
              }`}
            >
              <span
                className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                  selectedRole === 'admin'
                    ? 'bg-[#1762ce] text-white'
                    : 'bg-[#e6effa] text-[#4b6f96]'
                }`}
              >
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div>
                <div className="text-xs font-semibold text-[#1e3a5f]">
                  ผู้ดูแลระบบ (Admin)
                </div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[#627a96]">
                  เพิ่ม แก้ไข ลบโครงการ นำเข้า Excel รับทราบงาน และตั้งค่ากระบวนการ
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedRole('staff')}
              className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition ${
                selectedRole === 'staff'
                  ? 'border-[#1762ce] bg-[#edf5ff] ring-2 ring-[#c8e3ff]'
                  : 'border-[#dce8f5] bg-[#f9fbfe] hover:border-[#b7d2ef]'
              }`}
            >
              <span
                className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                  selectedRole === 'staff'
                    ? 'bg-[#1762ce] text-white'
                    : 'bg-[#e6effa] text-[#4b6f96]'
                }`}
              >
                <Eye className="h-4 w-4" />
              </span>
              <div>
                <div className="text-xs font-semibold text-[#1e3a5f]">
                  เจ้าหน้าที่ (Staff · ดูข้อมูลอย่างเดียว)
                </div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[#627a96]">
                  ดูทะเบียนโครงการ ติดตามสถานะ พิมพ์รายงาน และส่งออกข้อมูลเท่านั้น
                </p>
              </div>
            </button>
          </div>

          <label className="block text-xs font-medium text-[#4a627d]">
            ชื่อผู้ใช้งาน (ไม่บังคับ)
            <input
              type="text"
              maxLength={100}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={
                selectedRole === 'admin'
                  ? 'เช่น นายช่าง / เจ้าหน้าที่พัสดุ'
                  : 'เช่น เจ้าหน้าที่ผู้ตรวจสอบ'
              }
              className="mt-1.5 min-h-[40px] w-full rounded-lg border border-[#c6d9ec] bg-[#f7fafe] px-3 py-2 text-xs text-[#233e5c] placeholder:text-[#96a7ba] focus:border-[#5da5e4] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#c8e5ff]"
            />
          </label>

          <button
            type="submit"
            className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#175bca] to-[#248bdc] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:from-[#114eaf] hover:to-[#167dc8]"
          >
            <LogIn className="h-4 w-4" />
            เข้าสู่ระบบ
          </button>
        </form>
      </div>
    </div>
  );
}
