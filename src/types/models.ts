export type StudyCardFields = {
  concept: string;
  encounteredBecause: string;
  solves: string;
  doesNotSolve: string;
  verification: string;
  summary: string;
  notes: string;
};

export type StudyCard = {
  id: string;
  category: string;
  createdAt: string;
  updatedAt: string;
  updateHistory: string[];
  conflictOf?: string;
  fields: StudyCardFields;
};

export type CardDeletion = {
  deletedAt: string;
  deviceId: string;
};

export type CardDatabase = {
  schemaVersion: 2;
  deviceId: string;
  cards: StudyCard[];
  deletedCards: Record<string, CardDeletion>;
  lastSavedAt: string;
};

export type ThemePreference = "system" | "light" | "dark";

export type AppSettings = {
  themePreference: ThemePreference;
};

export type DriveStatus = {
  configured: boolean;
  signedIn: boolean;
  lastSyncedAt: string | null;
};

export type DriveSyncResult = {
  action: "uploaded" | "downloaded" | "merged" | "merged-with-conflicts" | "noop";
  database: CardDatabase;
  conflicts: number;
  message: string;
};

export type UpdateStatus = {
  status: "idle" | "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error" | "unavailable";
  currentVersion: string;
  version: string | null;
  percent: number | null;
  error: string | null;
};

export type StorageInfo = {
  dataPath: string;
  userDataPath: string;
};

export type StudyCardsBridge = {
  loadCards: () => Promise<CardDatabase>;
  saveCards: (database: CardDatabase) => Promise<CardDatabase>;
  getStorageInfo: () => Promise<StorageInfo>;
  loadSettings: () => Promise<AppSettings>;
  saveSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>;
  getDriveStatus: () => Promise<DriveStatus>;
  signInDrive: () => Promise<DriveStatus>;
  cancelSignInDrive: () => Promise<{ cancelled: boolean }>;
  signOutDrive: () => Promise<DriveStatus>;
  syncDrive: () => Promise<DriveSyncResult>;
  getUpdateStatus: () => Promise<UpdateStatus>;
  checkForUpdates: () => Promise<UpdateStatus>;
  downloadUpdate: () => Promise<UpdateStatus>;
  installUpdate: () => Promise<UpdateStatus>;
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void;
};