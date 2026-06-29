import type { AppSettings, CardDatabase, DriveStatus, DriveSyncResult, StorageInfo, UpdateStatus } from "../types/models";
import { createEmptyDatabase } from "./cards";

const fallbackDatabaseKey = "study-cards.database.v1";
const fallbackSettingsKey = "study-cards.settings.v1";

export const hasNativeBridge = Boolean(window.studyCards);

const unavailableUpdateStatus: UpdateStatus = {
  status: "unavailable",
  currentVersion: "browser-preview",
  version: null,
  percent: null,
  error: "\u81ea\u52a8\u66f4\u65b0\u53ea\u80fd\u5728\u684c\u9762 App \u4e2d\u4f7f\u7528\u3002"
};

export async function loadCards(): Promise<CardDatabase> {
  if (window.studyCards) return window.studyCards.loadCards();
  const raw = localStorage.getItem(fallbackDatabaseKey);
  if (!raw) return createEmptyDatabase();

  try {
    const parsed = JSON.parse(raw) as Partial<CardDatabase> & { schemaVersion?: number };
    const fallback = createEmptyDatabase();
    return {
      schemaVersion: 2,
      deviceId: typeof parsed.deviceId === "string" && parsed.deviceId ? parsed.deviceId : fallback.deviceId,
      cards: Array.isArray(parsed.cards) ? parsed.cards : [],
      deletedCards:
        parsed.deletedCards && typeof parsed.deletedCards === "object" && !Array.isArray(parsed.deletedCards)
          ? parsed.deletedCards
          : {},
      lastSavedAt: typeof parsed.lastSavedAt === "string" ? parsed.lastSavedAt : fallback.lastSavedAt
    };
  } catch {
    localStorage.setItem(`${fallbackDatabaseKey}.corrupt.${Date.now()}`, raw);
    throw new Error("Browser preview card data is corrupt. Loading stopped to avoid overwriting it.");
  }
}

export async function saveCards(database: CardDatabase): Promise<CardDatabase> {
  if (window.studyCards) return window.studyCards.saveCards(database);
  const next = { ...database, lastSavedAt: new Date().toISOString() };
  localStorage.setItem(fallbackDatabaseKey, JSON.stringify(next));
  return next;
}

export async function getStorageInfo(): Promise<StorageInfo | null> {
  if (!window.studyCards) return null;
  return window.studyCards.getStorageInfo();
}

export async function loadSettings(): Promise<AppSettings> {
  if (window.studyCards) return window.studyCards.loadSettings();
  const raw = localStorage.getItem(fallbackSettingsKey);
  if (!raw) return { themePreference: "system" };

  let parsed: Partial<AppSettings>;
  try {
    parsed = JSON.parse(raw) as Partial<AppSettings>;
  } catch {
    localStorage.removeItem(fallbackSettingsKey);
    parsed = {};
  }

  return {
    themePreference: parsed.themePreference === "light" || parsed.themePreference === "dark" ? parsed.themePreference : "system"
  };
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  if (window.studyCards) return window.studyCards.saveSettings(settings);
  const current = await loadSettings();
  const next = { ...current, ...settings };
  localStorage.setItem(fallbackSettingsKey, JSON.stringify(next));
  return next;
}

export async function getDriveStatus(): Promise<DriveStatus> {
  if (!window.studyCards) return { configured: false, signedIn: false, lastSyncedAt: null };
  return window.studyCards.getDriveStatus();
}

export async function signInDrive(): Promise<DriveStatus> {
  if (!window.studyCards) throw new Error("Google Drive \u540c\u6b65\u53ea\u80fd\u5728\u684c\u9762 App \u4e2d\u4f7f\u7528\u3002");
  return window.studyCards.signInDrive();
}

export async function cancelSignInDrive(): Promise<{ cancelled: boolean }> {
  if (!window.studyCards) return { cancelled: false };
  return window.studyCards.cancelSignInDrive();
}

export async function signOutDrive(): Promise<DriveStatus> {
  if (!window.studyCards) throw new Error("Google Drive \u540c\u6b65\u53ea\u80fd\u5728\u684c\u9762 App \u4e2d\u4f7f\u7528\u3002");
  return window.studyCards.signOutDrive();
}

export async function syncDrive(): Promise<DriveSyncResult> {
  if (!window.studyCards) throw new Error("Google Drive \u540c\u6b65\u53ea\u80fd\u5728\u684c\u9762 App \u4e2d\u4f7f\u7528\u3002");
  return window.studyCards.syncDrive();
}

export async function getUpdateStatus(): Promise<UpdateStatus> {
  if (!window.studyCards) return unavailableUpdateStatus;
  return window.studyCards.getUpdateStatus();
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!window.studyCards) return unavailableUpdateStatus;
  return window.studyCards.checkForUpdates();
}

export async function downloadUpdate(): Promise<UpdateStatus> {
  if (!window.studyCards) return unavailableUpdateStatus;
  return window.studyCards.downloadUpdate();
}

export async function installUpdate(): Promise<UpdateStatus> {
  if (!window.studyCards) return unavailableUpdateStatus;
  return window.studyCards.installUpdate();
}

export function onUpdateStatus(callback: (status: UpdateStatus) => void) {
  if (!window.studyCards) return () => undefined;
  return window.studyCards.onUpdateStatus(callback);
}