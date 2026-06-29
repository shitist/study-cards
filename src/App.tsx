import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Cloud,
  CloudOff,
  Download,
  Filter,
  GripVertical,
  Loader2,
  Monitor,
  Moon,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  Sun,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AI_LLM_CATEGORY,
  AI_LLM_SUBCATEGORIES,
  ALL_CATEGORIES,
  CATEGORY_TREE,
  DEFAULT_CATEGORY,
  categoryMatches,
  categoryPath,
  cardMatches,
  createCard,
  createEmptyDatabase,
  formatCardHtml,
  formatCardMarkdown,
  formatDate,
  getCardTitle,
  getUpdateCount,
  normalizeCard,
  nowIso,
  parseCategory
} from "./lib/cards";
import {
  cancelSignInDrive,
  checkForUpdates,
  downloadUpdate,
  getDriveStatus,
  getStorageInfo,
  getUpdateStatus,
  hasNativeBridge,
  installUpdate,
  loadCards,
  loadSettings,
  onUpdateStatus,
  saveCards,
  saveSettings,
  signInDrive,
  signOutDrive,
  syncDrive
} from "./lib/storage";
import type { AppSettings, CardDatabase, DriveStatus, StorageInfo, StudyCard, StudyCardFields, ThemePreference, UpdateStatus } from "./types/models";

type FieldDefinition = {
  key: keyof StudyCardFields;
  label: string;
  placeholder: string;
  rows: number;
};

type CategoryTreeViewNode = {
  id: string;
  label: string;
  path: string;
  children?: CategoryTreeViewNode[];
};

const TEXT = {
  concept: "\u6982\u5ff5",
  definition: "\u5b9a\u4e49",
  encounteredBecause: "\u6211\u4e3a\u4ec0\u4e48\u9047\u5230\u5b83",
  solves: "\u5b83\u89e3\u51b3\u4ec0\u4e48\u95ee\u9898",
  doesNotSolve: "\u5b83\u4e0d\u89e3\u51b3\u4ec0\u4e48\u95ee\u9898",
  verification: "\u6211\u5b9e\u9645\u600e\u4e48\u9a8c\u8bc1",
  exampleConcept: "\u4f8b\u5982\uff1aGGUF",
  definitionPlaceholder: "\u7528\u4e00\u4e24\u53e5\u8bdd\u5199\u6e05\u8fd9\u4e2a\u6982\u5ff5\u662f\u4ec0\u4e48\u3002",
  encounteredPlaceholder: "\u5199\u4e0b\u89e6\u53d1\u8fd9\u4e2a\u95ee\u9898\u7684\u771f\u5b9e\u573a\u666f\u3002",
  solvesPlaceholder: "\u7528\u81ea\u5df1\u7684\u8bdd\u89e3\u91ca\u5b83\u7684\u7528\u9014\u3002",
  boundaryPlaceholder: "\u8bb0\u5f55\u8fb9\u754c\uff0c\u907f\u514d\u4ee5\u540e\u8bef\u7528\u3002",
  verificationPlaceholder: "\u5199\u4e0b\u53ef\u4ee5\u4eb2\u624b\u8dd1\u7684\u5c0f\u5b9e\u9a8c\u6216\u5224\u65ad\u65b9\u6cd5\u3002",
  notes: "\u5907\u6ce8",
  notesPlaceholder: "\u8bb0\u5f55\u8865\u5145\u4fe1\u606f\u3001\u540e\u7eed\u60f3\u6cd5\u6216\u5176\u4ed6\u9700\u8981\u4fdd\u7559\u7684\u5185\u5bb9\u3002",
  system: "\u8ddf\u968f\u7cfb\u7edf",
  light: "\u6d45\u8272",
  dark: "\u6df1\u8272",
  unnamedCard: "\u672a\u547d\u540d\u5361\u7247",
  appName: "\u5b66\u4e60\u5361\u7247",
  cardsUnit: "\u5f20\u5361\u7247",
  newCard: "\u65b0\u5efa\u5361\u7247",
  searchCards: "\u641c\u7d22\u5361\u7247",
  categoryDirectory: "\u5206\u7c7b\u76ee\u5f55",
  syncSettings: "\u540c\u6b65\u8bbe\u7f6e",
  localSave: "\u672c\u5730\u4fdd\u5b58",
  driveConnected: "Google Drive \u5df2\u8fde\u63a5",
  allCards: "\u5168\u90e8\u5361\u7247",
  conflictCopy: "\u51b2\u7a81\u526f\u672c",
  noDefinition: "\u5c1a\u672a\u586b\u5199\u5b9a\u4e49",
  updated: "\u66f4\u65b0",
  noMatchingCards: "\u8fd8\u6ca1\u6709\u5339\u914d\u7684\u5361\u7247",
  newOne: "\u65b0\u5efa\u4e00\u5f20",
  copyMarkdown: "\u590d\u5236 Markdown",
  copy: "\u590d\u5236",
  save: "\u4fdd\u5b58",
  deleteCard: "\u5220\u9664\u5361\u7247",
  created: "\u521b\u5efa",
  latestUpdate: "\u6700\u65b0\u66f4\u65b0",
  updateTimes: "\u6b21\u66f4\u65b0",
  chooseOrCreate: "\u9009\u62e9\u6216\u65b0\u5efa\u4e00\u5f20\u5361\u7247",
  majorCategory: "\u5927\u5206\u7c7b",
  aiSubcategory: "AI/LLM \u5c0f\u5206\u7c7b",
  customSubcategory: "\u81ea\u5b9a\u4e49\u5c0f\u5206\u7c7b",
  customSubcategoryPlaceholder: "\u8f93\u5165 AI/LLM \u5c0f\u5206\u7c7b",
  theme: "\u4e3b\u9898",
  connected: "\u5df2\u8fde\u63a5",
  disconnected: "\u672a\u8fde\u63a5",
  signIn: "\u767b\u5f55",
  syncNow: "\u7acb\u5373\u540c\u6b65",
  disconnect: "\u65ad\u5f00\u8fde\u63a5",
  lastSync: "\u4e0a\u6b21\u540c\u6b65",
  neverSynced: "\u5c1a\u672a\u540c\u6b65",
  localData: "\u672c\u5730\u6570\u636e",
  browserPreview: "\u6d4f\u89c8\u5668\u9884\u89c8\u6a21\u5f0f",
  close: "\u5173\u95ed",
  editor: "\u7f16\u8f91",
  sync: "\u540c\u6b65",
  syncing: "\u6b63\u5728\u540c\u6b65",
  autoSync: "\u81ea\u52a8\u540c\u6b65",
  autoSyncEnabled: "\u6bcf 5 \u5206\u949f",
  backgroundSyncing: "\u540e\u53f0\u540c\u6b65\u4e2d",
  autoSyncFailed: "\u81ea\u52a8\u540c\u6b65\u5931\u8d25\uff1a",
  oauthNotConfigured: "\u5f53\u524d\u6784\u5efa\u672a\u914d\u7f6e Google OAuth\u3002",
  createdToast: "\u5df2\u65b0\u5efa\u5361\u7247",
  savedToast: "\u5df2\u4fdd\u5b58\u5361\u7247",
  deletedToast: "\u5df2\u5220\u9664\u5361\u7247",
  copiedToast: "\u5df2\u590d\u5236 Markdown",
  driveSignInToast: "Google Drive \u5df2\u8fde\u63a5",
  driveSignOutToast: "\u5df2\u65ad\u5f00 Google Drive",
  dataLoadBlocked: "\u672c\u5730\u6570\u636e\u8bfb\u53d6\u5931\u8d25\uff0c\u5df2\u6682\u505c\u5199\u5165\uff0c\u907f\u514d\u8986\u76d6\u539f\u6587\u4ef6\u3002\u8bf7\u5148\u5904\u7406\u9519\u8bef\u6216\u5907\u4efd\u6587\u4ef6\u540e\u91cd\u542f\u5e94\u7528\u3002",
  syncInProgress: "\u6b63\u5728\u540c\u6b65 Google Drive\uff0c\u8bf7\u7b49\u5f85\u540c\u6b65\u5b8c\u6210\u540e\u518d\u4fee\u6539\u5361\u7247\u3002",
  saveBeforeSync: "\u5f53\u524d\u5361\u7247\u8fd8\u6709\u672a\u4fdd\u5b58\u7684\u4fee\u6539\uff0c\u8bf7\u5148\u4fdd\u5b58\u518d\u540c\u6b65\u3002",
  cancelSignIn: "\u53d6\u6d88\u767b\u5f55",
  signInCancelled: "Google Drive \u767b\u5f55\u5df2\u53d6\u6d88",
  updates: "\u66f4\u65b0",
  currentVersion: "\u5f53\u524d\u7248\u672c",
  checkUpdates: "\u68c0\u67e5\u66f4\u65b0",
  checkingUpdates: "\u6b63\u5728\u68c0\u67e5",
  downloadUpdate: "\u4e0b\u8f7d\u66f4\u65b0",
  downloadingUpdate: "\u6b63\u5728\u4e0b\u8f7d",
  installUpdate: "\u91cd\u542f\u5e76\u5b89\u88c5",
  noUpdateAvailable: "\u5f53\u524d\u5df2\u662f\u6700\u65b0\u7248\u672c",
  updateUnavailable: "\u5f00\u53d1\u6a21\u5f0f\u4e0d\u652f\u6301\u81ea\u52a8\u66f4\u65b0\uff0c\u8bf7\u4f7f\u7528\u5b89\u88c5\u7248\u6d4b\u8bd5\u3002",
  updateDownloadedToast: "\u66f4\u65b0\u5df2\u4e0b\u8f7d",
  updateAvailablePrompt: (version: string) => "\u53d1\u73b0\u65b0\u7248\u672c " + version + "\uff0c\u662f\u5426\u4e0b\u8f7d\u66f4\u65b0\uff1f",
  updateDownloadedPrompt: (version: string) => "\u66f4\u65b0 " + version + " \u5df2\u4e0b\u8f7d\uff0c\u662f\u5426\u7acb\u5373\u91cd\u542f\u5e76\u5b89\u88c5\uff1f"
};

const fieldDefinitions: FieldDefinition[] = [
  { key: "concept", label: TEXT.concept, placeholder: TEXT.exampleConcept, rows: 1 },
  { key: "summary", label: TEXT.definition, placeholder: TEXT.definitionPlaceholder, rows: 2 },
  { key: "encounteredBecause", label: TEXT.encounteredBecause, placeholder: TEXT.encounteredPlaceholder, rows: 3 },
  { key: "solves", label: TEXT.solves, placeholder: TEXT.solvesPlaceholder, rows: 3 },
  { key: "doesNotSolve", label: TEXT.doesNotSolve, placeholder: TEXT.boundaryPlaceholder, rows: 3 },
  { key: "verification", label: TEXT.verification, placeholder: TEXT.verificationPlaceholder, rows: 3 },
  { key: "notes", label: TEXT.notes, placeholder: TEXT.notesPlaceholder, rows: 4 }
];

const AUTO_SYNC_INTERVAL_MS = 5 * 60_000;
const CUSTOM_SUBCATEGORY_VALUE = "__custom__";
const CUSTOM_SUBCATEGORY_LABEL = TEXT.customSubcategory;

const themeOptions: Array<{ value: ThemePreference; label: string; icon: typeof Monitor }> = [
  { value: "system", label: TEXT.system, icon: Monitor },
  { value: "light", label: TEXT.light, icon: Sun },
  { value: "dark", label: TEXT.dark, icon: Moon }
];

const defaultDriveStatus: DriveStatus = {
  configured: false,
  signedIn: false,
  lastSyncedAt: null
};

const defaultUpdateStatus: UpdateStatus = {
  status: "idle",
  currentVersion: "-",
  version: null,
  percent: null,
  error: null
};

function cloneCard(card: StudyCard): StudyCard {
  return JSON.parse(JSON.stringify(card)) as StudyCard;
}

function useToast() {
  const [message, setMessage] = useState("");

  function showToast(next: string) {
    setMessage(next);
    window.setTimeout(() => setMessage(""), 2600);
  }

  return { message, showToast };
}

export default function App() {
  const [database, setDatabase] = useState<CardDatabase>(() => createEmptyDatabase());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<StudyCard | null>(null);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORIES);
  const [rootOpen, setRootOpen] = useState(false);
  const [openCategoryIds, setOpenCategoryIds] = useState<string[]>([]);
  const [settings, setSettings] = useState<AppSettings>({ themePreference: "system" });
  const [driveStatus, setDriveStatus] = useState<DriveStatus>(defaultDriveStatus);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [autoSyncBusy, setAutoSyncBusy] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>(defaultUpdateStatus);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [error, setError] = useState("");
  const [dataLoadBlocked, setDataLoadBlocked] = useState(false);
  const { message: toast, showToast } = useToast();
  const syncInFlightRef = useRef(false);
  const autoSyncRunnerRef = useRef<() => Promise<void>>(async () => undefined);
  const backgroundSyncPromiseRef = useRef<Promise<void> | null>(null);
  const preserveDraftOnSyncRef = useRef(false);
  const signInCancelRequestedRef = useRef(false);
  const promptedUpdateVersionRef = useRef<string | null>(null);
  const promptedInstallVersionRef = useRef<string | null>(null);
  const databaseRef = useRef(database);
  const draftRef = useRef(draft);
  databaseRef.current = database;
  draftRef.current = draft;

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      let loadedDb: CardDatabase;
      try {
        loadedDb = await loadCards();
        if (!mounted) return;
        databaseRef.current = loadedDb;
        setDatabase(loadedDb);
        setSelectedId(loadedDb.cards[0]?.id ?? null);
        setDataLoadBlocked(false);
      } catch (nextError) {
        if (!mounted) return;
        setDataLoadBlocked(true);
        setError(nextError instanceof Error ? nextError.message : String(nextError));
        return;
      }

      try {
        const [loadedSettings, loadedDriveStatus, info, loadedUpdateStatus] = await Promise.all([
          loadSettings(),
          getDriveStatus(),
          getStorageInfo(),
          getUpdateStatus()
        ]);
        if (!mounted) return;
        setSettings(loadedSettings);
        setDriveStatus(loadedDriveStatus);
        setStorageInfo(info);
        setUpdateStatus(loadedUpdateStatus);
      } catch (nextError) {
        if (!mounted) return;
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      }
    }

    bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hasNativeBridge) return undefined;
    return onUpdateStatus((status) => setUpdateStatus(status));
  }, []);

  useEffect(() => {
    if (updateStatus.status === "available" && updateStatus.version && promptedUpdateVersionRef.current !== updateStatus.version) {
      promptedUpdateVersionRef.current = updateStatus.version;
      if (window.confirm(TEXT.updateAvailablePrompt(updateStatus.version))) {
        void handleDownloadUpdate();
      }
    }

    if (updateStatus.status === "downloaded" && updateStatus.version && promptedInstallVersionRef.current !== updateStatus.version) {
      promptedInstallVersionRef.current = updateStatus.version;
      if (window.confirm(TEXT.updateDownloadedPrompt(updateStatus.version))) {
        void handleInstallUpdate();
      }
    }
  }, [updateStatus.status, updateStatus.version]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const resolvedTheme = settings.themePreference === "system" ? (media.matches ? "dark" : "light") : settings.themePreference;
      document.documentElement.dataset.theme = resolvedTheme;
      document.documentElement.dataset.themePreference = settings.themePreference;
      document.documentElement.style.colorScheme = resolvedTheme;
    };

    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [settings.themePreference]);

  const selectedCard = useMemo(
    () => database.cards.find((card) => card.id === selectedId) ?? null,
    [database.cards, selectedId]
  );

  useEffect(() => {
    const currentDraft = draftRef.current;
    if (preserveDraftOnSyncRef.current && currentDraft?.id === selectedId) {
      preserveDraftOnSyncRef.current = false;
      return;
    }

    preserveDraftOnSyncRef.current = false;
    const nextDraft = selectedCard ? cloneCard(selectedCard) : null;
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  }, [selectedCard, selectedId]);

  const dynamicAiSubcategories = useMemo(() => {
    const customSubcategories = database.cards
      .map((card) => card.category)
      .filter((category) => categoryMatches(category, AI_LLM_CATEGORY))
      .map((category) => parseCategory(category).subcategory)
      .filter((subcategory): subcategory is string => Boolean(subcategory) && !AI_LLM_SUBCATEGORIES.includes(subcategory as string))
      .sort((a, b) => a.localeCompare(b, "zh-CN"));
    return Array.from(new Set([...AI_LLM_SUBCATEGORIES, ...customSubcategories]));
  }, [database.cards]);

  const categoryTree = useMemo<CategoryTreeViewNode[]>(() => {
    return CATEGORY_TREE.map((category) => {
      if (category.label !== AI_LLM_CATEGORY) {
        return { id: category.id, label: category.label, path: category.label };
      }

      return {
        id: category.id,
        label: category.label,
        path: category.label,
        children: dynamicAiSubcategories.map((subcategory, index) => ({
          id: `ai-llm-sub-${index}-${subcategory}`,
          label: subcategory,
          path: categoryPath(AI_LLM_CATEGORY, subcategory)
        }))
      };
    });
  }, [dynamicAiSubcategories]);

  const filteredCards = useMemo(
    () => database.cards.filter((card) => cardMatches(card, query, activeCategory)),
    [database.cards, query, activeCategory]
  );

  const hasUnsavedChanges = Boolean(draft && (!selectedCard || JSON.stringify(draft) !== JSON.stringify(selectedCard)));

  const updateStatusText = useMemo(() => {
    if (updateStatus.status === "checking") return TEXT.checkingUpdates;
    if (updateStatus.status === "available") return updateStatus.version ? TEXT.updates + " " + updateStatus.version : TEXT.downloadUpdate;
    if (updateStatus.status === "downloading") {
      const percent = typeof updateStatus.percent === "number" ? " " + Math.round(updateStatus.percent) + "%" : "";
      return TEXT.downloadingUpdate + percent;
    }
    if (updateStatus.status === "downloaded") return updateStatus.version ? TEXT.updateDownloadedToast + " " + updateStatus.version : TEXT.updateDownloadedToast;
    if (updateStatus.status === "not-available") return TEXT.noUpdateAvailable;
    if (updateStatus.status === "unavailable") return updateStatus.error || TEXT.updateUnavailable;
    if (updateStatus.status === "error") return updateStatus.error || "Update error";
    return TEXT.noUpdateAvailable;
  }, [updateStatus]);

  const updateIsWorking = updateBusy || updateStatus.status === "checking" || updateStatus.status === "downloading";

  const draftCategory = useMemo(() => {
    if (!draft) return { major: AI_LLM_CATEGORY, subcategory: AI_LLM_SUBCATEGORIES[0] };
    return parseCategory(draft.category);
  }, [draft]);

  const draftAiSubcategoryIsCustom =
    draftCategory.major === AI_LLM_CATEGORY &&
    Boolean(draftCategory.subcategory) &&
    !AI_LLM_SUBCATEGORIES.includes(draftCategory.subcategory || "");
  const draftAiSubcategorySelectValue = draftAiSubcategoryIsCustom
    ? CUSTOM_SUBCATEGORY_VALUE
    : draftCategory.subcategory || AI_LLM_SUBCATEGORIES[0];

  function categoryCount(category: string) {
    return database.cards.filter((card) => categoryMatches(card.category, category)).length;
  }

  function toggleCategoryOpen(categoryId: string) {
    setOpenCategoryIds((current) =>
      current.includes(categoryId) ? current.filter((id) => id !== categoryId) : [...current, categoryId]
    );
  }

  function guardWritableData() {
    if (!dataLoadBlocked) return true;
    setError(TEXT.dataLoadBlocked);
    return false;
  }

  function guardCardMutation() {
    if (!guardWritableData()) return false;
    if (!syncBusy) return true;
    setError(TEXT.syncInProgress);
    return false;
  }

  async function waitForBackgroundSync() {
    const pendingSync = backgroundSyncPromiseRef.current;
    if (pendingSync) await pendingSync;
  }

  function hasUnsavedDraftNow() {
    const currentDraft = draftRef.current;
    if (!currentDraft) return false;
    const savedCard = databaseRef.current.cards.find((card) => card.id === currentDraft.id);
    return !savedCard || JSON.stringify(currentDraft) !== JSON.stringify(savedCard);
  }

  async function runDriveSync(announceResult: boolean) {
    if (
      !hasNativeBridge ||
      dataLoadBlocked ||
      !driveStatus.signedIn ||
      hasUnsavedDraftNow() ||
      syncInFlightRef.current
    ) {
      return;
    }

    syncInFlightRef.current = true;
    if (announceResult) {
      setSyncBusy(true);
      setBusy(true);
    } else {
      setAutoSyncBusy(true);
    }
    setError("");

    const operation = (async () => {
      try {
        const result = await syncDrive();
        const currentDraft = draftRef.current;
        const preserveDraft = !announceResult && hasUnsavedDraftNow();
        preserveDraftOnSyncRef.current = preserveDraft;
        databaseRef.current = result.database;
        setDatabase(result.database);
        setDriveStatus(await getDriveStatus());
        setSelectedId((current) =>
          preserveDraft && currentDraft?.id === current
            ? current
            : current && result.database.cards.some((card) => card.id === current)
              ? current
              : result.database.cards[0]?.id ?? null
        );
        if (announceResult || result.conflicts > 0) showToast(result.message);
      } catch (nextError) {
        const details = nextError instanceof Error ? nextError.message : String(nextError);
        setError((announceResult ? "" : TEXT.autoSyncFailed) + details);
      } finally {
        syncInFlightRef.current = false;
        if (announceResult) {
          setSyncBusy(false);
          setBusy(false);
        } else {
          setAutoSyncBusy(false);
        }
      }
    })();

    if (!announceResult) backgroundSyncPromiseRef.current = operation;
    try {
      await operation;
    } finally {
      if (backgroundSyncPromiseRef.current === operation) {
        backgroundSyncPromiseRef.current = null;
      }
    }
  }

  // Interval callbacks always call the runner from the latest render.
  autoSyncRunnerRef.current = async () => {
    await runDriveSync(false);
  };

  useEffect(() => {
    if (!driveStatus.signedIn || !hasNativeBridge) return undefined;
    const intervalId = window.setInterval(() => {
      void autoSyncRunnerRef.current();
    }, AUTO_SYNC_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [driveStatus.signedIn]);

  async function persist(nextDatabase: CardDatabase) {
    const saved = await saveCards(nextDatabase);
    databaseRef.current = saved;
    setDatabase(saved);
    return saved;
  }

  async function handleCreateCard() {
    if (!guardCardMutation()) return;
    if (!(await saveBeforeLeavingDraft())) return;
    await waitForBackgroundSync();
    const currentDatabase = databaseRef.current;
    const card = createCard(activeCategory !== ALL_CATEGORIES ? activeCategory : DEFAULT_CATEGORY);
    await persist({ ...currentDatabase, cards: [card, ...currentDatabase.cards] });
    setSelectedId(card.id);
    showToast(TEXT.createdToast);
  }

  async function saveCurrentDraft(showNotification = true) {
    const requestedCardId = draftRef.current?.id;
    if (!requestedCardId) return true;
    if (!hasUnsavedDraftNow()) return true;
    if (!guardCardMutation()) return false;

    try {
      await waitForBackgroundSync();
      const currentDraft = draftRef.current;
      if (!currentDraft || currentDraft.id !== requestedCardId) return false;

      const timestamp = nowIso();
      const normalized = normalizeCard({
        ...currentDraft,
        updatedAt: timestamp,
        updateHistory: [...currentDraft.updateHistory, timestamp]
      });
      const currentDatabase = databaseRef.current;
      const cardExists = currentDatabase.cards.some((card) => card.id === normalized.id);
      const nextCards = (cardExists
        ? currentDatabase.cards.map((card) => (card.id === normalized.id ? normalized : card))
        : [normalized, ...currentDatabase.cards]
      ).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const nextDeletedCards = { ...currentDatabase.deletedCards };
      delete nextDeletedCards[normalized.id];
      const saved = await persist({
        ...currentDatabase,
        cards: nextCards,
        deletedCards: nextDeletedCards
      });
      const savedDraft = cloneCard(saved.cards.find((card) => card.id === normalized.id) ?? normalized);
      draftRef.current = savedDraft;
      setDraft(savedDraft);
      if (showNotification) showToast(TEXT.savedToast);
      return true;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      return false;
    }
  }

  async function saveBeforeLeavingDraft() {
    if (!hasUnsavedDraftNow()) return true;
    return saveCurrentDraft(false);
  }

  async function handleSaveDraft() {
    await saveCurrentDraft(true);
  }

  async function handleSelectCard(cardId: string) {
    if (cardId === selectedId) return;
    if (!(await saveBeforeLeavingDraft())) return;
    setSelectedId(cardId);
  }

  async function handleDeleteCard(cardId: string) {
    if (!guardCardMutation()) return;
    const card =
      databaseRef.current.cards.find((item) => item.id === cardId) ??
      (draftRef.current?.id === cardId ? draftRef.current : null);
    if (!card) return;
    const confirmed = window.confirm(TEXT.deleteCard + "「" + getCardTitle(card) + "」？");
    if (!confirmed) return;

    await waitForBackgroundSync();
    const currentDatabase = databaseRef.current;
    const deletedAt = nowIso();
    const saved = await persist({
      ...currentDatabase,
      cards: currentDatabase.cards.filter((item) => item.id !== cardId),
      deletedCards: {
        ...currentDatabase.deletedCards,
        [cardId]: { deletedAt, deviceId: currentDatabase.deviceId }
      }
    });
    setSelectedId(saved.cards[0]?.id ?? null);
    showToast(TEXT.deletedToast);
  }

  function updateDraftField(key: keyof StudyCardFields, value: string) {
    setDraft((current) => {
      const nextDraft = current ? { ...current, fields: { ...current.fields, [key]: value } } : current;
      draftRef.current = nextDraft;
      return nextDraft;
    });
  }

  function updateDraftCategory(value: string) {
    setDraft((current) => {
      const nextDraft = current ? { ...current, category: value } : current;
      draftRef.current = nextDraft;
      return nextDraft;
    });
  }

  function updateDraftMajorCategory(major: string) {
    if (major === AI_LLM_CATEGORY) {
      updateDraftCategory(categoryPath(AI_LLM_CATEGORY, AI_LLM_SUBCATEGORIES[0]));
      return;
    }
    updateDraftCategory(major);
  }

  function updateDraftAiSubcategory(value: string) {
    if (value === CUSTOM_SUBCATEGORY_VALUE) {
      updateDraftCategory(categoryPath(AI_LLM_CATEGORY, draftAiSubcategoryIsCustom ? draftCategory.subcategory : CUSTOM_SUBCATEGORY_LABEL));
      return;
    }
    updateDraftCategory(categoryPath(AI_LLM_CATEGORY, value));
  }

  function updateDraftCustomAiSubcategory(value: string) {
    updateDraftCategory(categoryPath(AI_LLM_CATEGORY, value || CUSTOM_SUBCATEGORY_LABEL));
  }

  async function handleCopy(card: StudyCard) {
    await navigator.clipboard.writeText(formatCardMarkdown(card));
    showToast(TEXT.copiedToast);
  }

  function handleDragStart(event: React.DragEvent<HTMLElement>, card: StudyCard) {
    const markdown = formatCardMarkdown(card);
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", markdown);
    event.dataTransfer.setData("text/markdown", markdown);
    event.dataTransfer.setData("text/html", formatCardHtml(card));
  }

  async function handleThemeChange(themePreference: ThemePreference) {
    const next = { ...settings, themePreference };
    setSettings(next);
    try {
      await saveSettings({ themePreference });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }

  async function handleDriveSignIn() {
    try {
      signInCancelRequestedRef.current = false;
      setAuthBusy(true);
      setError("");
      const status = await signInDrive();
      setDriveStatus(status);
      showToast(TEXT.driveSignInToast);
    } catch (nextError) {
      if (signInCancelRequestedRef.current) {
        showToast(TEXT.signInCancelled);
      } else {
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      }
    } finally {
      signInCancelRequestedRef.current = false;
      setAuthBusy(false);
    }
  }

  async function handleCancelDriveSignIn() {
    signInCancelRequestedRef.current = true;
    try {
      await cancelSignInDrive();
      showToast(TEXT.signInCancelled);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleDriveSignOut() {
    try {
      setBusy(true);
      setError("");
      const status = await signOutDrive();
      setDriveStatus(status);
      showToast(TEXT.driveSignOutToast);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function handleDriveSync() {
    if (!guardWritableData()) return;
    if (hasUnsavedChanges) {
      setError(TEXT.saveBeforeSync);
      return;
    }
    await runDriveSync(true);
  }

  async function handleCheckUpdates() {
    setUpdateBusy(true);
    setError("");
    try {
      const status = await checkForUpdates();
      setUpdateStatus(status);
      if (status.status === "not-available") showToast(TEXT.noUpdateAvailable);
      if (status.status === "unavailable") showToast(status.error || TEXT.updateUnavailable);
      if (status.status === "error") setError(status.error || "Update error");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setUpdateBusy(false);
    }
  }

  async function handleDownloadUpdate() {
    setUpdateBusy(true);
    setError("");
    try {
      const status = await downloadUpdate();
      setUpdateStatus(status);
      if (status.status === "error") setError(status.error || "Update error");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setUpdateBusy(false);
    }
  }

  async function handleInstallUpdate() {
    try {
      await installUpdate();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true"><span /></div>
          <div>
            <h1>{TEXT.appName}</h1>
            <p>{database.cards.length} {TEXT.cardsUnit}</p>
          </div>
        </div>

        <button className="primary-button" onClick={handleCreateCard} disabled={dataLoadBlocked || syncBusy}>
          <Plus size={18} />
          {TEXT.newCard}
        </button>

        <label className="search-box">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={TEXT.searchCards} />
        </label>

        <div className="filter-heading">
          <Filter size={16} />
          {TEXT.categoryDirectory}
        </div>
        <nav className="category-tree" aria-label={TEXT.categoryDirectory}>
          <button
            className={activeCategory === ALL_CATEGORIES ? "tree-item root active" : "tree-item root"}
            onClick={() => setActiveCategory(ALL_CATEGORIES)}
          >
            <span className="tree-label-group">
              <span
                className="tree-expander"
                onClick={(event) => {
                  event.stopPropagation();
                  setRootOpen((open) => !open);
                }}
              >
                {rootOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </span>
              <span>{ALL_CATEGORIES}</span>
            </span>
            <b>{database.cards.length}</b>
          </button>

          {rootOpen
            ? categoryTree.map((category) => {
                const hasChildren = Boolean(category.children?.length);
                const isOpen = openCategoryIds.includes(category.id);
                return (
                  <div className="tree-branch" key={category.id}>
                    <button
                      className={activeCategory === category.path ? "tree-item major active" : "tree-item major"}
                      onClick={() => setActiveCategory(category.path)}
                    >
                      <span className="tree-label-group">
                        {hasChildren ? (
                          <span
                            className="tree-expander"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleCategoryOpen(category.id);
                            }}
                          >
                            {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          </span>
                        ) : (
                          <span className="tree-spacer" />
                        )}
                        <span>{category.label}</span>
                      </span>
                      <b>{categoryCount(category.path)}</b>
                    </button>

                    {hasChildren && isOpen ? (
                      <div className="tree-children">
                        {category.children?.map((child) => (
                          <button
                            key={child.id}
                            className={activeCategory === child.path ? "tree-item leaf active" : "tree-item leaf"}
                            onClick={() => setActiveCategory(child.path)}
                          >
                            <span>{child.label}</span>
                            <b>{categoryCount(child.path)}</b>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })
            : null}
        </nav>

        <div className="sidebar-footer">
          <button className="ghost-button" onClick={() => setSettingsOpen((open) => !open)}>
            <Settings size={17} />
            {TEXT.syncSettings}
          </button>
          <div className="sync-pill">
            {autoSyncBusy ? (
              <Loader2 className="spin" size={15} />
            ) : driveStatus.signedIn ? (
              <Cloud size={15} />
            ) : (
              <CloudOff size={15} />
            )}
            {autoSyncBusy ? TEXT.backgroundSyncing : driveStatus.signedIn ? TEXT.driveConnected : TEXT.localSave}
          </div>
        </div>
      </aside>

      <main className="content-grid">
        <section className="card-list-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Cards</p>
              <h2>{activeCategory === ALL_CATEGORIES ? TEXT.allCards : activeCategory}</h2>
            </div>
            <span className="result-count">{filteredCards.length}</span>
          </div>

          <div className="card-list">
            {filteredCards.map((card) => (
              <article
                key={card.id}
                className={card.id === selectedId ? "study-card active" : "study-card"}
                draggable
                onDragStart={(event) => handleDragStart(event, card)}
                onClick={() => void handleSelectCard(card.id)}
              >
                <div className="drag-handle" aria-hidden="true">
                  <GripVertical size={17} />
                </div>
                <div className="card-summary">
                  <div className="card-topline">
                    <span className="category-chip">{card.category}</span>
                    {card.conflictOf ? <span className="conflict-chip">{TEXT.conflictCopy}</span> : null}
                  </div>
                  <h3>{getCardTitle(card)}</h3>
                  <p>{card.fields.summary || card.fields.solves || TEXT.noDefinition}</p>
                  <div className="date-row">
                    <span>
                      <CalendarDays size={14} />
                      {formatDate(card.createdAt, false)}
                    </span>
                    <span>{TEXT.updated} {formatDate(card.updatedAt)}</span>
                  </div>
                </div>
                <button
                  className="icon-button"
                  title={TEXT.copyMarkdown}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleCopy(card);
                  }}
                >
                  <ClipboardCopy size={17} />
                </button>
              </article>
            ))}

            {filteredCards.length === 0 ? (
              <div className="empty-state">
                <h3>{TEXT.noMatchingCards}</h3>
                <button className="secondary-button" onClick={handleCreateCard} disabled={dataLoadBlocked || syncBusy}>
                  <Plus size={17} />
                  {TEXT.newOne}
                </button>
              </div>
            ) : null}
          </div>
        </section>

        <section className="editor-panel">
          {draft ? (
            <>
              <div className="editor-header">
                <label className="editor-title-block">
                  <span className="eyebrow">{TEXT.editor}</span>
                  <input
                    className="title-input"
                    value={draft.fields.concept}
                    onChange={(event) => updateDraftField("concept", event.target.value)}
                    placeholder={TEXT.unnamedCard} disabled={syncBusy}
                  />
                </label>
                <div className="editor-actions">
                  <button className="icon-button danger" title={TEXT.deleteCard} onClick={() => handleDeleteCard(draft.id)} disabled={dataLoadBlocked || syncBusy}>
                    <Trash2 size={17} />
                  </button>
                  <button className="secondary-button" onClick={() => handleCopy(draft)}>
                    <ClipboardCopy size={17} />
                    {TEXT.copy}
                  </button>
                  <button className="primary-button compact" onClick={handleSaveDraft} disabled={dataLoadBlocked || syncBusy || !hasUnsavedChanges}>
                    <Save size={17} />
                    {TEXT.save}
                  </button>
                </div>
              </div>

              <div className="meta-strip">
                <span>{TEXT.created} {formatDate(draft.createdAt)}</span>
                <span>{TEXT.latestUpdate} {formatDate(draft.updatedAt)}</span>
                <span>{getUpdateCount(draft)} {TEXT.updateTimes}</span>
              </div>

              <div className="category-input-block">
                <label className="field-block compact-field">
                  <span>{TEXT.majorCategory}</span>
                  <select value={draftCategory.major} onChange={(event) => updateDraftMajorCategory(event.target.value)} disabled={syncBusy}>
                    {CATEGORY_TREE.map((category) => (
                      <option key={category.id} value={category.label}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </label>

                {draftCategory.major === AI_LLM_CATEGORY ? (
                  <>
                    <label className="field-block compact-field">
                      <span>{TEXT.aiSubcategory}</span>
                      <select value={draftAiSubcategorySelectValue} onChange={(event) => updateDraftAiSubcategory(event.target.value)} disabled={syncBusy}>
                        {AI_LLM_SUBCATEGORIES.map((subcategory) => (
                          <option key={subcategory} value={subcategory}>
                            {subcategory}
                          </option>
                        ))}
                        <option value={CUSTOM_SUBCATEGORY_VALUE}>{CUSTOM_SUBCATEGORY_LABEL}</option>
                      </select>
                    </label>

                    {draftAiSubcategoryIsCustom ? (
                      <label className="field-block compact-field custom-category-field">
                        <span>{TEXT.customSubcategory}</span>
                        <input
                          value={draftCategory.subcategory}
                          onChange={(event) => updateDraftCustomAiSubcategory(event.target.value)}
                          placeholder={TEXT.customSubcategoryPlaceholder} disabled={syncBusy}
                        />
                      </label>
                    ) : null}
                  </>
                ) : null}
              </div>

              <div className="field-grid">
                {fieldDefinitions.map((field) => (
                  <label key={field.key} className={field.rows === 1 ? "field-block compact-field editor-field" : "field-block editor-field"}>
                    <span>{field.label}</span>
                    {field.rows === 1 ? (
                      <input
                        value={draft.fields[field.key]}
                        onChange={(event) => updateDraftField(field.key, event.target.value)}
                        placeholder={field.placeholder} disabled={syncBusy}
                      />
                    ) : (
                      <textarea
                        value={draft.fields[field.key]}
                        onChange={(event) => updateDraftField(field.key, event.target.value)}
                        placeholder={field.placeholder} disabled={syncBusy}
                        rows={field.rows}
                      />
                    )}
                  </label>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-editor">
              <h2>{TEXT.chooseOrCreate}</h2>
              <button className="primary-button" onClick={handleCreateCard} disabled={dataLoadBlocked || syncBusy}>
                <Plus size={18} />
                {TEXT.newCard}
              </button>
            </div>
          )}
        </section>
      </main>

      <aside className={settingsOpen ? "settings-panel open" : "settings-panel"}>
        <div className="settings-card">
          <div className="settings-header">
            <div>
              <p className="eyebrow">{TEXT.sync}</p>
              <h2>Google Drive</h2>
            </div>
            <button className="icon-button" title={TEXT.close} onClick={() => setSettingsOpen(false)}>
              <X size={18} />
            </button>
          </div>

          <div className="status-line">
            {syncBusy ? (
              <Loader2 className="spin" size={17} />
            ) : driveStatus.signedIn ? (
              <Check size={17} />
            ) : (
              <AlertTriangle size={17} />
            )}
            <span>{syncBusy ? TEXT.syncing : driveStatus.signedIn ? TEXT.connected : TEXT.disconnected}</span>
          </div>

          <div className="theme-section">
            <span>{TEXT.theme}</span>
            <div className="theme-toggle" role="group" aria-label={TEXT.theme}>
              {themeOptions.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  className={settings.themePreference === value ? "theme-option active" : "theme-option"}
                  onClick={() => handleThemeChange(value)}
                  title={label}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="update-section">
            <div className="update-header">
              <span>{TEXT.updates}</span>
              <small>{TEXT.currentVersion} {updateStatus.currentVersion}</small>
            </div>
            <p className="update-status">{updateStatusText}</p>
            <div className="update-actions">
              <button className="secondary-button compact" onClick={handleCheckUpdates} disabled={!hasNativeBridge || updateIsWorking}>
                {updateIsWorking ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
                {updateStatus.status === "downloading" ? TEXT.downloadingUpdate : updateIsWorking ? TEXT.checkingUpdates : TEXT.checkUpdates}
              </button>
              {updateStatus.status === "available" ? (
                <button className="secondary-button compact" onClick={handleDownloadUpdate} disabled={updateIsWorking}>
                  <Download size={16} />
                  {TEXT.downloadUpdate}
                </button>
              ) : null}
              {updateStatus.status === "downloaded" ? (
                <button className="primary-button compact" onClick={handleInstallUpdate}>
                  <RefreshCw size={16} />
                  {TEXT.installUpdate}
                </button>
              ) : null}
            </div>
          </div>

          {!driveStatus.configured ? (
            <p className="sync-config-warning">{TEXT.oauthNotConfigured}</p>
          ) : null}

          <div className="settings-actions">
            <button
              className="primary-button compact"
              onClick={authBusy ? handleCancelDriveSignIn : handleDriveSignIn}
              disabled={!authBusy && (busy || syncBusy || autoSyncBusy || !hasNativeBridge || !driveStatus.configured)}
            >
              {authBusy ? <Loader2 className="spin" size={17} /> : <Cloud size={17} />}
              {authBusy ? TEXT.cancelSignIn : TEXT.signIn}
            </button>
          </div>
          <button className="wide-action" onClick={handleDriveSync} disabled={dataLoadBlocked || busy || authBusy || syncBusy || autoSyncBusy || !driveStatus.signedIn}>
            {syncBusy ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
            {TEXT.syncNow}
          </button>

          <button className="text-button" onClick={handleDriveSignOut} disabled={busy || authBusy || syncBusy || autoSyncBusy || !driveStatus.signedIn}>
            {TEXT.disconnect}
          </button>

          <dl className="settings-facts">
            <div>
              <dt>{TEXT.autoSync}</dt>
              <dd>{TEXT.autoSyncEnabled}</dd>
            </div>
            <div>
              <dt>{TEXT.lastSync}</dt>
              <dd>{driveStatus.lastSyncedAt ? formatDate(driveStatus.lastSyncedAt) : TEXT.neverSynced}</dd>
            </div>
            <div>
              <dt>{TEXT.localData}</dt>
              <dd title={storageInfo?.dataPath}>{storageInfo?.dataPath || TEXT.browserPreview}</dd>
            </div>
          </dl>
        </div>
      </aside>

      {error ? (
        <div className="error-toast">
          <AlertTriangle size={17} />
          <span>{error}</span>
          <button onClick={() => setError("")}>{TEXT.close}</button>
        </div>
      ) : null}
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
