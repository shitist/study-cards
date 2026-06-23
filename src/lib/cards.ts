import type { CardDatabase, StudyCard, StudyCardFields } from "../types/models";

export type CategoryNode = {
  id: string;
  label: string;
  children?: CategoryNode[];
};

export const ALL_CATEGORIES = "\u5168\u90e8";
export const FALLBACK_CATEGORY = "\u672a\u5206\u7c7b";
export const CATEGORY_SEPARATOR = " / ";
export const AI_LLM_CATEGORY = "AI/LLM";

export const CATEGORY_TREE = [
  {
    id: "ai-llm",
    label: AI_LLM_CATEGORY,
    children: [
      { id: "ai-llm-foundations", label: "\u57fa\u7840\u6982\u5ff5" },
      { id: "ai-llm-models", label: "\u6a21\u578b\u4e0e\u67b6\u6784" },
      { id: "ai-llm-prompting", label: "\u63d0\u793a\u8bcd\u4e0e\u4e0a\u4e0b\u6587" },
      { id: "ai-llm-agents", label: "Agent \u4e0e\u5de5\u5177\u8c03\u7528" },
      { id: "ai-llm-rag", label: "RAG \u4e0e\u77e5\u8bc6\u5e93" },
      { id: "ai-llm-finetuning", label: "\u5fae\u8c03\u4e0e\u5bf9\u9f50" },
      { id: "ai-llm-inference", label: "\u63a8\u7406\u90e8\u7f72\u4e0e\u91cf\u5316" },
      { id: "ai-llm-evals", label: "\u8bc4\u6d4b\u4e0e\u5b89\u5168" },
      { id: "ai-llm-products", label: "API\u3001\u6210\u672c\u4e0e\u4ea7\u54c1" },
      { id: "ai-llm-multimodal", label: "\u591a\u6a21\u6001" }
    ]
  },
  { id: "history", label: "\u5386\u53f2" },
  { id: "geography", label: "\u5730\u7406" }
] as const satisfies CategoryNode[];

export const TOP_LEVEL_CATEGORIES: string[] = CATEGORY_TREE.map((category) => category.label);
export const AI_LLM_SUBCATEGORIES: string[] = [...(CATEGORY_TREE[0].children ?? [])].map((category) => category.label);
export const DEFAULT_CATEGORY = categoryPath(AI_LLM_CATEGORY, AI_LLM_SUBCATEGORIES[0]);

const fieldLabels: Record<keyof StudyCardFields, string> = {
  concept: "\u6982\u5ff5",
  summary: "\u5b9a\u4e49",
  encounteredBecause: "\u6211\u4e3a\u4ec0\u4e48\u9047\u5230\u5b83",
  solves: "\u5b83\u89e3\u51b3\u4ec0\u4e48\u95ee\u9898",
  doesNotSolve: "\u5b83\u4e0d\u89e3\u51b3\u4ec0\u4e48\u95ee\u9898",
  verification: "\u6211\u5b9e\u9645\u600e\u4e48\u9a8c\u8bc1",
  notes: "\u5907\u6ce8"
};

export const emptyFields: StudyCardFields = {
  concept: "",
  encounteredBecause: "",
  solves: "",
  doesNotSolve: "",
  verification: "",
  summary: "",
  notes: ""
};

export function nowIso() {
  return new Date().toISOString();
}

export function categoryPath(major: string, subcategory?: string) {
  const cleanMajor = major.trim() || AI_LLM_CATEGORY;
  const cleanSubcategory = subcategory?.trim();
  return cleanSubcategory ? `${cleanMajor}${CATEGORY_SEPARATOR}${cleanSubcategory}` : cleanMajor;
}

export function parseCategory(category: string) {
  const value = category.trim();
  if (!value) {
    return { major: AI_LLM_CATEGORY, subcategory: AI_LLM_SUBCATEGORIES[0] };
  }

  const parts = value.split(CATEGORY_SEPARATOR).map((part) => part.trim()).filter(Boolean);
  const major = parts[0];

  if (TOP_LEVEL_CATEGORIES.includes(major)) {
    return { major, subcategory: parts.slice(1).join(CATEGORY_SEPARATOR) };
  }

  return { major: AI_LLM_CATEGORY, subcategory: value };
}

export function normalizeCategory(category: string) {
  const { major, subcategory } = parseCategory(category);
  if (major === AI_LLM_CATEGORY) {
    return categoryPath(major, subcategory || AI_LLM_SUBCATEGORIES[0]);
  }
  return major;
}

export function categoryMatches(cardCategory: string, filterCategory: string) {
  if (filterCategory === ALL_CATEGORIES) return true;

  const card = parseCategory(cardCategory);
  const filter = parseCategory(filterCategory);

  if (!filter.subcategory) {
    return card.major === filter.major;
  }

  return card.major === filter.major && card.subcategory === filter.subcategory;
}

export function createEmptyDatabase(): CardDatabase {
  return {
    schemaVersion: 2,
    deviceId: crypto.randomUUID(),
    cards: [],
    deletedCards: {},
    lastSavedAt: nowIso()
  };
}

export function createCard(category: string = DEFAULT_CATEGORY): StudyCard {
  const timestamp = nowIso();
  return {
    id: crypto.randomUUID(),
    category: normalizeCategory(category),
    createdAt: timestamp,
    updatedAt: timestamp,
    updateHistory: [timestamp],
    fields: { ...emptyFields }
  };
}

export function normalizeCard(card: StudyCard): StudyCard {
  return {
    ...card,
    category: normalizeCategory(card.category),
    fields: {
      ...emptyFields,
      ...card.fields,
      concept: card.fields.concept.trim()
    },
    updateHistory: Array.from(new Set(card.updateHistory.length > 0 ? card.updateHistory : [card.updatedAt]))
  };
}

export function formatDate(value: string, withTime = true) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {})
  }).format(date);
}

export function getCardTitle(card: StudyCard) {
  return card.fields.concept.trim() || "\u672a\u547d\u540d\u5361\u7247";
}

export function cardMatches(card: StudyCard, query: string, category: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!categoryMatches(card.category, category)) return false;
  if (!normalizedQuery) return true;

  return card.fields.concept.trim().toLowerCase().includes(normalizedQuery);
}

export function formatCardMarkdown(card: StudyCard) {
  const lines = [
    `# ${getCardTitle(card)}`,
    "",
    `- \u4e13\u4e1a\u7c7b\u522b\uff1a${card.category || FALLBACK_CATEGORY}`,
    `- \u521b\u5efa\u65e5\u671f\uff1a${formatDate(card.createdAt)}`,
    `- \u6700\u65b0\u66f4\u65b0\uff1a${formatDate(card.updatedAt)}`,
    ""
  ];

  (Object.keys(fieldLabels) as Array<keyof StudyCardFields>).forEach((key) => {
    lines.push(`## ${fieldLabels[key]}`);
    lines.push(card.fields[key]?.trim() || "\uff08\u7a7a\uff09");
    lines.push("");
  });

  return lines.join("\n").trimEnd();
}

export function formatCardHtml(card: StudyCard) {
  const escapeHtml = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br />");

  const sections = (Object.keys(fieldLabels) as Array<keyof StudyCardFields>)
    .map((key) => `<h2>${fieldLabels[key]}</h2><p>${escapeHtml(card.fields[key]?.trim() || "\uff08\u7a7a\uff09")}</p>`)
    .join("");

  return `<article><h1>${escapeHtml(getCardTitle(card))}</h1><p><strong>\u4e13\u4e1a\u7c7b\u522b\uff1a</strong>${escapeHtml(card.category || FALLBACK_CATEGORY)}</p><p><strong>\u521b\u5efa\u65e5\u671f\uff1a</strong>${formatDate(card.createdAt)}</p><p><strong>\u6700\u65b0\u66f4\u65b0\uff1a</strong>${formatDate(card.updatedAt)}</p>${sections}</article>`;
}

export function getUpdateCount(card: StudyCard) {
  return Math.max(0, card.updateHistory.length - 1);
}
