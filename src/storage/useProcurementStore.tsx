import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  createDefaultSteps,
  createSeedState,
  DEFAULT_VIEW_FILTER,
  PAGE_TITLES,
  SESSION_USER_KEY,
  STORAGE_KEY,
  USERS,
  VIEW_STORAGE_KEY,
} from '../data/constants';
import {
  getInboxProjects,
  getResponsibleName,
  getUserName,
  isOverdueProject,
  normalizeLegacyStepId,
  sortProjects,
} from '../domain/procurement';
import {
  fetchProjectsFromGoogleSheet,
  isGoogleSyncConfigured,
  syncProjectsToGoogleSheet,
} from '../services/googleSync';
import type {
  PageId,
  ProcurementState,
  ProjectRecord,
  SyncState,
  UserAccount,
  ViewFilter,
} from '../types/procurement';

interface ProcurementContextValue {
  state: ProcurementState;
  user: UserAccount;
  authenticatedUser: UserAccount | null;
  page: PageId;
  viewFilter: ViewFilter;
  filteredRows: ProjectRecord[];
  toastMessage: string | null;
  syncState: SyncState;
  login: (account: UserAccount) => void;
  logout: () => void;
  setUserById: (id: string) => void;
  navigate: (page: PageId) => void;
  updateViewFilter: (patch: Partial<ViewFilter>) => void;
  toggleSort: (key: ViewFilter['sort']) => void;
  commit: (mutator: (draft: ProcurementState) => void) => boolean;
  deleteProject: (id: string) => boolean;
  refreshFromStorage: () => Promise<void>;
  showToast: (message: string) => void;
  appendHistory: (project: ProjectRecord, action: string) => void;
}

const ProcurementContext = createContext<ProcurementContextValue | null>(null);

const IDB_NAME = 'raitai-procurement-db';
const IDB_STORE = 'state';

function saveStateToIndexedDB(state: ProcurementState): void {
  if (typeof window === 'undefined' || !('indexedDB' in window)) return;
  try {
    const req = window.indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(state, STORAGE_KEY);
      tx.oncomplete = () => db.close();
    };
  } catch {
    // Ignore IndexedDB errors
  }
}

function loadStateFromIndexedDB(): Promise<ProcurementState | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(IDB_STORE, 'readonly');
        const getReq = tx.objectStore(IDB_STORE).get(STORAGE_KEY);
        getReq.onsuccess = () => {
          db.close();
          resolve((getReq.result as ProcurementState | undefined) || null);
        };
        getReq.onerror = () => {
          db.close();
          resolve(null);
        };
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function persistStateLocally(next: ProcurementState): void {
  saveStateToIndexedDB(next);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // If localStorage hits ~5MB quota due to large attachments, store compact metadata in localStorage while full files live in IndexedDB
    try {
      const compact: ProcurementState = {
        ...next,
        rows: next.rows.map((r) => ({
          ...r,
          files: (r.files || []).map((f) => {
            if (f.data && f.data.length > 100000) {
              const { data: _omitted, ...rest } = f;
              return rest;
            }
            return f;
          }),
        })),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(compact));
    } catch {
      // Full state is still safely persisted in IndexedDB and memory
    }
  }
}

function mergeLocalFileBlobs(
  incomingRows: ProjectRecord[],
  existingRows: ProjectRecord[],
): ProjectRecord[] {
  const fileDataById = new Map<string, string>();
  for (const row of existingRows) {
    for (const f of row.files || []) {
      if (f.id && f.data) {
        fileDataById.set(f.id, f.data);
      }
    }
  }
  return incomingRows.map((row) => ({
    ...row,
    files: (row.files || []).map((f) => {
      if (!f.data && !f.url && f.id && fileDataById.has(f.id)) {
        return { ...f, data: fileDataById.get(f.id) };
      }
      return f;
    }),
  }));
}

function normalizeLoadedState(raw: ProcurementState): ProcurementState {
  return {
    version: raw.version || 2,
    steps: createDefaultSteps(),
    rows: (raw.rows || []).map((r) => ({
      ...r,
      step: normalizeLegacyStepId(r.step),
    })),
  };
}

function loadInitialState(): { state: ProcurementState; error: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { state: createSeedState(), error: null };
    return {
      state: normalizeLoadedState(JSON.parse(raw) as ProcurementState),
      error: null,
    };
  } catch {
    return {
      state: createSeedState(),
      error: 'อ่านข้อมูลที่บันทึกไว้ไม่สำเร็จ กำลังแสดงข้อมูลเริ่มต้น กรุณาตรวจพื้นที่จัดเก็บ',
    };
  }
}

function loadSessionUser(): UserAccount | null {
  try {
    const raw = sessionStorage.getItem(SESSION_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserAccount;
    if (!parsed?.id || (parsed.role !== 'admin' && parsed.role !== 'staff')) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function loadInitialViews(): Record<string, ViewFilter> {
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ViewFilter>) : {};
  } catch {
    return {};
  }
}

function parseHashPage(): PageId {
  const hash = window.location.hash.slice(1) as PageId;
  return PAGE_TITLES[hash] ? hash : 'dashboard';
}

export function ProcurementProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(() => loadInitialState(), []);
  const [state, setState] = useState<ProcurementState>(initial.state);
  const [views, setViews] = useState<Record<string, ViewFilter>>(loadInitialViews);
  const [authenticatedUser, setAuthenticatedUser] = useState<UserAccount | null>(
    loadSessionUser,
  );
  const [page, setPage] = useState<PageId>(parseHashPage);
  const [toastMessage, setToastMessage] = useState<string | null>(initial.error);
  const [syncState, setSyncState] = useState<SyncState>(() =>
    isGoogleSyncConfigured() ? 'idle' : 'local',
  );
  const toastTimerRef = useRef<number | null>(null);

  const user = authenticatedUser || USERS[1];

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 6000);
  }, []);

  const pullFromCloud = useCallback(
    async (notifyOnSuccess = false) => {
      if (!isGoogleSyncConfigured()) {
        setSyncState('local');
        return;
      }
      setSyncState('syncing');
      try {
        const remote = await fetchProjectsFromGoogleSheet();
        if (remote) {
          setState((prev) => {
            const mergedRows = remote.rows
              ? mergeLocalFileBlobs(remote.rows, prev.rows)
              : prev.rows;
            const next = normalizeLoadedState({
              version: prev.version,
              steps: createDefaultSteps(),
              rows: mergedRows,
            });
            persistStateLocally(next);
            return next;
          });
        }
        setSyncState('synced');
        if (notifyOnSuccess) {
          showToast('ซิงค์ข้อมูลจาก Google Sheet แล้ว');
        }
      } catch (err) {
        setSyncState('error');
        if (notifyOnSuccess) {
          showToast(
            `ซิงค์ Google Sheet ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    },
    [showToast],
  );

  const pushToCloud = useCallback((nextState: ProcurementState) => {
    if (!isGoogleSyncConfigured()) {
      setSyncState('local');
      return;
    }
    setSyncState('syncing');
    syncProjectsToGoogleSheet(nextState)
      .then(() => {
        setSyncState('synced');
      })
      .catch(() => {
        setSyncState('error');
      });
  }, []);

  useEffect(() => {
    void loadStateFromIndexedDB().then((idbState) => {
      if (idbState && Array.isArray(idbState.rows) && idbState.rows.length > 0) {
        setState((prev) => {
          const normalized = normalizeLoadedState(idbState);
          if (prev.rows.length === 0) return normalized;
          return {
            ...prev,
            rows: mergeLocalFileBlobs(prev.rows, normalized.rows),
          };
        });
      }
    });
  }, []);

  useEffect(() => {
    if (authenticatedUser && isGoogleSyncConfigured()) {
      void pullFromCloud(false);
    }
  }, [authenticatedUser, pullFromCloud]);

  useEffect(() => {
    if (initial.error) {
      toastTimerRef.current = window.setTimeout(() => setToastMessage(null), 6000);
    }
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, [initial.error]);

  useEffect(() => {
    const onHashChange = () => {
      setPage(parseHashPage());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((nextPage: PageId) => {
    const validPage = PAGE_TITLES[nextPage] ? nextPage : 'dashboard';
    if (window.location.hash.slice(1) !== validPage) {
      window.location.hash = validPage;
    }
    setPage(validPage);
  }, []);

  const login = useCallback((account: UserAccount) => {
    try {
      sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(account));
    } catch {
      // Ignore sessionStorage restrictions if any
    }
    setAuthenticatedUser(account);
  }, []);

  const logout = useCallback(() => {
    try {
      sessionStorage.removeItem(SESSION_USER_KEY);
    } catch {
      // Ignore
    }
    setAuthenticatedUser(null);
  }, []);

  const setUserById = useCallback(
    (id: string) => {
      if (user.role !== 'admin') return;
      const found = USERS.find((u) => u.id === id);
      if (found) {
        login(found);
      }
    },
    [user.role, login],
  );

  const viewKey = page === 'inbox' ? `inbox-${user.id}` : page;
  const viewFilter: ViewFilter = views[viewKey] || DEFAULT_VIEW_FILTER;

  const updateViewFilter = useCallback(
    (patch: Partial<ViewFilter>) => {
      setViews((prev) => {
        const current = prev[viewKey] || DEFAULT_VIEW_FILTER;
        const next = { ...prev, [viewKey]: { ...current, ...patch } };
        try {
          localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(next));
        } catch (err) {
          showToast(
            `เก็บตัวกรองไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        return next;
      });
    },
    [viewKey, showToast],
  );

  const toggleSort = useCallback(
    (key: ViewFilter['sort']) => {
      const current = views[viewKey] || DEFAULT_VIEW_FILTER;
      const nextDir = current.sort === key && current.dir === 'asc' ? 'desc' : 'asc';
      updateViewFilter({ sort: key, dir: nextDir });
    },
    [views, viewKey, updateViewFilter],
  );

  const commit = useCallback(
    (mutator: (draft: ProcurementState) => void): boolean => {
      if (user.role !== 'admin') {
        showToast('เจ้าหน้าที่ (staff) ดูข้อมูลได้อย่างเดียว');
        return false;
      }
      try {
        const next = structuredClone(state);
        mutator(next);
        persistStateLocally(next);
        setState(next);
        pushToCloud(next);
        return true;
      } catch (err) {
        showToast(`บันทึกไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
    },
    [state, user.role, showToast, pushToCloud],
  );

  const deleteProject = useCallback(
    (id: string): boolean => {
      return commit((draft) => {
        const index = draft.rows.findIndex((r) => r.id === id);
        if (index === -1) throw new Error('ไม่พบโครงการ');
        draft.rows.splice(index, 1);
      });
    },
    [commit],
  );

  const refreshFromStorage = useCallback(async () => {
    try {
      const idbState = await loadStateFromIndexedDB();
      const saved = localStorage.getItem(STORAGE_KEY);
      if (idbState && Array.isArray(idbState.rows) && idbState.rows.length > 0) {
        setState(normalizeLoadedState(idbState));
      } else if (saved) {
        setState(normalizeLoadedState(JSON.parse(saved) as ProcurementState));
      }
      if (isGoogleSyncConfigured()) {
        await pullFromCloud(true);
      } else {
        showToast('รีเฟรชข้อมูลแล้ว');
      }
    } catch (err) {
      showToast(`อ่านข้อมูลไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [pullFromCloud, showToast]);

  const appendHistory = useCallback(
    (project: ProjectRecord, action: string) => {
      project.history.push({
        at: new Date().toISOString(),
        by: user.name,
        action,
      });
    },
    [user.name],
  );

  const filteredRows = useMemo(() => {
    const baseRows =
      page === 'inbox'
        ? getInboxProjects(state.rows, user.id)
        : page === 'overdue'
          ? state.rows.filter((r) => isOverdueProject(r))
          : state.rows;

    const q = viewFilter.q.trim().toLowerCase();
    const matched = baseRows
      .map((r) => ({ ...r, responsibleName: getResponsibleName(r) }))
      .filter(
        (r) =>
          (!viewFilter.year || Number(r.year) === Number(viewFilter.year)) &&
          (!viewFilter.status || r.status === viewFilter.status) &&
          (!q ||
            [
              r.code,
              r.title,
              r.department,
              r.vendor,
              getResponsibleName(r),
              getUserName(r.assignee),
            ].some((val) => String(val || '').toLowerCase().includes(q))),
      );

    return sortProjects(matched, viewFilter.sort, viewFilter.dir);
  }, [page, state.rows, user.id, viewFilter]);

  const value: ProcurementContextValue = {
    state,
    user,
    authenticatedUser,
    page,
    viewFilter,
    filteredRows,
    toastMessage,
    syncState,
    login,
    logout,
    setUserById,
    navigate,
    updateViewFilter,
    toggleSort,
    commit,
    deleteProject,
    refreshFromStorage,
    showToast,
    appendHistory,
  };

  return (
    <ProcurementContext.Provider value={value}>{children}</ProcurementContext.Provider>
  );
}

export function useProcurement(): ProcurementContextValue {
  const ctx = useContext(ProcurementContext);
  if (!ctx) {
    throw new Error('useProcurement must be used within ProcurementProvider');
  }
  return ctx;
}
