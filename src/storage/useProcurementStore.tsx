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
import { SARABAN_CATEGORY_META } from '../data/constants';
import {
  resolveProjectExpenseClassification,
  UNSPECIFIED_EXPENSE_CATEGORY,
} from '../domain/expenseCategories';
import { buildPersonPositionMap } from '../domain/personPositions';
import {
  applySarabanQueueItemToProject,
  getInboxProjects,
  getResponsibleName,
  getUserName,
  isOverdueProject,
  normalizeLegacyStepId,
  sortProjects,
} from '../domain/procurement';
import {
  deleteSarabanQueueItem,
  fetchProjectsFromGoogleSheet,
  fetchSarabanQueue,
  isGoogleSyncConfigured,
  reviewSarabanQueueItem,
  syncProjectsToGoogleSheet,
} from '../services/googleSync';
import type {
  BudgetPool,
  ExpenseCategoryGroup,
  PageId,
  ProcurementState,
  ProjectRecord,
  SarabanQueueItem,
  SyncState,
  UserAccount,
  ViewFilter,
} from '../types/procurement';
import { normalizeCodeKey } from '../utils/format';

interface ProcurementContextValue {
  state: ProcurementState;
  user: UserAccount;
  authenticatedUser: UserAccount | null;
  page: PageId;
  inboxTab: 'projects' | 'saraban';
  setInboxTab: (tab: 'projects' | 'saraban') => void;
  viewFilter: ViewFilter;
  filteredRows: ProjectRecord[];
  toastMessage: string | null;
  syncState: SyncState;
  sarabanQueue: SarabanQueueItem[];
  sarabanPendingCount: number;
  sarabanQueueLoading: boolean;
  sarabanQueueError: string | null;
  login: (account: UserAccount) => void;
  logout: () => void;
  setUserById: (id: string) => void;
  navigate: (page: PageId) => void;
  updateViewFilter: (patch: Partial<ViewFilter>) => void;
  toggleSort: (key: ViewFilter['sort']) => void;
  commit: (mutator: (draft: ProcurementState) => void) => boolean;
  deleteProject: (id: string) => boolean;
  saveBudgetPool: (pool: BudgetPool) => boolean;
  deleteBudgetPool: (id: string) => boolean;
  saveExpenseCategories: (catalog: ExpenseCategoryGroup[]) => boolean;
  refreshFromStorage: () => Promise<void>;
  refreshSarabanQueue: (notifyOnSuccess?: boolean) => Promise<void>;
  approveSarabanQueueItem: (
    item: SarabanQueueItem,
    overrideProjectId?: string,
  ) => Promise<boolean>;
  rejectSarabanQueueItem: (
    item: SarabanQueueItem,
    rejectReason: string,
  ) => Promise<boolean>;
  removeSarabanQueueItem: (item: SarabanQueueItem) => Promise<boolean>;
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
    budgetPools: Array.isArray(raw.budgetPools) ? raw.budgetPools : [],
    expenseCategories: Array.isArray(raw.expenseCategories)
      ? raw.expenseCategories
      : undefined,
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
  if (hash === 'saraban') return 'inbox';
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
  const [inboxTab, setInboxTab] = useState<'projects' | 'saraban'>(() =>
    window.location.hash.slice(1) === 'saraban' ? 'saraban' : 'projects',
  );
  const [toastMessage, setToastMessage] = useState<string | null>(initial.error);
  const [syncState, setSyncState] = useState<SyncState>(() =>
    isGoogleSyncConfigured() ? 'idle' : 'local',
  );
  const [sarabanQueue, setSarabanQueue] = useState<SarabanQueueItem[]>([]);
  const [sarabanQueueLoading, setSarabanQueueLoading] = useState<boolean>(false);
  const [sarabanQueueError, setSarabanQueueError] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const user = authenticatedUser || USERS[1];
  const sarabanPendingCount = useMemo(
    () => sarabanQueue.filter((q) => q.queueStatus === 'pending').length,
    [sarabanQueue],
  );

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
            const remoteHasRows = Array.isArray(remote.rows) && remote.rows.length > 0;
            const mergedRows = remoteHasRows
              ? mergeLocalFileBlobs(remote.rows!, prev.rows)
              : prev.rows.length > 0
                ? prev.rows
                : remote.rows || prev.rows;

            const prevPools = prev.budgetPools || [];
            const remoteHasPools =
              Array.isArray(remote.budgetPools) && remote.budgetPools.length > 0;
            const mergedPools = remoteHasPools
              ? remote.budgetPools!
              : prevPools.length > 0
                ? prevPools
                : remote.budgetPools || prevPools;

            const mergedExpenseCategories =
              Array.isArray(remote.expenseCategories) &&
              remote.expenseCategories.length > 0
                ? remote.expenseCategories
                : prev.expenseCategories;

            const next = normalizeLoadedState({
              version: prev.version,
              steps: createDefaultSteps(),
              rows: mergedRows,
              budgetPools: mergedPools,
              expenseCategories: mergedExpenseCategories,
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
      if (
        idbState &&
        ((Array.isArray(idbState.rows) && idbState.rows.length > 0) ||
          (Array.isArray(idbState.budgetPools) && idbState.budgetPools.length > 0))
      ) {
        setState((prev) => {
          const normalized = normalizeLoadedState(idbState);
          if (prev.rows.length === 0 && (prev.budgetPools || []).length === 0) {
            return normalized;
          }
          return {
            ...prev,
            rows:
              prev.rows.length > 0
                ? mergeLocalFileBlobs(prev.rows, normalized.rows)
                : normalized.rows,
            budgetPools:
              (prev.budgetPools || []).length > 0
                ? prev.budgetPools
                : normalized.budgetPools,
            expenseCategories:
              (prev.expenseCategories || []).length > 0
                ? prev.expenseCategories
                : normalized.expenseCategories,
          };
        });
      }
    });
  }, []);

  const refreshSarabanQueue = useCallback(
    async (notifyOnSuccess = false) => {
      if (!isGoogleSyncConfigured()) {
        setSarabanQueue([]);
        setSarabanQueueError(null);
        return;
      }
      setSarabanQueueLoading(true);
      setSarabanQueueError(null);
      try {
        const res = await fetchSarabanQueue('all');
        setSarabanQueue(res.data);
        if (notifyOnSuccess) {
          showToast(`โหลดคิวจากสารบรรณแล้ว (${res.pendingCount} รายการรออนุมัติ)`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setSarabanQueueError(msg);
        if (notifyOnSuccess) {
          showToast(`ดึงคิวจากสารบรรณไม่สำเร็จ: ${msg}`);
        }
      } finally {
        setSarabanQueueLoading(false);
      }
    },
    [showToast],
  );

  useEffect(() => {
    if (authenticatedUser && isGoogleSyncConfigured()) {
      void pullFromCloud(false);
      void refreshSarabanQueue(false);
    }
  }, [authenticatedUser, pullFromCloud, refreshSarabanQueue]);

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
      const rawHash = window.location.hash.slice(1) as PageId;
      if (rawHash === 'saraban') {
        setInboxTab('saraban');
        setPage('inbox');
        return;
      }
      setPage(parseHashPage());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((nextPage: PageId) => {
    if (nextPage === 'saraban') {
      setInboxTab('saraban');
      if (window.location.hash.slice(1) !== 'inbox') {
        window.location.hash = 'inbox';
      }
      setPage('inbox');
      return;
    }
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
      if (!['code', 'year', 'title'].includes(key)) return;
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

  const saveBudgetPool = useCallback(
    (pool: BudgetPool): boolean => {
      return commit((draft) => {
        if (!Array.isArray(draft.budgetPools)) {
          draft.budgetPools = [];
        }
        const nowIso = new Date().toISOString();
        const idx = draft.budgetPools.findIndex((p) => p.id === pool.id);
        if (idx >= 0) {
          draft.budgetPools[idx] = {
            ...draft.budgetPools[idx],
            ...pool,
            updatedAt: nowIso,
          };
        } else {
          draft.budgetPools.push({
            ...pool,
            createdAt: pool.createdAt || nowIso,
            updatedAt: nowIso,
          });
        }
      });
    },
    [commit],
  );

  const deleteBudgetPool = useCallback(
    (id: string): boolean => {
      return commit((draft) => {
        const list = draft.budgetPools || [];
        const idx = list.findIndex((p) => p.id === id);
        if (idx === -1) throw new Error('ไม่พบหมวดวงเงินงบประมาณ');
        list.splice(idx, 1);
        draft.budgetPools = list;
        // Unlink any projects referencing the deleted pool without deleting those purchase records
        for (const row of draft.rows) {
          if (row.budgetPoolId === id) {
            row.budgetPoolId = undefined;
          }
        }
      });
    },
    [commit],
  );

  const saveExpenseCategories = useCallback(
    (catalog: ExpenseCategoryGroup[]): boolean => {
      return commit((draft) => {
        draft.expenseCategories = catalog.map((g) => ({
          id: g.id,
          name: g.name.trim(),
          subCategories: g.subCategories
            .map((s) => s.trim())
            .filter(Boolean),
        }));
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
        await refreshSarabanQueue(false);
      } else {
        showToast('รีเฟรชข้อมูลแล้ว');
      }
    } catch (err) {
      showToast(`อ่านข้อมูลไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [pullFromCloud, refreshSarabanQueue, showToast]);

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

    const poolById = new Map((state.budgetPools || []).map((p) => [p.id, p]));
    const q = viewFilter.q.trim().toLowerCase();
    const filterCat = (viewFilter.expenseCategory || '').trim();
    const filterSub = (viewFilter.expenseSubCategory || '').trim();

    const matched = baseRows
      .map((r) => ({ ...r, responsibleName: getResponsibleName(r) }))
      .filter((r) => {
        const linkedPool = r.budgetPoolId ? poolById.get(r.budgetPoolId) : undefined;
        const { category, subCategory } = resolveProjectExpenseClassification(
          r,
          poolById,
        );
        const effectiveCat = category || UNSPECIFIED_EXPENSE_CATEGORY;
        if (filterCat && effectiveCat !== filterCat) return false;
        if (filterSub && subCategory !== filterSub) return false;

        return (
          (!viewFilter.year || Number(r.year) === Number(viewFilter.year)) &&
          (!viewFilter.status || r.status === viewFilter.status) &&
          (!q ||
            [
              r.code,
              r.title,
              r.department,
              r.vendor,
              r.expenseCategory,
              r.expenseSubCategory,
              linkedPool?.expenseCategory,
              linkedPool?.expenseSubCategory,
              getResponsibleName(r),
              getUserName(r.assignee),
            ].some((val) => String(val || '').toLowerCase().includes(q)))
        );
      });

    return sortProjects(matched, viewFilter.sort, viewFilter.dir);
  }, [page, state.rows, state.budgetPools, user.id, viewFilter]);

  const approveSarabanQueueItem = useCallback(
    async (item: SarabanQueueItem, overrideProjectId?: string): Promise<boolean> => {
      if (user.role !== 'admin') {
        showToast('ไม่มีสิทธิ์อนุมัติรับข้อมูลเข้าโครงการ');
        return false;
      }

      const targetProject =
        (overrideProjectId
          ? state.rows.find((r) => r.id === overrideProjectId)
          : undefined) ||
        (item.procurementId
          ? state.rows.find((r) => r.id === item.procurementId)
          : undefined) ||
        (item.projectCode
          ? state.rows.find(
              (r) => normalizeCodeKey(r.code) === normalizeCodeKey(item.projectCode),
            )
          : undefined);

      if (!targetProject) {
        showToast('ไม่พบโครงการปลายทาง กรุณาเลือกโครงการก่อนอนุมัติ');
        return false;
      }

      try {
        await reviewSarabanQueueItem({
          queueId: item.queueId,
          idempotencyKey: item.idempotencyKey,
          queueStatus: 'approved',
          reviewedBy: user.name,
        });
      } catch (err) {
        showToast(
          `อัปเดตคิวสารบรรณไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`,
        );
        return false;
      }

      const meta = SARABAN_CATEGORY_META[item.docCategory];
      const refSuffix = item.bookNo
        ? ` เลขที่ ${item.bookNo}`
        : item.attachment?.fileName
          ? ` (${item.attachment.fileName})`
          : ` คิว ${item.queueId}`;
      const ok = commit((draft) => {
        const target = draft.rows.find((r) => r.id === targetProject.id);
        if (!target) throw new Error('ไม่พบโครงการปลายทาง');
        const positionMap = buildPersonPositionMap(draft.rows);
        applySarabanQueueItemToProject(target, item, positionMap);
        target.history.push({
          at: new Date().toISOString(),
          by: user.name,
          action: `รับข้อมูลจากสารบรรณ (${meta.label})${refSuffix}`,
        });
      });

      if (ok) {
        const nowIso = new Date().toISOString();
        setSarabanQueue((prev) =>
          prev.map((q) =>
            q.queueId === item.queueId
              ? {
                  ...q,
                  queueStatus: 'approved',
                  reviewedBy: user.name,
                  reviewedAt: nowIso,
                  rejectReason: '',
                }
              : q,
          ),
        );
        showToast(`อนุมัติรับ ${meta.label} เข้าโครงการ ${targetProject.code} แล้ว`);
      }

      return ok;
    },
    [user.role, user.name, state.rows, commit, showToast],
  );

  const rejectSarabanQueueItem = useCallback(
    async (item: SarabanQueueItem, rejectReason: string): Promise<boolean> => {
      if (user.role !== 'admin') {
        showToast('ไม่มีสิทธิ์ปฏิเสธรายการคิว');
        return false;
      }
      const cleanReason = rejectReason.trim();
      if (!cleanReason) {
        showToast('กรุณาระบุเหตุผลการปฏิเสธ / ส่งกลับ');
        return false;
      }
      try {
        await reviewSarabanQueueItem({
          queueId: item.queueId,
          idempotencyKey: item.idempotencyKey,
          queueStatus: 'rejected',
          reviewedBy: user.name,
          rejectReason: cleanReason,
        });
        const nowIso = new Date().toISOString();
        setSarabanQueue((prev) =>
          prev.map((q) =>
            q.queueId === item.queueId
              ? {
                  ...q,
                  queueStatus: 'rejected',
                  reviewedBy: user.name,
                  reviewedAt: nowIso,
                  rejectReason: cleanReason,
                }
              : q,
          ),
        );
        showToast(`ปฏิเสธคิว ${item.queueId} และส่งสถานะกลับสารบรรณแล้ว`);
        return true;
      } catch (err) {
        showToast(
          `ปฏิเสธคิวไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`,
        );
        return false;
      }
    },
    [user.role, user.name, showToast],
  );

  const removeSarabanQueueItem = useCallback(
    async (item: SarabanQueueItem): Promise<boolean> => {
      if (user.role !== 'admin') {
        showToast('ไม่มีสิทธิ์ลบรายการคิว');
        return false;
      }
      try {
        await deleteSarabanQueueItem(item.queueId, item.idempotencyKey);
        setSarabanQueue((prev) =>
          prev.filter(
            (q) =>
              !(
                (item.queueId && q.queueId === item.queueId) ||
                (item.idempotencyKey && q.idempotencyKey === item.idempotencyKey)
              ),
          ),
        );
        showToast(`ลบคิว ${item.queueId || item.idempotencyKey} ออกจากระบบแล้ว`);
        return true;
      } catch (err) {
        showToast(
          `ลบคิวไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`,
        );
        return false;
      }
    },
    [user.role, showToast],
  );

  const value: ProcurementContextValue = {
    state,
    user,
    authenticatedUser,
    page,
    inboxTab,
    setInboxTab,
    viewFilter,
    filteredRows,
    toastMessage,
    syncState,
    sarabanQueue,
    sarabanPendingCount,
    sarabanQueueLoading,
    sarabanQueueError,
    login,
    logout,
    setUserById,
    navigate,
    updateViewFilter,
    toggleSort,
    commit,
    deleteProject,
    saveBudgetPool,
    deleteBudgetPool,
    saveExpenseCategories,
    refreshFromStorage,
    refreshSarabanQueue,
    approveSarabanQueueItem,
    rejectSarabanQueueItem,
    removeSarabanQueueItem,
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
