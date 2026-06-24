import { isTauriRuntime } from "@/app/runtime";
import { desktopStorage } from "./desktopStorage";
import { indexedDbStorage } from "./indexedDbStorage";

export const storage = isTauriRuntime ? desktopStorage : indexedDbStorage;

export type { BookStorage } from "./storage";
