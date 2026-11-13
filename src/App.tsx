import { Info, Plus } from 'lucide-react';
import { useState } from 'react';
import { Toast } from './components/common/Toast';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { Toolbar } from './components/layout/Toolbar';
import { LoginModal } from './components/modals/LoginModal';
import { ProjectEditorModal } from './components/modals/ProjectEditorModal';
import { ProjectViewModal } from './components/modals/ProjectViewModal';
import { DashboardPage } from './components/pages/DashboardPage';
import { ExcelPage } from './components/pages/ExcelPage';
import { GuidePage } from './components/pages/GuidePage';
import { ProjectsTablePanel } from './components/pages/ProjectsTablePanel';
import { WorkflowPage } from './components/pages/WorkflowPage';
import { PAGE_TITLES } from './data/constants';
import { isGoogleSyncConfigured } from './services/googleSync';
import { ProcurementProvider, useProcurement } from './storage/useProcurementStore';
import type { ProjectTabId } from './types/procurement';
import { formatThaiDate, todayBangkok } from './utils/date';

function WorkspaceShell() {
  const {
    user,
    authenticatedUser,
    page,
    filteredRows,
    login,
    logout,
    setUserById,
    showToast,
  } = useProcurement();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [editorState, setEditorState] = useState<{
    id: string;
    tab: ProjectTabId;
  } | null>(null);
  const [viewState, setViewState] = useState<{
    id: string;
    tab: ProjectTabId;
  } | null>(null);

  if (!authenticatedUser) {
    return (
      <>
        <LoginModal onLogin={login} />
        <Toast />
      </>
    );
  }

  const [pageTitle, pageSubtitle] = PAGE_TITLES[page];

  const handleOpenCreate = () => {
    if (user.role !== 'admin') {
      showToast('ไม่มีสิทธิ์แก้ไข');
      return;
    }
    setViewState(null);
    setEditorState({ id: 'new', tab: 'general' });
  };

  const handleOpenEdit = (id: string, tab: ProjectTabId = 'general') => {
    if (user.role !== 'admin') {
      showToast('ไม่มีสิทธิ์แก้ไข');
      return;
    }
    setViewState(null);
    setEditorState({ id, tab });
  };

  const handleOpenView = (id: string, tab: ProjectTabId = 'general') => {
    setEditorState(null);
    setViewState({ id, tab });
  };

  const handleSwitchUser = (nextId: string) => {
    setEditorState(null);
    setViewState(null);
    setUserById(nextId);
  };

  const handleLogout = () => {
    setEditorState(null);
    setViewState(null);
    setMobileMenuOpen(false);
    logout();
  };

  const cloudEnabled = isGoogleSyncConfigured();

  return (
    <div className="min-h-screen bg-[#f2f7fd] text-[#233e5c]">
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onSwitchUser={handleSwitchUser}
        onLogout={handleLogout}
      />

      <div className="lg:pl-[248px]">
        <Header onOpenMobileMenu={() => setMobileMenuOpen(true)} />

        <main className="no-print mx-auto max-w-[1740px] px-4 py-6 sm:px-7 lg:px-9">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-semibold tracking-[0.14em] text-[#7c92ac]">
                PROCUREMENT MANAGEMENT
              </div>
              <h1 className="mt-1.5 text-[22px] font-semibold tracking-tight text-[#1e3550] sm:text-[25px]">
                {pageTitle}
              </h1>
              <p className="mt-1 text-xs text-[#73859a]">{pageSubtitle}</p>
            </div>

            {user.role === 'admin' && (
              <button
                type="button"
                onClick={handleOpenCreate}
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#1d70cd] bg-gradient-to-r from-[#175bca] to-[#248bdc] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:from-[#114eaf] hover:to-[#167dc8]"
              >
                <Plus className="h-4 w-4" />
                เพิ่มโครงการ
              </button>
            )}
          </div>

          <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-[#cce1f7] bg-gradient-to-r from-[#eaf3ff] to-[#f1faff] px-4 py-3 text-xs text-[#3b70a7]">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#2b6cb0]" />
            <div>
              <span>
                {cloudEnabled
                  ? 'เชื่อมต่อ Google Sheet & Google Drive อัตโนมัติ'
                  : 'พื้นที่ทำงานพร้อมระบบซิงค์คลาวด์ (ทำงานแบบ Local Cache)'}
              </span>
              <span className="mt-0.5 block text-[11px] text-[#6d8cad] sm:mt-0 sm:ml-2 sm:inline">
                {cloudEnabled
                  ? 'บันทึกแคชในเบราว์เซอร์และซิงค์ขึ้น Google Sheet/Drive อัตโนมัติทุกการเปลี่ยนแปลง'
                  : 'บันทึกข้อมูลแคชในเบราว์เซอร์นี้ และซิงค์อัตโนมัติทันทีเมื่อตั้งค่า Google Apps Script URL'}
              </span>
            </div>
          </div>

          <Toolbar />

          {page === 'dashboard' && (
            <DashboardPage
              onViewProject={(id) => handleOpenView(id)}
              onEditProject={(id) => handleOpenEdit(id)}
              onCreateProject={handleOpenCreate}
            />
          )}

          {(page === 'register' || page === 'inbox' || page === 'overdue') && (
            <ProjectsTablePanel
              rows={filteredRows}
              title={page === 'inbox' ? 'งานที่รอดำเนินการของคุณ' : 'รายการโครงการ'}
              onViewProject={(id) => handleOpenView(id)}
              onEditProject={(id) => handleOpenEdit(id)}
              onCreateProject={handleOpenCreate}
            />
          )}

          {page === 'excel' && <ExcelPage />}
          {page === 'workflow' && <WorkflowPage />}
          {page === 'guide' && <GuidePage />}

          <footer className="flex flex-wrap items-center justify-between gap-2 pt-6 text-[11px] text-[#8ba0b7]">
            <span>ระบบงานจัดซื้อจัดจ้าง · กองช่าง อบต.ไร่ใต้ v2.0</span>
            <span className="tabular-nums">
              Asia/Bangkok · {formatThaiDate(todayBangkok())}
            </span>
          </footer>
        </main>
      </div>

      {editorState && (
        <ProjectEditorModal
          projectId={editorState.id}
          initialTab={editorState.tab}
          onClose={() => setEditorState(null)}
        />
      )}

      {viewState && (
        <ProjectViewModal
          projectId={viewState.id}
          initialTab={viewState.tab}
          onClose={() => setViewState(null)}
          onOpenEdit={(id, tab) => handleOpenEdit(id, tab)}
        />
      )}

      <Toast />
    </div>
  );
}

export default function App() {
  return (
    <ProcurementProvider>
      <WorkspaceShell />
    </ProcurementProvider>
  );
}
