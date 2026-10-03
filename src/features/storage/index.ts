import { isTauriRuntime } from "@/app/runtime";
import { desktopStorage } from "./desktopStorage";
import { indexedDbStorage } from "./indexedDbStorage";

export const storage = isTauriRuntime ? desktopStorage : indexedDbStorage;

export { DEFAULT_READER_SETTINGS } from "./storage";
export { initializeDesktopStorage } from "./desktopStorage";
export type { BookStorage } from "./storage";
