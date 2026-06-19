import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Cloud,
  CloudOff,
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
import { useEffect, useMemo, useState } from "react";
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
  getDriveStatus,
  getStorageInfo,
  hasNativeBridge,
  loadCards,
  loadSettings,
  saveCards,
  saveSettings,
  signInDrive,
  signOutDrive,
  syncDrive
} from "./lib/storage";
import type { AppSettings, CardDatabase, DriveStatus, StorageInfo, StudyCard, StudyCardFields, ThemePreference } from "./types/models";

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
  saveSettings: "\u4fdd\u5b58\u8bbe\u7f6e",
  signIn: "\u767b\u5f55",
  syncNow: "\u7acb\u5373\u540c\u6b65",
  disconnect: "\u65ad\u5f00\u8fde\u63a5",
  lastSync: "\u4e0a\u6b21\u540c\u6b65",
  neverSynced: "\u5c1a\u672a\u540c\u6b65",
  localData: "\u672c\u5730\u6570\u636e",
  browserPreview: "\u6d4f\u89c8\u5668\u9884\u89c8\u6a21\u5f0f",
  close: "\u5173\u95ed",
  createdToast: "\u5df2\u65b0\u5efa\u5361\u7247",
  savedToast: "\u5df2\u4fdd\u5b58\u5361\u7247",
  deletedToast: "\u5df2\u5220\u9664\u5361\u7247",
  copiedToast: "\u5df2\u590d\u5236 Markdown",
  settingsSavedToast: "\u540c\u6b65\u8bbe\u7f6e\u5df2\u4fdd\u5b58",
  driveSignInToast: "Google Drive \u5df2\u8fde\u63a5",
  driveSignOutToast: "\u5df2\u65ad\u5f00 Google Drive",
  dataLoadBlocked: "\u672c\u5730\u6570\u636e\u8bfb\u53d6\u5931\u8d25\uff0c\u5df2\u6682\u505c\u5199\u5165\uff0c\u907f\u514d\u8986\u76d6\u539f\u6587\u4ef6\u3002\u8bf7\u5148\u5904\u7406\u9519\u8bef\u6216\u5907\u4efd\u6587\u4ef6\u540e\u91cd\u542f\u5e94\u7528\u3002"
};

const fieldDefinitions: FieldDefinition[] = [
  { key: "concept", label: TEXT.concept, placeholder: TEXT.exampleConcept, rows: 1 },
  { key: "summary", label: TEXT.definition, placeholder: TEXT.definitionPlaceholder, rows: 2 },
  { key: "encounteredBecause", label: TEXT.encounteredBecause, placeholder: TEXT.encounteredPlaceholder, rows: 3 },
  { key: "solves", label: TEXT.solves, placeholder: TEXT.solvesPlaceholder, rows: 3 },
  { key: "doesNotSolve", label: TEXT.doesNotSolve, placeholder: TEXT.boundaryPlaceholder, rows: 3 },
  { key: "verification", label: TEXT.verification, placeholder: TEXT.verificationPlaceholder, rows: 3 }
];

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
  syncEnabled: false,
  lastSyncedAt: null
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
  const [rootOpen, setRootOpen] = useState(true);
  const [openCategoryIds, setOpenCategoryIds] = useState<string[]>(["ai-llm"]);
  const [settings, setSettings] = useState<AppSettings>({ googleDriveClientId: "", syncEnabled: false, themePreference: "system" });
  const [driveStatus, setDriveStatus] = useState<DriveStatus>(defaultDriveStatus);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dataLoadBlocked, setDataLoadBlocked] = useState(false);
  const { message: toast, showToast } = useToast();

  useEffect(() => {
    let mounted = true;
    async function bootstrap() {
      try {
        const loadedDb = await loadCards();
        if (!mounted) return;
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
        const [loadedSettings, loadedDriveStatus, info] = await Promise.all([
          loadSettings(),
          getDriveStatus(),
          getStorageInfo()
        ]);
        if (!mounted) return;
        setSettings(loadedSettings);
        setDriveStatus(loadedDriveStatus);
        setStorageInfo(info);
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
    setDraft(selectedCard ? cloneCard(selectedCard) : null);
  }, [selectedCard]);

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

  const hasUnsavedChanges = Boolean(draft && selectedCard && JSON.stringify(draft) !== JSON.stringify(selectedCard));

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

  async function persist(nextDatabase: CardDatabase) {
    const saved = await saveCards(nextDatabase);
    setDatabase(saved);
    return saved;
  }

  async function handleCreateCard() {
    if (!guardWritableData()) return;
    const card = createCard(activeCategory !== ALL_CATEGORIES ? activeCategory : DEFAULT_CATEGORY);
    const nextCards = [card, ...database.cards];
    const saved = await persist({ ...database, cards: nextCards });
    setSelectedId(saved.cards[0].id);
    showToast(TEXT.createdToast);
  }

  async function handleSaveDraft() {
    if (!draft || !guardWritableData()) return;
    const timestamp = nowIso();
    const normalized = normalizeCard({
      ...draft,
      updatedAt: timestamp,
      updateHistory: [...draft.updateHistory, timestamp]
    });
    const nextCards = database.cards
      .map((card) => (card.id === normalized.id ? normalized : card))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const saved = await persist({ ...database, cards: nextCards });
    setSelectedId(normalized.id);
    setDraft(cloneCard(saved.cards.find((card) => card.id === normalized.id) ?? normalized));
    showToast(TEXT.savedToast);
  }

  async function handleDeleteCard(cardId: string) {
    if (!guardWritableData()) return;
    const card = database.cards.find((item) => item.id === cardId);
    if (!card) return;
    const confirmed = window.confirm(`${TEXT.deleteCard}\u300c${getCardTitle(card)}\u300d\uff1f`);
    if (!confirmed) return;

    const nextCards = database.cards.filter((item) => item.id !== cardId);
    const saved = await persist({ ...database, cards: nextCards });
    setSelectedId(saved.cards[0]?.id ?? null);
    showToast(TEXT.deletedToast);
  }

  function updateDraftField(key: keyof StudyCardFields, value: string) {
    setDraft((current) => (current ? { ...current, fields: { ...current.fields, [key]: value } } : current));
  }

  function updateDraftCategory(value: string) {
    setDraft((current) => (current ? { ...current, category: value } : current));
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

  async function handleSaveSettings() {
    try {
      setBusy(true);
      setError("");
      const saved = await saveSettings(settings);
      setSettings(saved);
      setDriveStatus(await getDriveStatus());
      showToast(TEXT.settingsSavedToast);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function handleDriveSignIn() {
    try {
      setBusy(true);
      setError("");
      await saveSettings(settings);
      const status = await signInDrive();
      setDriveStatus(status);
      showToast(TEXT.driveSignInToast);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
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
    try {
      setBusy(true);
      setError("");
      const result = await syncDrive();
      setDatabase(result.database);
      setDriveStatus(await getDriveStatus());
      setSelectedId(result.database.cards[0]?.id ?? null);
      showToast(result.message);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
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

        <button className="primary-button" onClick={handleCreateCard} disabled={dataLoadBlocked}>
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
            {driveStatus.signedIn ? <Cloud size={15} /> : <CloudOff size={15} />}
            {driveStatus.signedIn ? TEXT.driveConnected : TEXT.localSave}
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
                onClick={() => setSelectedId(card.id)}
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
                <button className="secondary-button" onClick={handleCreateCard} disabled={dataLoadBlocked}>
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
                  <span className="eyebrow">Editor</span>
                  <input
                    className="title-input"
                    value={draft.fields.concept}
                    onChange={(event) => updateDraftField("concept", event.target.value)}
                    placeholder={TEXT.unnamedCard}
                  />
                </label>
                <div className="editor-actions">
                  <button className="icon-button danger" title={TEXT.deleteCard} onClick={() => handleDeleteCard(draft.id)} disabled={dataLoadBlocked}>
                    <Trash2 size={17} />
                  </button>
                  <button className="secondary-button" onClick={() => handleCopy(draft)}>
                    <ClipboardCopy size={17} />
                    {TEXT.copy}
                  </button>
                  <button className="primary-button compact" onClick={handleSaveDraft} disabled={dataLoadBlocked || !hasUnsavedChanges}>
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
                  <select value={draftCategory.major} onChange={(event) => updateDraftMajorCategory(event.target.value)}>
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
                      <select value={draftAiSubcategorySelectValue} onChange={(event) => updateDraftAiSubcategory(event.target.value)}>
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
                          placeholder={TEXT.customSubcategoryPlaceholder}
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
                        placeholder={field.placeholder}
                      />
                    ) : (
                      <textarea
                        value={draft.fields[field.key]}
                        onChange={(event) => updateDraftField(field.key, event.target.value)}
                        placeholder={field.placeholder}
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
              <button className="primary-button" onClick={handleCreateCard} disabled={dataLoadBlocked}>
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
              <p className="eyebrow">Sync</p>
              <h2>Google Drive</h2>
            </div>
            <button className="icon-button" title={TEXT.close} onClick={() => setSettingsOpen(false)}>
              <X size={18} />
            </button>
          </div>

          <div className="status-line">
            {driveStatus.signedIn ? <Check size={17} /> : <AlertTriangle size={17} />}
            <span>{driveStatus.signedIn ? TEXT.connected : TEXT.disconnected}</span>
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

          <label className="field-block compact-field">
            <span>OAuth Client ID</span>
            <input
              value={settings.googleDriveClientId}
              onChange={(event) => setSettings({ ...settings, googleDriveClientId: event.target.value })}
              placeholder="xxxx.apps.googleusercontent.com"
              spellCheck={false}
            />
          </label>

          <div className="settings-actions">
            <button className="secondary-button" onClick={handleSaveSettings} disabled={busy}>
              {TEXT.saveSettings}
            </button>
            <button className="primary-button compact" onClick={handleDriveSignIn} disabled={busy || !hasNativeBridge}>
              {busy ? <Loader2 className="spin" size={17} /> : <Cloud size={17} />}
              {TEXT.signIn}
            </button>
          </div>

          <button className="wide-action" onClick={handleDriveSync} disabled={dataLoadBlocked || busy || !driveStatus.signedIn}>
            {busy ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
            {TEXT.syncNow}
          </button>

          <button className="text-button" onClick={handleDriveSignOut} disabled={busy || !driveStatus.signedIn}>
            {TEXT.disconnect}
          </button>

          <dl className="settings-facts">
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
