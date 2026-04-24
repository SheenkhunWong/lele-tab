import { browserApi, isExtensionRuntime } from '../browserApi';
import type { LayoutItem, StorageShape } from '../types';
import { storageDefaults } from '../types';

const STORAGE_PREFIX = 'lele-tab:';

const clone = <T>(value: T): T => (value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T));

const mergeLayoutDefaults = (layout?: LayoutItem[]): LayoutItem[] => {
  const storedLayout = Array.isArray(layout) ? layout : [];
  const storedByModule = new Map(storedLayout.map((item) => [item.moduleId, item]));
  const maxStoredOrder = storedLayout.reduce((max, item) => Math.max(max, item.order), -1);
  let appended = 0;

  return storageDefaults.settings.layout.map((defaultItem) => {
    const storedItem = storedByModule.get(defaultItem.moduleId);
    if (storedItem) return { ...defaultItem, ...storedItem };
    appended += 1;
    return { ...defaultItem, order: maxStoredOrder + appended };
  });
};

const mergeDefaults = <K extends keyof StorageShape>(key: K, value: StorageShape[K] | undefined): StorageShape[K] => {
  if (value === undefined || value === null) return clone(storageDefaults[key]);
  if (key === 'settings') {
    const settings = value as StorageShape['settings'];
    return {
      ...clone(storageDefaults.settings),
      ...settings,
      layout: mergeLayoutDefaults(settings.layout),
      weather: { ...storageDefaults.settings.weather, ...settings.weather },
      search: { ...storageDefaults.settings.search, ...settings.search },
      behavior: { ...storageDefaults.settings.behavior, ...settings.behavior },
      drive: {
        ...storageDefaults.settings.drive,
        ...settings.drive,
        fileNames: {
          ...storageDefaults.settings.drive.fileNames,
          ...settings.drive?.fileNames
        }
      }
    } as StorageShape[K];
  }
  return value;
};

export const readStorage = async <K extends keyof StorageShape>(key: K): Promise<StorageShape[K]> => {
  if (isExtensionRuntime()) {
    const result = await browserApi.storage.get<Partial<StorageShape>>({ [key]: storageDefaults[key] });
    return mergeDefaults(key, result[key]);
  }

  const raw = localStorage.getItem(`${STORAGE_PREFIX}${String(key)}`);
  if (!raw) return clone(storageDefaults[key]);
  try {
    return mergeDefaults(key, JSON.parse(raw) as StorageShape[K]);
  } catch {
    return clone(storageDefaults[key]);
  }
};

export const writeStorage = async <K extends keyof StorageShape>(key: K, value: StorageShape[K]): Promise<void> => {
  if (key === 'settings') {
    const theme = (value as StorageShape['settings']).theme;
    localStorage.setItem('lele-tab-theme', theme);
  }

  if (isExtensionRuntime()) {
    await browserApi.storage.set({ [key]: value });
    return;
  }

  localStorage.setItem(`${STORAGE_PREFIX}${String(key)}`, JSON.stringify(value));
};

export const updateStorage = async <K extends keyof StorageShape>(
  key: K,
  updater: (current: StorageShape[K]) => StorageShape[K]
): Promise<StorageShape[K]> => {
  const current = await readStorage(key);
  const next = updater(current);
  await writeStorage(key, next);
  return next;
};

export const clearLocalData = async (): Promise<void> => {
  const keys = ['settings', 'bookmarks', 'todos', 'calendar', 'archivedTabs', 'frequentSites', 'weatherCache', 'driveToken', 'serviceLogs'];
  if (isExtensionRuntime()) {
    await browserApi.storage.remove(keys);
    return;
  }

  keys.forEach((key) => localStorage.removeItem(`${STORAGE_PREFIX}${key}`));
};

export const wrapEnvelope = <T>(data: T) => ({
  schemaVersion: 1 as const,
  lastModified: Math.floor(Date.now() / 1000),
  data
});
