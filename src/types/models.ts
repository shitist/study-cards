export type StudyCardFields = {
  concept: string;
  encounteredBecause: string;
  solves: string;
  doesNotSolve: string;
  verification: string;
  summary: string;
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

export type CardDatabase = {
  schemaVersion: 1;
  deviceId: string;
  cards: StudyCard[];
  lastSavedAt: string;
};

export type ThemePreference = "system" | "light" | "dark";

export type AppSettings = {
  googleDriveClientId: string;
  syncEnabled: boolean;
  themePreference: ThemePreference;
};

export type DriveStatus = {
  configured: boolean;
  signedIn: boolean;
  syncEnabled: boolean;
  lastSyncedAt: string | null;
};

export type DriveSyncResult = {
  action: "uploaded" | "downloaded" | "merged" | "merged-with-conflicts" | "noop";
  database: CardDatabase;
  conflicts: number;
  message: string;
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
  signOutDrive: () => Promise<DriveStatus>;
  syncDrive: () => Promise<DriveSyncResult>;
};
