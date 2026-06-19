import type { StudyCardsBridge } from "./models";

declare global {
  interface Window {
    studyCards?: StudyCardsBridge;
  }
}

export {};
