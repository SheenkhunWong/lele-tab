import { browserApi } from '../lib/browserApi';
import { createId } from '../lib/bookmarks/html';
import { downloadAllDataFromDrive, getDriveToken, uploadAllDataToDrive } from '../lib/drive/driveClient';
import { readStorage, updateStorage, writeStorage } from '../lib/storage/storage';
import type { ArchivedTabGroup, BookmarkNode, RuntimeMessage, RuntimeResponse, RuntimeTab, ServiceLog } from '../lib/types';

const api = browserApi.raw();
const MAX_LOGS = 50;
const AUTO_SYNC_ALARM = 'lele-tab-auto-sync';
const SYNC_KEYS = new Set(['bookmarks', 'todos', 'calendar', 'settings', 'archivedTabs', 'frequentSites']);

const respond = <T>(data: T): RuntimeResponse<T> => ({ ok: true, data });
const fail = (error: unknown): RuntimeResponse => ({ ok: false, error: error instanceof Error ? error.message : String(error) });

const log = async (level: ServiceLog['level'], message: string) => {
  try {
    await updateStorage('serviceLogs', (logs = []) =>
      [
        {
          id: createId('log'),
          level,
          message,
          createdAt: Date.now()
        },
        ...logs
      ].slice(0, MAX_LOGS)
    );
  } catch {
    // Logging must never break the service worker.
  }
};

const asRuntimeTab = (tab: chrome.tabs.Tab): RuntimeTab => ({
  id: tab.id,
  windowId: tab.windowId,
  title: tab.title,
  url: tab.url,
  favIconUrl: tab.favIconUrl,
  active: tab.active
});

const getTabs = async (scope: 'current' | 'all') => {
  const tabs = await browserApi.tabs.query(scope === 'current' ? { currentWindow: true } : {});
  return tabs.filter((tab) => tab.url && !tab.url.startsWith('chrome-extension://')).map(asRuntimeTab);
};

const archiveTabs = async (scope: 'current' | 'all') => {
  const tabs = await getTabs(scope);
  const group: ArchivedTabGroup = {
    id: createId('archive'),
    name: `归档 ${new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date())}`,
    tabs: tabs.map((tab) => ({ title: tab.title ?? tab.url ?? 'Untitled', url: tab.url ?? '', favicon: tab.favIconUrl })).filter((tab) => tab.url),
    createdAt: Date.now()
  };
  await updateStorage('archivedTabs', (groups) => [group, ...groups]);

  const bookmarks = await readStorage('bookmarks');
  const folder: BookmarkNode = {
    id: createId('folder'),
    type: 'folder',
    title: group.name,
    order: bookmarks.length,
    createdAt: group.createdAt,
    updatedAt: group.createdAt,
    children: group.tabs.map((tab, order) => ({
      id: createId('bookmark'),
      type: 'link',
      title: tab.title,
      url: tab.url,
      icon: tab.favicon,
      order,
      createdAt: group.createdAt,
      updatedAt: group.createdAt
    }))
  };
  await writeStorage('bookmarks', [...bookmarks, folder]);
  return group;
};

const nativeBookmarksToNodes = (nodes: chrome.bookmarks.BookmarkTreeNode[], root = true): BookmarkNode[] => {
  const timestamp = Date.now();
  return nodes.flatMap((node, order) => {
    if (root && !node.url) return nativeBookmarksToNodes(node.children ?? [], false);
    if (node.url) {
      return [
        {
          id: node.id || createId('bookmark'),
          type: 'link' as const,
          title: node.title || node.url,
          url: node.url,
          order,
          createdAt: node.dateAdded ?? timestamp,
          updatedAt: node.dateGroupModified ?? node.dateAdded ?? timestamp
        }
      ];
    }

    return [
      {
        id: node.id || createId('folder'),
        type: 'folder' as const,
        title: node.title || 'Folder',
        order,
        createdAt: node.dateAdded ?? timestamp,
        updatedAt: node.dateGroupModified ?? node.dateAdded ?? timestamp,
        children: nativeBookmarksToNodes(node.children ?? [], false)
      }
    ];
  });
};

const importBrowserBookmarks = async () => {
  if (!api?.bookmarks?.getTree) throw new Error('Bookmarks API is unavailable.');
  const result = api.bookmarks.getTree();
  const tree =
    result && typeof (result as Promise<chrome.bookmarks.BookmarkTreeNode[]>).then === 'function'
      ? await (result as Promise<chrome.bookmarks.BookmarkTreeNode[]>)
      : await new Promise<chrome.bookmarks.BookmarkTreeNode[]>((resolve, reject) => {
          api.bookmarks!.getTree((nodes) => {
            const error = api.runtime?.lastError;
            if (error) reject(new Error(error.message));
            else resolve(nodes);
          });
        });
  return nativeBookmarksToNodes(tree);
};

const handleMessage = async (message: RuntimeMessage): Promise<RuntimeResponse> => {
  switch (message.type) {
    case 'GET_TABS':
      return respond(await getTabs(message.scope));
    case 'FOCUS_TAB':
      await browserApi.tabs.update(message.tabId, { active: true });
      if (message.windowId !== undefined) await browserApi.windows.update(message.windowId, { focused: true });
      return respond(true);
    case 'CLOSE_TAB':
      await browserApi.tabs.remove(message.tabId);
      return respond(true);
    case 'ARCHIVE_TABS':
      return respond(await archiveTabs(message.scope));
    case 'IMPORT_BROWSER_BOOKMARKS':
      return respond(await importBrowserBookmarks());
    case 'OPEN_URL':
      await browserApi.tabs.create({ url: message.url, active: message.active ?? true });
      return respond(true);
    case 'GET_LOGS':
      return respond(await readStorage('serviceLogs'));
    case 'CLEAR_LOGS':
      await writeStorage('serviceLogs', []);
      return respond(true);
    default:
      return fail('Unsupported message.');
  }
};

api?.runtime?.onMessage?.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch(async (error) => {
      await log('error', error instanceof Error ? error.message : String(error));
      sendResponse(fail(error));
    });
  return true;
});

const runAutoDownload = async () => {
  try {
    const [settings, token] = await Promise.all([readStorage('settings'), getDriveToken()]);
    if (!settings.drive.autoSync || !token) return;
    const pulled = await downloadAllDataFromDrive(token);
    if (pulled.bookmarks) await writeStorage('bookmarks', pulled.bookmarks);
    if (pulled.calendar) await writeStorage('calendar', pulled.calendar);
    if (pulled.todos) await writeStorage('todos', pulled.todos);
    if (pulled.settings) await writeStorage('settings', pulled.settings);
    if (pulled.archivedTabs) await writeStorage('archivedTabs', pulled.archivedTabs);
    if (pulled.frequentSites) await writeStorage('frequentSites', pulled.frequentSites);
    await log('info', 'Auto sync download complete.');
  } catch (error) {
    await log('warn', `Auto sync download failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const scheduleAutoUpload = async (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
  if (areaName !== 'local') return;
  if (!Object.keys(changes).some((key) => SYNC_KEYS.has(key))) return;
  const [settings, token] = await Promise.all([readStorage('settings'), getDriveToken()]);
  if (!settings.drive.autoSync || !token) return;
  api?.alarms?.create(AUTO_SYNC_ALARM, { delayInMinutes: 0.5 });
};

api?.storage?.onChanged?.addListener((changes, areaName) => {
  void scheduleAutoUpload(changes, areaName);
});

api?.alarms?.onAlarm?.addListener((alarm) => {
  if (alarm.name !== AUTO_SYNC_ALARM) return;
  void (async () => {
    try {
      const token = await getDriveToken();
      if (!token) return;
      await uploadAllDataToDrive(token);
      await log('info', 'Auto sync upload complete.');
    } catch (error) {
      await log('warn', `Auto sync upload failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  })();
});

const maybeCreateNewTab = async (windowId: number) => {
  try {
    const settings = await readStorage('settings');
    if (!settings.behavior.preventLastTabClose) return;
    const tabs = await browserApi.tabs.query({ windowId });
    if (tabs.length === 0) await browserApi.tabs.create({ windowId });
  } catch (error) {
    await log('warn', error instanceof Error ? error.message : String(error));
  }
};

api?.tabs?.onRemoved?.addListener((_, removeInfo) => {
  if (removeInfo.isWindowClosing) return;
  void maybeCreateNewTab(removeInfo.windowId);
});

api?.runtime?.onInstalled?.addListener(() => {
  void log('info', 'LeLe Tab installed.');
});

api?.runtime?.onStartup?.addListener(() => {
  void log('info', 'LeLe Tab started.');
  void runAutoDownload();
});

void runAutoDownload();
