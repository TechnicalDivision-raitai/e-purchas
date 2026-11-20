import { useState } from 'react';
import { Toast } from './components/common/Toast';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { Toolbar } from './components/layout/Toolbar';
import { LoginModal } from './components/modals/LoginModal';
import { ProjectEditorModal } from './components/modals/ProjectEditorModal';
import { ProjectViewModal } from './components/modals/ProjectViewModal';
import { BudgetPoolsPage } from './components/pages/BudgetPoolsPage';
import { DashboardPage } from './components/pages/DashboardPage';
import { ExcelPage } from './components/pages/ExcelPage';
import { InboxPage } from './components/pages/InboxPage';
import { ProjectsTablePanel } from './components/pages/ProjectsTablePanel';
import { PAGE_TITLES } from './data/constants';
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
    budgetPoolId?: string;
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

  const handleOpenCreate = (budgetPoolId?: string) => {
    if (user.role !== 'admin') {
      showToast('ไม่มีสิทธิ์แก้ไข');
      return;
    }
    setViewState(null);
    setEditorState({ id: 'new', tab: 'general', budgetPoolId });
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

  return (
    <div className="min-h-screen bg-[#e3ecf7] text-[#132d4c]">
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onSwitchUser={handleSwitchUser}
        onLogout={handleLogout}
      />

      <div className="lg:pl-[248px]">
        <Header
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onCreateProject={() => handleOpenCreate()}
        />

        <main className="no-print mx-auto max-w-[1740px] px-4 py-6 sm:px-7 lg:px-9">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-semibold tracking-[0.14em] text-[#456892]">
                PROCUREMENT MANAGEMENT
              </div>
              <h1 className="mt-1.5 text-[22px] font-semibold tracking-tight text-[#0f2a4a] sm:text-[25px]">
                {pageTitle}
              </h1>
              <p className="mt-1 text-xs text-[#4a6688]">{pageSubtitle}</p>
            </div>
          </div>

          <Toolbar />

          {page === 'dashboard' && (
            <DashboardPage
              onViewProject={(id) => handleOpenView(id)}
              onEditProject={(id) => handleOpenEdit(id)}
              onCreateProject={() => handleOpenCreate()}
              onCreatePurchaseFromPool={(poolId) => handleOpenCreate(poolId)}
            />
          )}

          {page === 'budgets' && (
            <BudgetPoolsPage
              onCreatePurchaseFromPool={(poolId) => handleOpenCreate(poolId)}
              onViewProject={(id) => handleOpenView(id)}
              onEditProject={(id) => handleOpenEdit(id)}
            />
          )}

          {(page === 'inbox' || page === 'saraban') && (
            <InboxPage
              rows={filteredRows}
              onViewProject={(id, tab) => handleOpenView(id, tab)}
              onCreateProject={() => handleOpenCreate()}
            />
          )}

          {(page === 'register' || page === 'overdue') && (
            <ProjectsTablePanel
              rows={filteredRows}
              title="รายการโครงการ"
              onViewProject={(id) => handleOpenView(id)}
              onEditProject={(id) => handleOpenEdit(id)}
              onCreateProject={() => handleOpenCreate()}
            />
          )}

          {page === 'excel' && <ExcelPage />}

          <footer className="flex flex-wrap items-center justify-between gap-2 pt-6 text-[11px] text-[#5c7899]">
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
          initialBudgetPoolId={editorState.budgetPoolId}
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
