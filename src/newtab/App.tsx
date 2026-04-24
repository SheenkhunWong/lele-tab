import {
  BookmarkPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudSun,
  Download,
  Folder,
  GripVertical,
  Image,
  Loader2,
  LogOut,
  PencilLine,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings as SettingsIcon,
  Star,
  Trash2,
  Upload,
  UserRound,
  X
} from 'lucide-react';
import { getSolarTermForDate } from '../lib/calendar/solarTerms';
import { HOLIDAY_COUNTRIES, getHolidaysForDate } from '../lib/calendar/holidays';
import { computeBaZi } from '../lib/calendar/bazi';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { browserApi, isExtensionRuntime } from '../lib/browserApi';
import { createId, mergeBookmarksByUrl, parseBookmarkHtml, serializeBookmarkHtml } from '../lib/bookmarks/html';
import { authorizeDrive, downloadAllDataFromDrive, getDriveToken, revokeDriveToken, uploadAllDataToDrive } from '../lib/drive/driveClient';
import { moduleLabels, t } from '../lib/i18n';
import { readStorage, writeStorage } from '../lib/storage/storage';
import type { ArchivedTabGroup, BookmarkNode, CalendarEvent, FrequentSite, RuntimeTab, Settings, Todo, WeatherSnapshot } from '../lib/types';
import { defaultLayout, defaultSettings } from '../lib/types';
import { loadOpenMeteoWeather, weatherCodeLabel } from '../lib/weather/openMeteo';

type DataState = {
  settings: Settings;
  bookmarks: BookmarkNode[];
  todos: Todo[];
  calendar: CalendarEvent[];
  weather?: WeatherSnapshot;
  tabs: RuntimeTab[];
  frequentSites: FrequentSite[];
};

type FreqSiteDialogData = {
  mode: 'add' | 'edit';
  id?: string;
  title: string;
  url: string;
};

type AddBookmarkDialogData = {
  title: string;
  url: string;
  folderId: string;
};

type PulledData = {
  bookmarks?: BookmarkNode[];
  calendar?: CalendarEvent[];
  todos?: Todo[];
  settings?: Settings;
  archivedTabs?: ArchivedTabGroup[];
  frequentSites?: FrequentSite[];
};

type FolderRow = {
  id: string;
  title: string;
  depth: number;
  count: number;
  path: string[];
  parentId?: string;
  hasSubfolders: boolean;
};

const initialState: DataState = {
  settings: defaultSettings,
  bookmarks: [],
  todos: [],
  calendar: [],
  tabs: [],
  frequentSites: []
};

const fontLoaderUrls: Partial<Record<Settings['fontFamily'], string>> = {
  inter: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  lxgw: 'https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@latest/style.css',
  'noto-sans': 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;700&display=swap',
  'noto-serif': 'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@300;400;500;700&display=swap',
  roboto: 'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap'
};

const loadFontIfNeeded = (family: Settings['fontFamily']) => {
  const href = fontLoaderUrls[family];
  if (!href || document.querySelector(`link[data-font="${family}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.dataset.font = family;
  link.href = href;
  document.head.appendChild(link);
};

const hexToRgba = (hex: string, alpha: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

const applyTheme = (settings: Settings) => {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved = settings.theme === 'system' ? (prefersDark ? 'dark' : 'light') : settings.theme;
  const fontMap: Record<Settings['fontFamily'], string> = {
    system: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    pingfang: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
    lxgw: '"LXGW WenKai", cursive',
    inter: '"Inter", "Segoe UI", sans-serif',
    'noto-sans': '"Noto Sans SC", sans-serif',
    'noto-serif': '"Noto Serif SC", serif',
    roboto: '"Roboto", "Segoe UI", sans-serif'
  };
  loadFontIfNeeded(settings.fontFamily);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.setProperty('--font-scale', String(settings.fontScale));
  document.documentElement.style.setProperty('--font-sans', fontMap[settings.fontFamily]);
  document.documentElement.style.setProperty('--font-weight', String(settings.fontWeight));
  localStorage.setItem('lele-tab-theme', settings.theme);
  const grad = 'radial-gradient(900px 280px at 50% -120px, color-mix(in oklab, var(--accent) 10%, transparent), transparent 70%)';
  if (settings.backgroundColor) {
    const color = hexToRgba(settings.backgroundColor, (settings.backgroundOpacity ?? 100) / 100);
    document.documentElement.style.setProperty('--ntp-shell-bg', `${grad}, ${color}`);
  } else {
    document.documentElement.style.removeProperty('--ntp-shell-bg');
  }
};

const sameLocalDate = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();

const parseDateSafe = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};
const unitSymbol = (settings: Settings) => (settings.weather.unit === 'F' ? '°F' : '°C');

const flattenBookmarks = (nodes: BookmarkNode[]): BookmarkNode[] =>
  nodes.flatMap((node) => (node.type === 'folder' ? flattenBookmarks(node.children ?? []) : [node]));

const engineUrl = (settings: Settings, query: string) => {
  const encoded = encodeURIComponent(query);
  if (settings.search.engine === 'bing') return `https://www.bing.com/search?q=${encoded}`;
  if (settings.search.engine === 'ddg') return `https://duckduckgo.com/?q=${encoded}`;
  if (settings.search.engine === 'custom' && settings.search.customUrl) return settings.search.customUrl.replace('{q}', encoded);
  return `https://www.google.com/search?q=${encoded}`;
};

const openUrl = async (url: string, active = true) => {
  if (isExtensionRuntime()) {
    await browserApi.runtime.sendMessage({ type: 'OPEN_URL', url, active });
    return;
  }
  window.open(url, '_blank', 'noopener');
};

const countLinks = (node: BookmarkNode): number => {
  if (node.type === 'link') return 1;
  return (node.children ?? []).reduce((total, child) => total + countLinks(child), 0);
};

const withOrder = (nodes: BookmarkNode[]) => nodes.map((node, index) => ({ ...node, order: index }));

const collectFolderRows = (nodes: BookmarkNode[], depth = 0, path: string[] = [], parentId?: string, collapsedIds = new Set<string>()): FolderRow[] => {
  const folders = nodes.filter((node) => node.type === 'folder');
  return folders.flatMap((folder) => {
    const currentPath = [...path, folder.title];
    const hasSubfolders = (folder.children ?? []).some((child) => child.type === 'folder');
    const row: FolderRow = {
      id: folder.id,
      title: folder.title,
      depth,
      count: countLinks(folder),
      path: currentPath,
      parentId,
      hasSubfolders
    };
    if (collapsedIds.has(folder.id)) return [row];
    return [row, ...collectFolderRows(folder.children ?? [], depth + 1, currentPath, folder.id, collapsedIds)];
  });
};

const findFolderById = (nodes: BookmarkNode[], folderId: string): BookmarkNode | undefined => {
  for (const node of nodes) {
    if (node.type !== 'folder') continue;
    if (node.id === folderId) return node;
    const nested = findFolderById(node.children ?? [], folderId);
    if (nested) return nested;
  }
  return undefined;
};

const linksByFolderId = (nodes: BookmarkNode[], folderId: string): BookmarkNode[] => {
  if (folderId === 'root') return flattenBookmarks(nodes);
  const folder = findFolderById(nodes, folderId);
  if (!folder) return flattenBookmarks(nodes);
  return flattenBookmarks(folder.children ?? []);
};

const addLinkToFolder = (nodes: BookmarkNode[], folderId: string, link: BookmarkNode): BookmarkNode[] => {
  if (folderId === 'root') return [...nodes, { ...link, order: nodes.length }];
  let found = false;
  const next = nodes.map((node) => {
    if (node.type !== 'folder') return node;
    if (node.id === folderId) {
      found = true;
      const children = node.children ?? [];
      return { ...node, updatedAt: Date.now(), children: [...children, { ...link, order: children.length }] };
    }
    if (!node.children?.length) return node;
    return { ...node, children: addLinkToFolder(node.children, folderId, link) };
  });
  return found ? next : [...nodes, { ...link, order: nodes.length }];
};

const addFolderToFolder = (nodes: BookmarkNode[], parentId: string, folder: BookmarkNode): BookmarkNode[] => {
  if (parentId === 'root') return withOrder([...nodes, { ...folder, order: nodes.length }]);
  return nodes.map((node) => {
    if (node.type !== 'folder') return node;
    if (node.id === parentId) {
      const children = node.children ?? [];
      return { ...node, updatedAt: Date.now(), children: withOrder([...children, { ...folder, order: children.length }]) };
    }
    return { ...node, children: addFolderToFolder(node.children ?? [], parentId, folder) };
  });
};

const updateFolderInTree = (
  nodes: BookmarkNode[],
  folderId: string,
  updater: (node: BookmarkNode) => BookmarkNode
): BookmarkNode[] =>
  nodes.map((node) => {
    if (node.type !== 'folder') return node;
    if (node.id === folderId) return updater(node);
    return { ...node, children: updateFolderInTree(node.children ?? [], folderId, updater) };
  });

const removeFolderInTree = (nodes: BookmarkNode[], folderId: string): BookmarkNode[] =>
  withOrder(
    nodes.flatMap((node) => {
      if (node.type !== 'folder') return [node];
      if (node.id === folderId) return [];
      return [{ ...node, children: removeFolderInTree(node.children ?? [], folderId) }];
    })
  );

const removeNodeFromTree = (
  nodes: BookmarkNode[],
  nodeId: string
): { nodes: BookmarkNode[]; removed?: BookmarkNode } => {
  let removed: BookmarkNode | undefined;
  const next = nodes.flatMap((node) => {
    if (node.id === nodeId) {
      removed = node;
      return [];
    }
    if (node.type !== 'folder') return [node];
    const childResult = removeNodeFromTree(node.children ?? [], nodeId);
    if (childResult.removed) removed = childResult.removed;
    return [{ ...node, children: childResult.nodes }];
  });
  return { nodes: withOrder(next), removed };
};

const containsFolder = (nodes: BookmarkNode[] | undefined, folderId: string): boolean =>
  (nodes ?? []).some((node) => node.type === 'folder' && (node.id === folderId || containsFolder(node.children, folderId)));

const insertFolderBefore = (nodes: BookmarkNode[], parentId: string | undefined, targetId: string, folder: BookmarkNode): BookmarkNode[] => {
  if (!parentId) {
    const targetIndex = nodes.findIndex((node) => node.id === targetId);
    const insertIndex = targetIndex >= 0 ? targetIndex : nodes.length;
    return withOrder([...nodes.slice(0, insertIndex), folder, ...nodes.slice(insertIndex)]);
  }
  return nodes.map((node) => {
    if (node.type !== 'folder') return node;
    if (node.id === parentId) {
      const children = node.children ?? [];
      const targetIndex = children.findIndex((child) => child.id === targetId);
      const insertIndex = targetIndex >= 0 ? targetIndex : children.length;
      return { ...node, updatedAt: Date.now(), children: withOrder([...children.slice(0, insertIndex), folder, ...children.slice(insertIndex)]) };
    }
    return { ...node, children: insertFolderBefore(node.children ?? [], parentId, targetId, folder) };
  });
};

const moveFolderBefore = (nodes: BookmarkNode[], sourceId: string, target: FolderRow): BookmarkNode[] => {
  if (sourceId === target.id) return nodes;
  const source = findFolderById(nodes, sourceId);
  if (!source || containsFolder(source.children, target.id) || target.parentId === sourceId) return nodes;
  const { nodes: withoutSource, removed } = removeNodeFromTree(nodes, sourceId);
  if (!removed || removed.type !== 'folder') return nodes;
  return insertFolderBefore(withoutSource, target.parentId, target.id, { ...removed, updatedAt: Date.now() });
};

const updateLinkInTree = (
  nodes: BookmarkNode[],
  linkId: string,
  updater: (node: BookmarkNode) => BookmarkNode
): BookmarkNode[] =>
  nodes.map((node) => {
    if (node.type === 'link') return node.id === linkId ? updater(node) : node;
    return { ...node, children: updateLinkInTree(node.children ?? [], linkId, updater) };
  });

const removeLinkInTree = (nodes: BookmarkNode[], linkId: string): BookmarkNode[] =>
  nodes
    .flatMap((node) => {
      if (node.type === 'link') return node.id === linkId ? [] : [node];
      return [{ ...node, children: removeLinkInTree(node.children ?? [], linkId) }];
    })
    .map((node, index) => ({ ...node, order: index }));

const fullUrlFromUrl = (url?: string) => {
  if (!url) return '';
  try {
    return new URL(url).href;
  } catch {
    return url;
  }
};

const relativeSyncText = (locale: Settings['locale'], timestamp?: number) => {
  if (!timestamp) return locale === 'zh-CN' ? '本地模式' : 'Local mode';
  const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return locale === 'zh-CN' ? '刚刚同步' : 'Synced just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return locale === 'zh-CN' ? `${minutes} 分钟前同步` : `Synced ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return locale === 'zh-CN' ? `${hours} 小时前同步` : `Synced ${hours}h ago`;
};

const calendarGrid = (anchor: Date, weekStart: Settings['calendarWeekStart']) => {
  const firstDay = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const offset = weekStart === 'sun' ? firstDay.getDay() : (firstDay.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => new Date(anchor.getFullYear(), anchor.getMonth(), index + 1 - offset));
};

const lunarDay = (date: Date) => {
  try {
    const parts = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'long', day: 'numeric', timeZone: 'Asia/Shanghai' }).formatToParts(date);
    const monthPart = parts.find((part) => part.type === 'month')?.value ?? '';
    const dayRaw = Number(parts.find((part) => part.type === 'day')?.value.replace(/[^\d]/g, ''));
    const dayMap = [
      '初一',
      '初二',
      '初三',
      '初四',
      '初五',
      '初六',
      '初七',
      '初八',
      '初九',
      '初十',
      '十一',
      '十二',
      '十三',
      '十四',
      '十五',
      '十六',
      '十七',
      '十八',
      '十九',
      '二十',
      '廿一',
      '廿二',
      '廿三',
      '廿四',
      '廿五',
      '廿六',
      '廿七',
      '廿八',
      '廿九',
      '三十'
    ];
    if (dayRaw === 1 && monthPart) return monthPart;
    if (dayRaw >= 1 && dayRaw <= 30) return dayMap[dayRaw - 1];
    return '';
  } catch {
    return '';
  }
};

export const App = () => {
  const [data, setData] = useState<DataState>(initialState);
  const [ready, setReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [weatherDetailOpen, setWeatherDetailOpen] = useState(false);
  const [driveMenuOpen, setDriveMenuOpen] = useState(false);
  const [driveConnected, setDriveConnected] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [conflictPayload, setConflictPayload] = useState<PulledData | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [selectedFolderId, setSelectedFolderId] = useState('root');
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [workspaceQuery, setWorkspaceQuery] = useState('');
  const [todoDraft, setTodoDraft] = useState('');
  const [showDoneHistory, setShowDoneHistory] = useState(false);
  const [calendarCursor, setCalendarCursor] = useState(() => {
    const date = new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const [lastSyncedAt, setLastSyncedAt] = useState<number>();
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(new Set());
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<Set<string>>(new Set());
  const [lastCheckedIdx, setLastCheckedIdx] = useState<number | null>(null);
  const [baziOpen, setBaziOpen] = useState(false);
  const [bookmarksExpanded, setBookmarksExpanded] = useState(true);
  const [freqSitesExpanded, setFreqSitesExpanded] = useState(false);
  const [selectedFreqIds, setSelectedFreqIds] = useState<Set<string>>(new Set());
  const [freqLastCheckedIdx, setFreqLastCheckedIdx] = useState<number | null>(null);
  const [freqDraggedId, setFreqDraggedId] = useState<string | null>(null);
  const [freqDragOverId, setFreqDragOverId] = useState<string | null>(null);
  const [addBookmarkModal, setAddBookmarkModal] = useState<AddBookmarkDialogData | null>(null);
  const [freqSiteDialog, setFreqSiteDialog] = useState<FreqSiteDialogData | null>(null);
  const [bkUrlColW, setBkUrlColW] = useState(160);
  const [freqUrlColW, setFreqUrlColW] = useState(160);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const freqSelectAllRef = useRef<HTMLInputElement>(null);
  const settingsRef = useRef<Settings>(defaultSettings);

  const locale = data.settings.locale;

  useEffect(() => {
    settingsRef.current = data.settings;
  }, [data.settings]);

  const refreshTabs = useCallback(async (scope: 'current' | 'all' = 'current') => {
    const response = await browserApi.runtime.sendMessage<RuntimeTab[]>({ type: 'GET_TABS', scope });
    if (response.ok && response.data) setData((current) => ({ ...current, tabs: response.data ?? [] }));
  }, []);

  const loadWeather = useCallback(
    async (settings: Settings, ignoreCache = false) => {
      const cache = await readStorage('weatherCache');
      if (!ignoreCache && cache && Date.now() - cache.updatedAt < 30 * 60 * 1000) {
        setData((current) => ({ ...current, weather: cache }));
        return;
      }
      try {
        const next = await loadOpenMeteoWeather(settings.weather);
        await writeStorage('weatherCache', next);
        setData((current) => ({ ...current, weather: next }));
      } catch {
        if (cache) setData((current) => ({ ...current, weather: { ...cache, offline: true } }));
      }
    },
    []
  );

  useEffect(() => {
    void (async () => {
      const [settings, bookmarks, todos, calendar, weather, driveToken, frequentSites] = await Promise.all([
        readStorage('settings'),
        readStorage('bookmarks'),
        readStorage('todos'),
        readStorage('calendar'),
        readStorage('weatherCache'),
        getDriveToken(),
        readStorage('frequentSites')
      ]);
      settingsRef.current = settings;
      applyTheme(settings);
      setDriveConnected(!!driveToken);
      setData({ settings, bookmarks, todos, calendar, weather, tabs: [], frequentSites });
      setReady(true);
      await refreshTabs('current');
      await loadWeather(settings);
    })();
  }, [loadWeather, refreshTabs]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => void refreshTabs('current'), 15_000);
    return () => clearInterval(timer);
  }, [refreshTabs]);

  const persistSettings = async (updater: (settings: Settings) => Settings) => {
    const currentSettings = settingsRef.current;
    const next = updater(currentSettings);
    const weatherChanged = JSON.stringify(next.weather) !== JSON.stringify(currentSettings.weather);
    settingsRef.current = next;
    applyTheme(next);
    setData((current) => ({ ...current, settings: next }));
    await writeStorage('settings', next);
    if (weatherChanged) await loadWeather(next, true);
  };

  const persistBookmarks = async (bookmarks: BookmarkNode[]) => {
    await writeStorage('bookmarks', bookmarks);
    setData((current) => ({ ...current, bookmarks }));
  };

  const persistFrequentSites = async (frequentSites: FrequentSite[]) => {
    await writeStorage('frequentSites', frequentSites);
    setData((current) => ({ ...current, frequentSites }));
  };

  const persistTodos = async (todos: Todo[]) => {
    await writeStorage('todos', todos);
    setData((current) => ({ ...current, todos }));
  };

  const persistCalendar = async (calendar: CalendarEvent[]) => {
    await writeStorage('calendar', calendar);
    setData((current) => ({ ...current, calendar }));
  };

  const handleSyncNow = useCallback(async () => {
    setSyncMessage(locale === 'zh-CN' ? '正在上传...' : 'Uploading...');
    try {
      const token = (await getDriveToken()) ?? (await authorizeDrive());
      await uploadAllDataToDrive(token);
      setLastSyncedAt(Date.now());
      setSyncMessage(locale === 'zh-CN' ? '上传完成。' : 'Upload complete.');
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : locale === 'zh-CN' ? '上传失败。' : 'Upload failed.');
    }
  }, [locale]);

  const handleImportBookmarks = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const imported = parseBookmarkHtml(text);
    const merged = mergeBookmarksByUrl(data.bookmarks, imported);
    await persistBookmarks(merged);
    event.target.value = '';
  };

  const handleExportBookmarks = () => {
    const html = serializeBookmarkHtml(data.bookmarks);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bookmarks.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  const folderRows = useMemo(() => collectFolderRows(data.bookmarks, 0, [], undefined, collapsedFolderIds), [data.bookmarks, collapsedFolderIds]);
  const allFolderRows = useMemo(() => collectFolderRows(data.bookmarks, 0, [], undefined, new Set()), [data.bookmarks]);
  const selectedFolder = folderRows.find((folder) => folder.id === selectedFolderId);
  const sortedFreqSites = useMemo(() => [...data.frequentSites].sort((a, b) => a.order - b.order), [data.frequentSites]);
  const allFreqSelected = sortedFreqSites.length > 0 && sortedFreqSites.every((s) => selectedFreqIds.has(s.id));
  const someFreqSelected = sortedFreqSites.some((s) => selectedFreqIds.has(s.id));

  useEffect(() => {
    if (selectedFolderId === 'root') return;
    const exists = folderRows.some((folder) => folder.id === selectedFolderId);
    if (!exists) setSelectedFolderId('root');
  }, [folderRows, selectedFolderId]);

  useEffect(() => {
    setSelectedBookmarkIds(new Set());
    setLastCheckedIdx(null);
  }, [selectedFolderId, workspaceQuery]);

  const allLinksInScope = useMemo(() => linksByFolderId(data.bookmarks, selectedFolderId), [data.bookmarks, selectedFolderId]);
  const scopedLinks = useMemo(
    () =>
      allLinksInScope.filter((link) => {
        const query = workspaceQuery.trim().toLowerCase();
        if (!query) return true;
        return `${link.title} ${link.url}`.toLowerCase().includes(query);
      }),
    [allLinksInScope, workspaceQuery]
  );

  const allSelected = scopedLinks.length > 0 && scopedLinks.every((link) => selectedBookmarkIds.has(link.id));
  const someSelected = scopedLinks.some((link) => selectedBookmarkIds.has(link.id));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  useEffect(() => {
    if (freqSelectAllRef.current) {
      freqSelectAllRef.current.indeterminate = someFreqSelected && !allFreqSelected;
    }
  }, [someFreqSelected, allFreqSelected]);

  const todoItems = useMemo(() => [...data.todos].sort((a, b) => a.order - b.order), [data.todos]);
  const pendingTodos = useMemo(() => todoItems.filter((todo) => !todo.done), [todoItems]);
  const doneTodos = useMemo(() => todoItems.filter((todo) => todo.done), [todoItems]);
  const todayEvents = useMemo(
    () =>
      data.calendar.filter((event) => {
        const start = parseDateSafe(event.start);
        return start ? sameLocalDate(start, now) : false;
      }),
    [data.calendar, now]
  );
  const visibleModules = useMemo(
    () =>
      Object.fromEntries(
        data.settings.layout.map((item) => [item.moduleId, item.visible])
      ) as Record<string, boolean>,
    [data.settings.layout]
  );
  const hasWorkbench = visibleModules.bookmarks !== false || visibleModules.quickLinks !== false;
  const hasRightRail = visibleModules.calendar !== false || visibleModules.todos !== false || visibleModules.tabs !== false;
  const weekLabels =
    data.settings.calendarWeekStart === 'sun'
      ? locale === 'zh-CN'
        ? ['日', '一', '二', '三', '四', '五', '六']
        : ['S', 'M', 'T', 'W', 'T', 'F', 'S']
      : locale === 'zh-CN'
        ? ['一', '二', '三', '四', '五', '六', '日']
        : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const monthCells = useMemo(() => calendarGrid(calendarCursor, data.settings.calendarWeekStart), [calendarCursor, data.settings.calendarWeekStart]);
  const yearOptions = useMemo(() => {
    const center = calendarCursor.getFullYear();
    return Array.from({ length: 21 }, (_, index) => center - 10 + index);
  }, [calendarCursor]);

  const handleSearchSubmit = async () => {
    const query = workspaceQuery.trim();
    if (!query) return;
    if (query.startsWith('#')) {
      const key = query.slice(1).trim().toLowerCase();
      const tab = data.tabs.find((item) => `${item.title} ${item.url}`.toLowerCase().includes(key));
      if (tab?.id !== undefined) {
        await browserApi.runtime.sendMessage({ type: 'FOCUS_TAB', tabId: tab.id, windowId: tab.windowId });
        return;
      }
    }
    if (query.startsWith('!')) {
      const key = query.slice(1).trim().toLowerCase();
      const link = flattenBookmarks(data.bookmarks).find((item) => `${item.title} ${item.url}`.toLowerCase().includes(key));
      if (link?.url) {
        await openUrl(link.url);
        return;
      }
    }
    await openUrl(engineUrl(data.settings, query));
  };

  const addTodo = async () => {
    const text = todoDraft.trim();
    if (!text) return;
    const timestamp = Date.now();
    const next: Todo[] = [
      ...todoItems,
      {
        id: createId('todo'),
        text,
        done: false,
        group: locale === 'zh-CN' ? '今日' : 'Today',
        order: todoItems.length,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ];
    await persistTodos(next);
    setTodoDraft('');
  };

  const shiftCalendarMonth = (offset: number) => {
    setCalendarCursor((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  const completeTodo = async (todoId: string) => {
    const next = todoItems.map((todo) => (todo.id === todoId ? { ...todo, done: true, updatedAt: Date.now() } : todo));
    await persistTodos(next);
  };

  const restoreTodo = async (todoId: string) => {
    const next = todoItems.map((todo) => (todo.id === todoId ? { ...todo, done: false, updatedAt: Date.now() } : todo));
    await persistTodos(next);
  };

  const deleteTodo = async (todoId: string) => {
    const next = todoItems.filter((todo) => todo.id !== todoId).map((todo, index) => ({ ...todo, order: index }));
    await persistTodos(next);
  };

  const addBookmarkQuick = async () => {
    const title = window.prompt(locale === 'zh-CN' ? '书签标题' : 'Bookmark title');
    if (!title) return;
    const url = window.prompt('URL', 'https://');
    if (!url) return;
    const timestamp = Date.now();
    const link: BookmarkNode = {
      id: createId('bookmark'),
      type: 'link',
      title: title.trim() || url,
      url: url.trim(),
      order: 0,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const next = addLinkToFolder(data.bookmarks, selectedFolderId, link);
    await persistBookmarks(next);
  };

  const addFolderQuick = async () => {
    const title = window.prompt(locale === 'zh-CN' ? '文件夹名称' : 'Folder name');
    if (!title?.trim()) return;
    const timestamp = Date.now();
    const folder: BookmarkNode = {
      id: createId('folder'),
      type: 'folder',
      title: title.trim(),
      order: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      children: []
    };
    const parentId = selectedFolderId === 'root' ? 'root' : selectedFolderId;
    const next = addFolderToFolder(data.bookmarks, parentId, folder);
    await persistBookmarks(next);
    setSelectedFolderId(folder.id);
  };

  const renameFolder = async (folder: FolderRow) => {
    const title = window.prompt(locale === 'zh-CN' ? '修改文件夹名' : 'Rename folder', folder.title);
    if (!title?.trim()) return;
    const next = updateFolderInTree(data.bookmarks, folder.id, (node) => ({ ...node, title: title.trim(), updatedAt: Date.now() }));
    await persistBookmarks(next);
  };

  const deleteFolder = async (folder: FolderRow) => {
    const confirmed = window.confirm(locale === 'zh-CN' ? `确认删除“${folder.title}”及其中所有书签？` : `Delete "${folder.title}" and all bookmarks inside?`);
    if (!confirmed) return;
    const next = removeFolderInTree(data.bookmarks, folder.id);
    await persistBookmarks(next);
    if (selectedFolderId === folder.id || selectedFolder?.path.includes(folder.title)) setSelectedFolderId('root');
  };

  const handleFolderDragStart = (event: DragEvent<HTMLDivElement>, folderId: string) => {
    setDraggedFolderId(folderId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', folderId);
  };

  const handleFolderDrop = async (event: DragEvent<HTMLDivElement>, target: FolderRow) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData('text/plain') || draggedFolderId;
    setDraggedFolderId(null);
    setDragOverFolderId(null);
    if (!sourceId || sourceId === target.id) return;
    const next = moveFolderBefore(data.bookmarks, sourceId, target);
    if (next === data.bookmarks) return;
    await persistBookmarks(next);
  };

  const editBookmark = async (link: BookmarkNode) => {
    const title = window.prompt(locale === 'zh-CN' ? '编辑标题' : 'Edit title', link.title);
    if (!title) return;
    const url = window.prompt('URL', link.url ?? '');
    if (!url) return;
    const next = updateLinkInTree(data.bookmarks, link.id, (node) => ({
      ...node,
      title: title.trim(),
      url: url.trim(),
      updatedAt: Date.now()
    }));
    await persistBookmarks(next);
  };

  const deleteBookmark = async (linkId: string) => {
    const confirmed = window.confirm(locale === 'zh-CN' ? '确认删除此书签？' : 'Delete this bookmark?');
    if (!confirmed) return;
    const next = removeLinkInTree(data.bookmarks, linkId);
    await persistBookmarks(next);
  };

  const toggleFolderCollapse = (folderId: string) => {
    setCollapsedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const handleBookmarkCheck = (linkId: string, idx: number, shiftKey: boolean) => {
    setSelectedBookmarkIds((current) => {
      const next = new Set(current);
      if (shiftKey && lastCheckedIdx !== null) {
        const lo = Math.min(lastCheckedIdx, idx);
        const hi = Math.max(lastCheckedIdx, idx);
        const willCheck = !current.has(linkId);
        for (let i = lo; i <= hi; i++) {
          if (scopedLinks[i]) {
            if (willCheck) next.add(scopedLinks[i].id);
            else next.delete(scopedLinks[i].id);
          }
        }
      } else {
        if (next.has(linkId)) next.delete(linkId);
        else next.add(linkId);
      }
      return next;
    });
    setLastCheckedIdx(idx);
  };

  const deleteSelectedBookmarks = async () => {
    if (selectedBookmarkIds.size === 0) return;
    const confirmed = window.confirm(
      locale === 'zh-CN'
        ? `确认删除已选的 ${selectedBookmarkIds.size} 个书签？`
        : `Delete ${selectedBookmarkIds.size} selected bookmarks?`
    );
    if (!confirmed) return;
    let next = data.bookmarks;
    for (const id of selectedBookmarkIds) {
      next = removeLinkInTree(next, id);
    }
    setSelectedBookmarkIds(new Set());
    setLastCheckedIdx(null);
    await persistBookmarks(next);
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedBookmarkIds(new Set());
    } else {
      setSelectedBookmarkIds(new Set(scopedLinks.map((link) => link.id)));
    }
    setLastCheckedIdx(null);
  };

  const toggleBookmarksCard = () => {
    if (!bookmarksExpanded) {
      setBookmarksExpanded(true);
      setFreqSitesExpanded(false);
    } else {
      setBookmarksExpanded(false);
    }
  };

  const toggleFreqSitesCard = () => {
    if (!freqSitesExpanded) {
      setFreqSitesExpanded(true);
      setBookmarksExpanded(false);
    } else {
      setFreqSitesExpanded(false);
    }
  };

  const addTabToFreqSites = async (tab: RuntimeTab) => {
    if (!tab.url) return;
    const timestamp = Date.now();
    const site: FrequentSite = {
      id: createId('freq'),
      title: tab.title ?? tab.url,
      url: tab.url,
      order: data.frequentSites.length,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    await persistFrequentSites([...data.frequentSites, site]);
  };

  const deleteFreqSite = async (siteId: string) => {
    const confirmed = window.confirm(locale === 'zh-CN' ? '确认删除此常用站点？' : 'Delete this site?');
    if (!confirmed) return;
    const next = data.frequentSites.filter((s) => s.id !== siteId).map((s, i) => ({ ...s, order: i }));
    await persistFrequentSites(next);
  };

  const deleteSelectedFreqSites = async () => {
    if (selectedFreqIds.size === 0) return;
    const confirmed = window.confirm(
      locale === 'zh-CN'
        ? `确认删除已选的 ${selectedFreqIds.size} 个常用站点？`
        : `Delete ${selectedFreqIds.size} selected sites?`
    );
    if (!confirmed) return;
    const next = data.frequentSites.filter((s) => !selectedFreqIds.has(s.id)).map((s, i) => ({ ...s, order: i }));
    setSelectedFreqIds(new Set());
    setFreqLastCheckedIdx(null);
    await persistFrequentSites(next);
  };

  const handleFreqCheck = (siteId: string, idx: number, shiftKey: boolean) => {
    setSelectedFreqIds((current) => {
      const next = new Set(current);
      if (shiftKey && freqLastCheckedIdx !== null) {
        const lo = Math.min(freqLastCheckedIdx, idx);
        const hi = Math.max(freqLastCheckedIdx, idx);
        const willCheck = !current.has(siteId);
        for (let i = lo; i <= hi; i++) {
          if (sortedFreqSites[i]) {
            if (willCheck) next.add(sortedFreqSites[i].id);
            else next.delete(sortedFreqSites[i].id);
          }
        }
      } else {
        if (next.has(siteId)) next.delete(siteId);
        else next.add(siteId);
      }
      return next;
    });
    setFreqLastCheckedIdx(idx);
  };

  const handleFreqDrop = async (event: DragEvent<HTMLLIElement>, targetId: string) => {
    event.preventDefault();
    const srcId = event.dataTransfer.getData('text/plain') || freqDraggedId;
    setFreqDraggedId(null);
    setFreqDragOverId(null);
    if (!srcId || srcId === targetId) return;
    const sites = [...data.frequentSites].sort((a, b) => a.order - b.order);
    const srcIdx = sites.findIndex((s) => s.id === srcId);
    const targetIdx = sites.findIndex((s) => s.id === targetId);
    if (srcIdx < 0 || targetIdx < 0) return;
    const [moved] = sites.splice(srcIdx, 1);
    sites.splice(targetIdx, 0, moved);
    await persistFrequentSites(sites.map((s, i) => ({ ...s, order: i })));
  };

  const toggleFreqSelectAll = () => {
    if (sortedFreqSites.length > 0 && sortedFreqSites.every((s) => selectedFreqIds.has(s.id))) {
      setSelectedFreqIds(new Set());
    } else {
      setSelectedFreqIds(new Set(sortedFreqSites.map((s) => s.id)));
    }
    setFreqLastCheckedIdx(null);
  };

  if (!ready) {
    return (
      <main className="ntp-shell loading">
        <Loader2 aria-hidden className="spin" />
      </main>
    );
  }

  return (
    <main className="ntp-shell" style={data.settings.backgroundImage ? { backgroundImage: `url(${data.settings.backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
      <div className="ntp-grain" aria-hidden />

      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden>
              <circle cx="22" cy="15" r="5" fill="#f9bfbf"/>
              <circle cx="18.5" cy="21.5" r="5" fill="#f9bfbf"/>
              <circle cx="11.5" cy="21.5" r="5" fill="#f9bfbf"/>
              <circle cx="8" cy="15" r="5" fill="#f9bfbf"/>
              <circle cx="11.5" cy="8.5" r="5" fill="#f9bfbf"/>
              <circle cx="18.5" cy="8.5" r="5" fill="#f9bfbf"/>
              <circle cx="15" cy="15" r="8.5" fill="white" stroke="#2a2a2a" strokeWidth="1.3"/>
              <ellipse cx="10" cy="10.5" rx="2.8" ry="2" transform="rotate(-35 10 10.5)" fill="white" stroke="#2a2a2a" strokeWidth="1.1"/>
              <ellipse cx="20" cy="10.5" rx="2.8" ry="2" transform="rotate(35 20 10.5)" fill="white" stroke="#2a2a2a" strokeWidth="1.1"/>
              <circle cx="12.5" cy="14" r="1.3" fill="#1a1a1a"/>
              <circle cx="17.5" cy="14" r="1.3" fill="#1a1a1a"/>
              <circle cx="13" cy="13.5" r="0.45" fill="white"/>
              <circle cx="18" cy="13.5" r="0.45" fill="white"/>
              <ellipse cx="15" cy="17" rx="1.8" ry="1.1" fill="#c06060"/>
              <ellipse cx="15" cy="19.8" rx="1.4" ry="1.2" fill="#e07878"/>
            </svg>
          </div>
          <strong>LeLe Tab</strong>
        </div>

        {visibleModules.search !== false && (
          <form
            className="top-search"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSearchSubmit();
            }}
          >
            <Search size={19} aria-hidden />
            <input
              ref={searchRef}
              value={workspaceQuery}
              onChange={(event) => setWorkspaceQuery(event.target.value)}
              placeholder={t(locale, 'searchPlaceholder')}
              aria-label={t(locale, 'searchPlaceholder')}
            />
          </form>
        )}
        {visibleModules.search === false && <div className="top-search-placeholder" />}

        <div className="top-right">
          <span
            className="clock"
            role={data.settings.baziEnabled ? 'button' : undefined}
            tabIndex={data.settings.baziEnabled ? 0 : undefined}
            onClick={() => data.settings.baziEnabled && setBaziOpen((v) => !v)}
            onKeyDown={(e) => data.settings.baziEnabled && e.key === 'Enter' && setBaziOpen((v) => !v)}
            style={data.settings.baziEnabled ? { cursor: 'pointer' } : undefined}
            title={data.settings.baziEnabled ? (locale === 'zh-CN' ? '点击查看八字' : 'Click for BaZi') : undefined}
          >
            {new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(now)}
          </span>
          {visibleModules.weather !== false && (
            <button className="weather-pill" type="button" aria-label={t(locale, 'weather')} onClick={() => setWeatherDetailOpen((v) => !v)}>
              <CloudSun size={14} aria-hidden />
              <span className="weather-text">
                {data.weather ? `${Math.round(data.weather.current.temperature)}${unitSymbol(data.settings)} · ${data.weather.location}` : t(locale, 'weather')}
              </span>
            </button>
          )}
          <button
            className="icon-button sync-now-btn"
            type="button"
            aria-label={t(locale, 'syncNow')}
            title={t(locale, 'syncNow')}
            disabled={!driveConnected}
            onClick={() => void handleSyncNow()}
          >
            <RefreshCw size={15} aria-hidden />
          </button>
          <button className="icon-button" type="button" aria-label={t(locale, 'settings')} onClick={() => setSettingsOpen(true)}>
            <SettingsIcon size={18} aria-hidden />
          </button>
          <button
            className={`avatar-pill${driveConnected ? ' avatar-connected' : ''}`}
            type="button"
            aria-label={locale === 'zh-CN' ? 'Google Drive 账号' : 'Google Drive account'}
            onClick={() => setDriveMenuOpen((v) => !v)}
          >
            <UserRound size={15} aria-hidden />
          </button>
        </div>
      </header>

      <section className="workspace" style={(!hasWorkbench || !hasRightRail) ? { gridTemplateColumns: 'minmax(0,1fr)' } : undefined}>
        {hasWorkbench && <section className="workbench">
          {/* ── 书签卡片 ── */}
          {visibleModules.bookmarks !== false && <div className={`wk-card${bookmarksExpanded ? ' expanded' : ''}`}>
            <header className="workbench-header" onClick={toggleBookmarksCard}>
              <div className="wk-card-title-row">
                <ChevronRight size={16} aria-hidden className={`wk-chevron${bookmarksExpanded ? ' open' : ''}`} />
                <div>
                  <h1>
                    {t(locale, 'bookmarks')} <span>›</span> {selectedFolder?.title ?? (locale === 'zh-CN' ? '全部书签' : 'All bookmarks')}
                  </h1>
                </div>
              </div>
              <div className="workbench-actions" onClick={(e) => e.stopPropagation()}>
                {selectedBookmarkIds.size > 0 && (
                  <button className="button danger" type="button" onClick={() => void deleteSelectedBookmarks()}>
                    <Trash2 size={14} aria-hidden />
                    {locale === 'zh-CN' ? `删除 (${selectedBookmarkIds.size})` : `Delete (${selectedBookmarkIds.size})`}
                  </button>
                )}
                <label className="button file-button" title={locale === 'zh-CN' ? '导入书签 HTML' : 'Import bookmarks HTML'}>
                  <Upload size={14} aria-hidden />
                  {locale === 'zh-CN' ? '导入' : 'Import'}
                  <input type="file" accept=".html" onChange={(e) => void handleImportBookmarks(e)} />
                </label>
                <button className="button" type="button" onClick={handleExportBookmarks} title={locale === 'zh-CN' ? '导出书签 HTML' : 'Export bookmarks HTML'}>
                  <Download size={14} aria-hidden />
                  {locale === 'zh-CN' ? '导出' : 'Export'}
                </button>
                <button className="button" type="button" onClick={addFolderQuick}>
                  <Folder size={15} aria-hidden />
                  {locale === 'zh-CN' ? '文件夹' : 'Folder'}
                </button>
                <button className="button primary" type="button" onClick={addBookmarkQuick}>
                  <Plus size={15} aria-hidden />
                  {locale === 'zh-CN' ? '添加' : 'New'}
                </button>
              </div>
            </header>

            {bookmarksExpanded && (
              <div className="wk-card-body">
                <div className="workbench-body">
                  <aside className="folder-tree" aria-label="Bookmark folders">
                    <div className="folder-row">
                      <button type="button" className={`folder-main ${selectedFolderId === 'root' ? 'active' : ''}`} onClick={() => setSelectedFolderId('root')}>
                        <ChevronRight size={14} aria-hidden />
                        <Folder size={14} aria-hidden />
                        <span>{locale === 'zh-CN' ? '全部' : 'All'}</span>
                        <small>{flattenBookmarks(data.bookmarks).length}</small>
                      </button>
                    </div>
                    {folderRows.map((folder) => (
                      <div
                        key={folder.id}
                        className={`folder-row ${dragOverFolderId === folder.id ? 'drag-over' : ''}`}
                        draggable
                        onDragStart={(event) => handleFolderDragStart(event, folder.id)}
                        onDragEnd={() => {
                          setDraggedFolderId(null);
                          setDragOverFolderId(null);
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = 'move';
                          setDragOverFolderId(folder.id);
                        }}
                        onDragLeave={() => setDragOverFolderId((current) => (current === folder.id ? null : current))}
                        onDrop={(event) => void handleFolderDrop(event, folder)}
                      >
                        <button
                          type="button"
                          className={`folder-main ${selectedFolderId === folder.id ? 'active' : ''}`}
                          style={{ paddingLeft: `${12 + folder.depth * 18}px` }}
                          onClick={() => setSelectedFolderId(folder.id)}
                        >
                          <span
                            className={`folder-chevron${folder.hasSubfolders ? (collapsedFolderIds.has(folder.id) ? '' : ' open') : ' hidden'}`}
                            onClick={folder.hasSubfolders ? (e) => { e.stopPropagation(); toggleFolderCollapse(folder.id); } : undefined}
                            aria-hidden
                          >
                            <ChevronRight size={14} />
                          </span>
                          <Folder size={14} aria-hidden />
                          <span>{folder.title}</span>
                          <small>{folder.count}</small>
                        </button>
                        <div className="folder-actions">
                          <button className="icon-button compact" type="button" aria-label={locale === 'zh-CN' ? '修改文件夹名' : 'Rename folder'} onClick={() => void renameFolder(folder)}>
                            <PencilLine size={12} aria-hidden />
                          </button>
                          <button className="icon-button compact" type="button" aria-label={locale === 'zh-CN' ? '删除文件夹' : 'Delete folder'} onClick={() => void deleteFolder(folder)}>
                            <Trash2 size={12} aria-hidden />
                          </button>
                        </div>
                      </div>
                    ))}
                  </aside>

                  <section className="bookmark-table-wrap" style={{ '--bk-url-col': `${bkUrlColW}px` } as React.CSSProperties}>
                    <header className="bookmark-table-head">
                      <span className="bk-check-cell">
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          className="bk-checkbox"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          aria-label={locale === 'zh-CN' ? '全选' : 'Select all'}
                        />
                      </span>
                      <span style={{ position: 'relative' }}>
                        {locale === 'zh-CN' ? '标题' : 'Title'}
                        <span
                          className="col-resizer"
                          aria-hidden
                          onMouseDown={(e) => {
                            e.preventDefault();
                            const startX = e.clientX;
                            const startW = bkUrlColW;
                            const onMove = (me: MouseEvent) => setBkUrlColW(Math.max(80, Math.min(500, startW - (me.clientX - startX))));
                            const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
                            document.addEventListener('mousemove', onMove);
                            document.addEventListener('mouseup', onUp);
                          }}
                        />
                      </span>
                      <span>{locale === 'zh-CN' ? '地址' : 'URL'}</span>
                      <span>{locale === 'zh-CN' ? '操作' : 'Actions'}</span>
                    </header>
                    <ul className="bookmark-table">
                      {scopedLinks.map((link, idx) => (
                        <li key={link.id}>
                          <span className="bk-check-cell">
                            <input
                              type="checkbox"
                              className="bk-checkbox"
                              checked={selectedBookmarkIds.has(link.id)}
                              onChange={() => {}}
                              onClick={(e) => { e.stopPropagation(); handleBookmarkCheck(link.id, idx, e.shiftKey); }}
                              aria-label={locale === 'zh-CN' ? '选择书签' : 'Select bookmark'}
                            />
                          </span>
                          <button type="button" className="bookmark-main" onClick={() => link.url && openUrl(link.url)}>
                            <strong>{link.title}</strong>
                            <small>{fullUrlFromUrl(link.url)}</small>
                          </button>
                          <div className="row-actions">
                            <button className="icon-button compact" type="button" aria-label={locale === 'zh-CN' ? '编辑书签' : 'Edit bookmark'} onClick={() => void editBookmark(link)}>
                              <PencilLine size={13} aria-hidden />
                            </button>
                            <button className="icon-button compact" type="button" aria-label={locale === 'zh-CN' ? '删除书签' : 'Delete bookmark'} onClick={() => void deleteBookmark(link.id)}>
                              <Trash2 size={13} aria-hidden />
                            </button>
                          </div>
                        </li>
                      ))}
                      {!scopedLinks.length && <li className="empty-row">{t(locale, 'noItems')}</li>}
                    </ul>
                  </section>
                </div>
              </div>
            )}
          </div>}

          {/* ── 常用站点卡片 ── */}
          {visibleModules.quickLinks !== false && <div className={`wk-card${freqSitesExpanded ? ' expanded' : ''}`}>
            <header className="workbench-header" onClick={toggleFreqSitesCard}>
              <div className="wk-card-title-row">
                <ChevronRight size={16} aria-hidden className={`wk-chevron${freqSitesExpanded ? ' open' : ''}`} />
                <h1>{locale === 'zh-CN' ? '常用站点' : 'Frequent Sites'}</h1>
              </div>
              <div className="workbench-actions" onClick={(e) => e.stopPropagation()}>
                {selectedFreqIds.size > 0 && (
                  <button className="button danger" type="button" onClick={() => void deleteSelectedFreqSites()}>
                    <Trash2 size={14} aria-hidden />
                    {locale === 'zh-CN' ? `删除 (${selectedFreqIds.size})` : `Delete (${selectedFreqIds.size})`}
                  </button>
                )}
                <button
                  className="button primary"
                  type="button"
                  onClick={() => setFreqSiteDialog({ mode: 'add', title: '', url: '' })}
                >
                  <Plus size={15} aria-hidden />
                  {locale === 'zh-CN' ? '添加' : 'New'}
                </button>
              </div>
            </header>

            {freqSitesExpanded && (
              <div className="wk-card-body">
                <div className="freq-table-wrap" style={{ '--freq-url-col': `${freqUrlColW}px` } as React.CSSProperties}>
                  <header className="freq-table-head">
                    <span className="bk-check-cell">
                      <input
                        ref={freqSelectAllRef}
                        type="checkbox"
                        className="bk-checkbox"
                        checked={allFreqSelected}
                        onChange={toggleFreqSelectAll}
                        aria-label={locale === 'zh-CN' ? '全选' : 'Select all'}
                      />
                    </span>
                    <span style={{ position: 'relative' }}>
                      {locale === 'zh-CN' ? '标题' : 'Title'}
                      <span
                        className="col-resizer"
                        aria-hidden
                        onMouseDown={(e) => {
                          e.preventDefault();
                          const startX = e.clientX;
                          const startW = freqUrlColW;
                          const onMove = (me: MouseEvent) => setFreqUrlColW(Math.max(80, Math.min(500, startW - (me.clientX - startX))));
                          const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
                          document.addEventListener('mousemove', onMove);
                          document.addEventListener('mouseup', onUp);
                        }}
                      />
                    </span>
                    <span>{locale === 'zh-CN' ? '地址' : 'URL'}</span>
                    <span>{locale === 'zh-CN' ? '操作' : 'Actions'}</span>
                  </header>
                  <ul className="freq-table">
                    {sortedFreqSites.map((site, idx) => (
                      <li
                        key={site.id}
                        draggable
                        className={freqDragOverId === site.id ? 'freq-drag-over' : ''}
                        onDragStart={(e) => {
                          setFreqDraggedId(site.id);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', site.id);
                        }}
                        onDragEnd={() => { setFreqDraggedId(null); setFreqDragOverId(null); }}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setFreqDragOverId(site.id); }}
                        onDragLeave={() => setFreqDragOverId((current) => (current === site.id ? null : current))}
                        onDrop={(e) => void handleFreqDrop(e, site.id)}
                      >
                        <span className="bk-check-cell">
                          <input
                            type="checkbox"
                            className="bk-checkbox"
                            checked={selectedFreqIds.has(site.id)}
                            onChange={() => {}}
                            onClick={(e) => { e.stopPropagation(); handleFreqCheck(site.id, idx, e.shiftKey); }}
                            aria-label={locale === 'zh-CN' ? '选择站点' : 'Select site'}
                          />
                        </span>
                        <button type="button" className="bookmark-main" onClick={() => openUrl(site.url)}>
                          <strong>{site.title}</strong>
                          <small>{fullUrlFromUrl(site.url)}</small>
                        </button>
                        <div className="row-actions freq-row-actions">
                          <span className="drag-handle" aria-hidden>
                            <GripVertical size={13} />
                          </span>
                          <button
                            className="icon-button compact"
                            type="button"
                            aria-label={locale === 'zh-CN' ? '编辑' : 'Edit'}
                            onClick={() => setFreqSiteDialog({ mode: 'edit', id: site.id, title: site.title, url: site.url })}
                          >
                            <PencilLine size={13} aria-hidden />
                          </button>
                          <button
                            className="icon-button compact"
                            type="button"
                            aria-label={locale === 'zh-CN' ? '删除' : 'Delete'}
                            onClick={() => void deleteFreqSite(site.id)}
                          >
                            <Trash2 size={13} aria-hidden />
                          </button>
                        </div>
                      </li>
                    ))}
                    {!sortedFreqSites.length && <li className="empty-row">{t(locale, 'noItems')}</li>}
                  </ul>
                </div>
              </div>
            )}
          </div>}
        </section>}

        {hasRightRail && <aside className="right-rail">
          {visibleModules.calendar !== false && (
            <section className="side-card">
              <header className="calendar-header">
                <h2>{locale === 'zh-CN' ? '今天' : 'Today'}</h2>
                <div className="calendar-controls">
                  <button className="icon-button compact" type="button" aria-label={locale === 'zh-CN' ? '上个月' : 'Previous month'} onClick={() => shiftCalendarMonth(-1)}>
                    <ChevronLeft size={13} aria-hidden />
                  </button>
                  <select className="select compact-year" value={calendarCursor.getFullYear()} onChange={(event) => setCalendarCursor(new Date(Number(event.target.value), calendarCursor.getMonth(), 1))}>
                    {yearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                  <small>{new Intl.DateTimeFormat(locale, { month: 'short' }).format(calendarCursor)}</small>
                  <button className="icon-button compact" type="button" aria-label={locale === 'zh-CN' ? '下个月' : 'Next month'} onClick={() => shiftCalendarMonth(1)}>
                    <ChevronRight size={13} aria-hidden />
                  </button>
                </div>
              </header>
              <div className="mini-week">
                {weekLabels.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
              <div className="mini-month">
                {monthCells.map((day) => {
                  const showTerms = data.settings.calendarShowSolarTerms !== false;
                  const countries = data.settings.calendarHolidayCountries ?? ['CN'];
                  const solarTerm = showTerms ? getSolarTermForDate(day) : undefined;
                  const holidays = getHolidaysForDate(day, countries);
                  const lunarStr = locale === 'zh-CN' ? lunarDay(day) : '';

                  let annotation = '';
                  let labelClass = '';
                  if (solarTerm) {
                    annotation = locale === 'zh-CN' ? solarTerm.name : solarTerm.nameEn.split(' ').map(w => w[0]).join('');
                    labelClass = 'st-label';
                  } else if (holidays.length > 0) {
                    annotation = locale === 'zh-CN' ? holidays[0].name : holidays[0].nameEn.slice(0, 4);
                    labelClass = 'hol-label';
                  } else {
                    annotation = lunarStr;
                  }

                  const tooltipParts: string[] = [];
                  if (lunarStr) tooltipParts.push(lunarStr);
                  if (solarTerm) tooltipParts.push(locale === 'zh-CN' ? solarTerm.name : solarTerm.nameEn);
                  holidays.forEach(h => tooltipParts.push(locale === 'zh-CN' ? h.name : h.nameEn));

                  return (
                    <span
                      key={day.toISOString()}
                      className={[
                        day.getMonth() !== calendarCursor.getMonth() ? 'muted' : '',
                        sameLocalDate(now, day) ? 'today' : '',
                        solarTerm ? 'has-term' : holidays.length > 0 ? 'has-holiday' : '',
                      ].filter(Boolean).join(' ')}
                      title={tooltipParts.length > 0 ? tooltipParts.join(' · ') : undefined}
                    >
                      <b>{day.getDate()}</b>
                      <em className={labelClass}>{annotation}</em>
                    </span>
                  );
                })}
              </div>
            </section>
          )}

          {visibleModules.todos !== false && (
            <section className="side-card todo-card">
              <header>
                <h2>{t(locale, 'todos')}</h2>
                <small>{pendingTodos.length}</small>
              </header>
              <ul className="todo-mini pending-list">
                {pendingTodos.map((todo) => (
                  <li key={todo.id}>
                    <button type="button" className="todo-check" onClick={() => void completeTodo(todo.id)} aria-label={locale === 'zh-CN' ? '完成待办' : 'Complete'}>
                      <Check size={12} aria-hidden />
                    </button>
                    <span>{todo.text}</span>
                    <button className="icon-button compact" type="button" aria-label={locale === 'zh-CN' ? '删除待办' : 'Delete'} onClick={() => void deleteTodo(todo.id)}>
                      <Trash2 size={12} aria-hidden />
                    </button>
                  </li>
                ))}
                {!pendingTodos.length && <li className="empty-row">{t(locale, 'noItems')}</li>}
              </ul>
              <div className="todo-entry">
                <input
                  value={todoDraft}
                  onChange={(event) => setTodoDraft(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && void addTodo()}
                  placeholder={locale === 'zh-CN' ? '新增待办...' : 'Add task...'}
                />
                <button className="icon-button" type="button" onClick={() => void addTodo()} aria-label="Add todo">
                  <Plus size={14} aria-hidden />
                </button>
              </div>
              <button className="button history-toggle" type="button" onClick={() => setShowDoneHistory((value) => !value)}>
                <RotateCcw size={13} aria-hidden />
                {locale === 'zh-CN' ? `已办历史 (${doneTodos.length})` : `Done history (${doneTodos.length})`}
              </button>
              {showDoneHistory && (
                <ul className="todo-mini done-list">
                  {doneTodos.map((todo) => (
                    <li key={todo.id}>
                      <span className="done-check">✅</span>
                      <span>{todo.text}</span>
                      <button className="icon-button compact" type="button" aria-label={locale === 'zh-CN' ? '恢复待办' : 'Restore'} onClick={() => void restoreTodo(todo.id)}>
                        <RotateCcw size={12} aria-hidden />
                      </button>
                      <button className="icon-button compact" type="button" aria-label={locale === 'zh-CN' ? '删除待办' : 'Delete'} onClick={() => void deleteTodo(todo.id)}>
                        <Trash2 size={12} aria-hidden />
                      </button>
                    </li>
                  ))}
                  {!doneTodos.length && <li className="empty-row">{t(locale, 'noItems')}</li>}
                </ul>
              )}
            </section>
          )}

          {visibleModules.tabs !== false && (
            <section className="side-card tabs-card">
              <header>
                <h2>{locale === 'zh-CN' ? '打开标签页' : 'Open Tabs'}</h2>
                <small className="tab-count-badge">{data.tabs.length}</small>
              </header>
              <ul className="tabs-mini">
                {data.tabs.map((tab) => (
                  <li key={tab.id ?? tab.url}>
                    <button
                      type="button"
                      className="tab-main"
                      onClick={() => tab.id !== undefined && browserApi.runtime.sendMessage({ type: 'FOCUS_TAB', tabId: tab.id, windowId: tab.windowId })}
                    >
                      <span>{tab.title ?? tab.url}</span>
                      <small>{fullUrlFromUrl(tab.url)}</small>
                    </button>
                    <div className="tab-quick-actions">
                      <button
                        className="icon-button compact"
                        type="button"
                        title={locale === 'zh-CN' ? '加入书签' : 'Add to bookmarks'}
                        onClick={() => setAddBookmarkModal({ title: tab.title ?? '', url: tab.url ?? '', folderId: 'root' })}
                      >
                        <BookmarkPlus size={13} aria-hidden />
                      </button>
                      <button
                        className="icon-button compact"
                        type="button"
                        title={locale === 'zh-CN' ? '加入常用站点' : 'Add to frequent sites'}
                        onClick={() => void addTabToFreqSites(tab)}
                      >
                        <Star size={13} aria-hidden />
                      </button>
                    </div>
                  </li>
                ))}
                {!data.tabs.length && <li className="empty-row">{t(locale, 'noItems')}</li>}
              </ul>
            </section>
          )}
        </aside>}
      </section>

      {weatherDetailOpen && data.weather && (
        <WeatherDetailPanel
          weather={data.weather}
          settings={data.settings}
          locale={locale}
          onClose={() => setWeatherDetailOpen(false)}
          onCityChange={async (city) => {
            setWeatherDetailOpen(false);
            await persistSettings((current) => ({ ...current, weather: { ...current.weather, city: city.trim() || undefined } }));
          }}
        />
      )}

      {driveMenuOpen && (
        <>
          <div className="drive-backdrop" onClick={() => setDriveMenuOpen(false)} />
          <div className="drive-panel" role="dialog" aria-label="Google Drive">
            <div className="drive-panel-head">
              <div className={`drive-panel-avatar${driveConnected ? ' connected' : ''}`}>
                <UserRound size={18} aria-hidden />
              </div>
              <div>
                <p className="drive-panel-title">Google Drive</p>
                <p className="drive-panel-sub">
                  {driveConnected
                    ? (locale === 'zh-CN' ? '已连接' : 'Connected')
                    : (locale === 'zh-CN' ? '未连接' : 'Not connected')}
                </p>
              </div>
            </div>
            {syncMessage && <p className="drive-panel-msg">{syncMessage}</p>}
            {driveConnected ? (
              <button
                className="button danger"
                type="button"
                onClick={async () => {
                  await revokeDriveToken();
                  setDriveConnected(false);
                  setDriveMenuOpen(false);
                  setSyncMessage('');
                }}
              >
                <LogOut size={14} aria-hidden />
                {locale === 'zh-CN' ? '退出登录' : 'Sign out'}
              </button>
            ) : (
              <button
                className="button primary"
                type="button"
                onClick={async () => {
                  setSyncMessage(locale === 'zh-CN' ? '正在连接...' : 'Connecting...');
                  try {
                    const token = await authorizeDrive();
                    setDriveConnected(true);
                    setSyncMessage(locale === 'zh-CN' ? '正在同步...' : 'Syncing...');
                    const pulled = await downloadAllDataFromDrive(token);
                    const hasRemoteData = (pulled.bookmarks?.length ?? 0) > 0 || (pulled.todos?.length ?? 0) > 0 || (pulled.frequentSites?.length ?? 0) > 0;
                    if (!hasRemoteData) {
                      await uploadAllDataToDrive(token);
                      setLastSyncedAt(Date.now());
                    } else {
                      const hasLocalData = data.bookmarks.length > 0 || data.todos.length > 0;
                      if (hasLocalData) {
                        setConflictPayload(pulled);
                      } else {
                        if (pulled.bookmarks) await persistBookmarks(pulled.bookmarks);
                        if (pulled.calendar) await persistCalendar(pulled.calendar);
                        if (pulled.todos) await persistTodos(pulled.todos);
                        if (pulled.settings) await persistSettings(() => pulled.settings!);
                        if (pulled.archivedTabs) await writeStorage('archivedTabs', pulled.archivedTabs);
                        if (pulled.frequentSites) await persistFrequentSites(pulled.frequentSites);
                        setLastSyncedAt(Date.now());
                      }
                    }
                    setSyncMessage('');
                    setDriveMenuOpen(false);
                  } catch (error) {
                    setSyncMessage(error instanceof Error ? error.message : locale === 'zh-CN' ? '连接失败。' : 'Connection failed.');
                  }
                }}
              >
                {locale === 'zh-CN' ? '连接 Google Drive' : 'Connect Google Drive'}
              </button>
            )}
          </div>
        </>
      )}

      {settingsOpen && <div className="settings-overlay" onClick={() => setSettingsOpen(false)} />}
      <SettingsDrawer
        open={settingsOpen}
        settings={data.settings}
        locale={locale}
        syncMessage={syncMessage}
        onClose={() => setSettingsOpen(false)}
        onSettings={persistSettings}
        onDownloadAll={async () => {
          setSyncMessage(locale === 'zh-CN' ? '正在下载...' : 'Downloading...');
          try {
            const token = (await getDriveToken()) ?? (await authorizeDrive());
            const pulled = await downloadAllDataFromDrive(token);
            const hasLocalData = data.bookmarks.length > 0 || data.todos.length > 0 || data.calendar.length > 0;
            const hasRemoteData = (pulled.bookmarks?.length ?? 0) > 0 || (pulled.todos?.length ?? 0) > 0;
            if (hasLocalData && hasRemoteData) {
              setConflictPayload(pulled);
              setSyncMessage('');
            } else {
              if (pulled.bookmarks) await persistBookmarks(pulled.bookmarks);
              if (pulled.calendar) await persistCalendar(pulled.calendar);
              if (pulled.todos) await persistTodos(pulled.todos);
              if (pulled.settings) await persistSettings(() => pulled.settings!);
              if (pulled.archivedTabs) await writeStorage('archivedTabs', pulled.archivedTabs);
              if (pulled.frequentSites) await persistFrequentSites(pulled.frequentSites);
              setLastSyncedAt(Date.now());
              setSyncMessage(locale === 'zh-CN' ? '下载完成。' : 'Download complete.');
            }
          } catch (error) {
            setSyncMessage(error instanceof Error ? error.message : locale === 'zh-CN' ? '下载失败。' : 'Download failed.');
          }
        }}
        onUploadAll={handleSyncNow}
        onLogout={async () => {
          await revokeDriveToken();
          setDriveConnected(false);
          setSyncMessage(locale === 'zh-CN' ? '已退出 Google Drive 登录。' : 'Logged out of Google Drive.');
        }}
        onBackgroundChange={(dataUrl) => {
          void persistSettings((current) => ({ ...current, backgroundImage: dataUrl }));
        }}
      />

      {conflictPayload && (
        <ConflictDialog
          locale={locale}
          onResolve={async (choice) => {
            const pulled = conflictPayload;
            setConflictPayload(null);
            if (choice === 'local') {
              setSyncMessage(locale === 'zh-CN' ? '已保留本地数据。' : 'Kept local data.');
              return;
            }
            if (choice === 'remote') {
              if (pulled.bookmarks) await persistBookmarks(pulled.bookmarks);
              if (pulled.calendar) await persistCalendar(pulled.calendar);
              if (pulled.todos) await persistTodos(pulled.todos);
              if (pulled.settings) await persistSettings(() => pulled.settings!);
              if (pulled.archivedTabs) await writeStorage('archivedTabs', pulled.archivedTabs);
              if (pulled.frequentSites) await persistFrequentSites(pulled.frequentSites);
              setLastSyncedAt(Date.now());
              setSyncMessage(locale === 'zh-CN' ? '已使用远端数据。' : 'Applied remote data.');
              return;
            }
            const mergedBookmarks = mergeBookmarksByUrl(data.bookmarks, pulled.bookmarks ?? []);
            await persistBookmarks(mergedBookmarks);
            if (pulled.calendar) {
              const calendarMap = new Map(data.calendar.map((event) => [event.id, event]));
              pulled.calendar.forEach((event) => {
                const local = calendarMap.get(event.id);
                if (!local || local.updatedAt < event.updatedAt) calendarMap.set(event.id, event);
              });
              await persistCalendar([...calendarMap.values()]);
            }
            if (pulled.todos) {
              const todoMap = new Map(data.todos.map((todo) => [todo.id, todo]));
              pulled.todos.forEach((todo) => {
                const local = todoMap.get(todo.id);
                if (!local || local.updatedAt < todo.updatedAt) todoMap.set(todo.id, todo);
              });
              await persistTodos([...todoMap.values()].sort((a, b) => a.order - b.order));
            }
            if (pulled.archivedTabs) await writeStorage('archivedTabs', pulled.archivedTabs);
            if (pulled.frequentSites) {
              const siteMap = new Map(data.frequentSites.map((s) => [s.id, s]));
              pulled.frequentSites.forEach((site) => {
                const local = siteMap.get(site.id);
                if (!local || local.updatedAt < site.updatedAt) siteMap.set(site.id, site);
              });
              await persistFrequentSites([...siteMap.values()].sort((a, b) => a.order - b.order));
            }
            setLastSyncedAt(Date.now());
            setSyncMessage(locale === 'zh-CN' ? '合并完成。' : 'Merge complete.');
          }}
        />
      )}

      {baziOpen && data.settings.baziEnabled && (
        <BaZiPanel now={now} locale={locale} onClose={() => setBaziOpen(false)} />
      )}

      {addBookmarkModal && (
        <AddBookmarkDialog
          initial={addBookmarkModal}
          allFolders={allFolderRows}
          locale={locale}
          onSave={async (title, url, folderId) => {
            const timestamp = Date.now();
            const link: BookmarkNode = {
              id: createId('bookmark'),
              type: 'link',
              title: title.trim() || url,
              url: url.trim(),
              order: 0,
              createdAt: timestamp,
              updatedAt: timestamp
            };
            const next = addLinkToFolder(data.bookmarks, folderId, link);
            await persistBookmarks(next);
            setAddBookmarkModal(null);
          }}
          onClose={() => setAddBookmarkModal(null)}
        />
      )}

      {freqSiteDialog && (
        <FreqSiteDialog
          initial={freqSiteDialog}
          locale={locale}
          onSave={async (title, url) => {
            const timestamp = Date.now();
            if (freqSiteDialog.mode === 'add') {
              const site: FrequentSite = {
                id: createId('freq'),
                title: title.trim() || url,
                url: url.trim(),
                order: data.frequentSites.length,
                createdAt: timestamp,
                updatedAt: timestamp
              };
              await persistFrequentSites([...data.frequentSites, site]);
            } else if (freqSiteDialog.id) {
              const next = data.frequentSites.map((s) =>
                s.id === freqSiteDialog.id
                  ? { ...s, title: title.trim() || url, url: url.trim(), updatedAt: timestamp }
                  : s
              );
              await persistFrequentSites(next);
            }
            setFreqSiteDialog(null);
          }}
          onClose={() => setFreqSiteDialog(null)}
        />
      )}
    </main>
  );
};

const PRESET_BG_COLORS = [
  '#ffffff', '#f5f0eb', '#fce8e6', '#fde8d8',
  '#fef9c3', '#e8f5e9', '#e0f2fe', '#f3e8fd',
  '#1a1a1a', '#2d3748', '#1e3a5f', '#1e4d3b',
  '#7c3aed', '#1d4ed8', '#0891b2', '#dc2626',
];

const SettingsDrawer = ({
  open,
  settings,
  locale,
  syncMessage,
  onClose,
  onSettings,
  onUploadAll,
  onDownloadAll,
  onLogout,
  onBackgroundChange
}: {
  open: boolean;
  settings: Settings;
  locale: Settings['locale'];
  syncMessage: string;
  onClose: () => void;
  onSettings: (updater: (settings: Settings) => Settings) => Promise<void>;
  onUploadAll: () => Promise<void>;
  onDownloadAll: () => Promise<void>;
  onLogout: () => Promise<void>;
  onBackgroundChange: (dataUrl?: string) => void;
}) => {
  if (!open) return null;
  return (
    <aside className="settings-drawer" aria-label={t(locale, 'settings')}>
      <header>
        <h2>{t(locale, 'settings')}</h2>
        <button className="icon-button" type="button" aria-label="Close settings" onClick={onClose}>
          <X size={18} aria-hidden />
        </button>
      </header>

      <section>
        <h3>{t(locale, 'appearance')}</h3>
        <label>
          {t(locale, 'theme')}
          <select className="select" value={settings.theme} onChange={(event) => onSettings((current) => ({ ...current, theme: event.target.value as Settings['theme'] }))}>
            <option value="system">{t(locale, 'system')}</option>
            <option value="light">{t(locale, 'light')}</option>
            <option value="dark">{t(locale, 'dark')}</option>
          </select>
        </label>
        <label>
          {t(locale, 'locale')}
          <select className="select" value={settings.locale} onChange={(event) => onSettings((current) => ({ ...current, locale: event.target.value as Settings['locale'] }))}>
            <option value="zh-CN">简体中文</option>
            <option value="en">English</option>
          </select>
        </label>
        <label>
          {t(locale, 'fontFamily')}
          <select className="select" value={settings.fontFamily} onChange={(event) => onSettings((current) => ({ ...current, fontFamily: event.target.value as Settings['fontFamily'] }))}>
            <option value="system">{t(locale, 'fontSystem')}</option>
            <option value="inter">{t(locale, 'fontInter')}</option>
            <option value="noto-sans">{t(locale, 'fontNotoSans')}</option>
            <option value="noto-serif">{t(locale, 'fontNotoSerif')}</option>
            <option value="lxgw">{t(locale, 'fontLXGW')}</option>
            <option value="roboto">{t(locale, 'fontRoboto')}</option>
            <option value="pingfang">{t(locale, 'fontPingFang')}</option>
          </select>
        </label>
        <label>
          {t(locale, 'fontWeight')}
          <select className="select" value={settings.fontWeight} onChange={(event) => onSettings((current) => ({ ...current, fontWeight: Number(event.target.value) as Settings['fontWeight'] }))}>
            <option value="300">300 — Light</option>
            <option value="400">400 — Regular</option>
            <option value="500">500 — Medium</option>
            <option value="600">600 — SemiBold</option>
            <option value="700">700 — Bold</option>
          </select>
        </label>
        <label>
          {t(locale, 'fontScaleLabel')}
          <select className="select" value={settings.fontScale} onChange={(event) => onSettings((current) => ({ ...current, fontScale: Number(event.target.value) }))}>
            <option value="0.8">80%</option>
            <option value="0.85">85%</option>
            <option value="0.9">90%</option>
            <option value="0.95">95%</option>
            <option value="1">100%</option>
            <option value="1.05">105%</option>
            <option value="1.1">110%</option>
            <option value="1.15">115%</option>
            <option value="1.2">120%</option>
            <option value="1.25">125%</option>
          </select>
        </label>
        <div className="bg-section-label">{locale === 'zh-CN' ? '背景' : 'Background'}</div>
        <div className="bg-picker-row">
          <div className="bg-img-col">
            <label className="button file-button bg-img-btn">
              <Image size={14} aria-hidden />
              {locale === 'zh-CN' ? '图片' : 'Image'}
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => onBackgroundChange(reader.result as string);
                  reader.readAsDataURL(file);
                }}
              />
            </label>
            {settings.backgroundImage && (
              <button className="button danger compact-btn" type="button" onClick={() => onBackgroundChange(undefined)}>
                <X size={12} aria-hidden />
              </button>
            )}
          </div>
          <div className="bg-color-col">
            <div className="color-swatches">
              {PRESET_BG_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`color-swatch${settings.backgroundColor === color ? ' active' : ''}`}
                  style={{ background: color }}
                  onClick={() => onSettings((current) => ({ ...current, backgroundColor: current.backgroundColor === color ? undefined : color }))}
                />
              ))}
            </div>
            <div className="color-controls">
              <input
                type="color"
                className="color-full"
                value={settings.backgroundColor ?? '#ffffff'}
                title={locale === 'zh-CN' ? '自定义颜色' : 'Custom color'}
                onChange={(e) => onSettings((current) => ({ ...current, backgroundColor: e.target.value }))}
              />
              <input
                type="range"
                min="0" max="100"
                className="opacity-range"
                value={settings.backgroundOpacity ?? 100}
                onChange={(e) => onSettings((current) => ({ ...current, backgroundOpacity: Number(e.target.value) }))}
              />
              <span className="opacity-label">{settings.backgroundOpacity ?? 100}%{locale === 'zh-CN' ? ' 透明度' : ' Opacity'}</span>
              {settings.backgroundColor && (
                <button className="icon-button compact" type="button" title={locale === 'zh-CN' ? '移除颜色' : 'Remove color'} onClick={() => onSettings((current) => ({ ...current, backgroundColor: undefined }))}>
                  <X size={12} aria-hidden />
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3>{t(locale, 'modules')}</h3>
        {settings.layout.map((item) => (
          <label key={item.moduleId} className="switch-row">
            <span>{moduleLabels[locale][item.moduleId]}</span>
            <input
              type="checkbox"
              checked={item.visible}
              onChange={(event) =>
                onSettings((current) => ({
                  ...current,
                  layout: current.layout.map((layoutItem) => (layoutItem.moduleId === item.moduleId ? { ...layoutItem, visible: event.target.checked } : layoutItem))
                }))
              }
            />
          </label>
        ))}
        <button className="button" type="button" onClick={() => onSettings((current) => ({ ...current, layout: defaultLayout }))}>
          {t(locale, 'resetLayout')}
        </button>
        <label>
          {t(locale, 'weekStart')}
          <select
            className="select"
            value={settings.calendarWeekStart}
            onChange={(event) => onSettings((current) => ({ ...current, calendarWeekStart: event.target.value as 'mon' | 'sun' }))}
          >
            <option value="mon">{t(locale, 'weekStartMon')}</option>
            <option value="sun">{t(locale, 'weekStartSun')}</option>
          </select>
        </label>
        <label className="switch-row">
          <span>{t(locale, 'showSolarTerms')}</span>
          <input
            type="checkbox"
            checked={settings.calendarShowSolarTerms !== false}
            onChange={(e) => onSettings((cur) => ({ ...cur, calendarShowSolarTerms: e.target.checked }))}
          />
        </label>
        <div>
          <p className="module-meta" style={{ marginBottom: 6 }}>{t(locale, 'holidayCountries')}</p>
          <div className="country-grid">
            {HOLIDAY_COUNTRIES.map((c) => {
              const checked = (settings.calendarHolidayCountries ?? ['CN']).includes(c.code);
              return (
                <label key={c.code} className="country-check">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const current = settings.calendarHolidayCountries ?? ['CN'];
                      onSettings((cur) => ({
                        ...cur,
                        calendarHolidayCountries: e.target.checked
                          ? [...current, c.code]
                          : current.filter((x) => x !== c.code)
                      }));
                    }}
                  />
                  <span>{locale === 'zh-CN' ? c.name : c.nameEn}</span>
                </label>
              );
            })}
          </div>
        </div>
      </section>

      <section>
        <h3>{t(locale, 'sync')}</h3>
        <label>
          {t(locale, 'drivePath')}
          <input className="input" value={settings.drive.folderPath} onChange={(event) => onSettings((current) => ({ ...current, drive: { ...current.drive, folderPath: event.target.value } }))} />
        </label>
        <label className="switch-row">
          <span>{t(locale, 'autoSync')}</span>
          <input type="checkbox" checked={settings.drive.autoSync} onChange={(event) => onSettings((current) => ({ ...current, drive: { ...current.drive, autoSync: event.target.checked } }))} />
        </label>
        <div className="toolbar">
          <button className="button primary" type="button" onClick={onUploadAll}>
            <Upload size={15} aria-hidden />
            {t(locale, 'upload')}
          </button>
          <button className="button" type="button" onClick={onDownloadAll}>
            <Download size={15} aria-hidden />
            {t(locale, 'download')}
          </button>
        </div>
        <button className="button" type="button" onClick={onLogout}>
          <LogOut size={15} aria-hidden />
          {t(locale, 'logout')}
        </button>
        {syncMessage && <p className="module-meta">{syncMessage}</p>}
      </section>

      <section>
        <h3>{t(locale, 'weather')}</h3>
        <label>
          {t(locale, 'weatherCity')}
          <input className="input" value={settings.weather.city ?? ''} onChange={(event) => onSettings((current) => ({ ...current, weather: { ...current.weather, city: event.target.value } }))} />
        </label>
        <label>
          {t(locale, 'weatherUnit')}
          <select className="select" value={settings.weather.unit} onChange={(event) => onSettings((current) => ({ ...current, weather: { ...current.weather, unit: event.target.value as 'C' | 'F' } }))}>
            <option value="C">{t(locale, 'celsius')}</option>
            <option value="F">{t(locale, 'fahrenheit')}</option>
          </select>
        </label>
      </section>

      <section>
        <h3>{t(locale, 'behavior')}</h3>
        <label className="switch-row">
          <span>{t(locale, 'preventLastTabClose')}</span>
          <input type="checkbox" checked={settings.behavior.preventLastTabClose} onChange={(event) => onSettings((current) => ({ ...current, behavior: { ...current.behavior, preventLastTabClose: event.target.checked } }))} />
        </label>
        <label className="switch-row">
          <span>{t(locale, 'baziEnable')}</span>
          <input type="checkbox" checked={settings.baziEnabled === true} onChange={(e) => onSettings((cur) => ({ ...cur, baziEnabled: e.target.checked }))} />
        </label>
        <label>
          {t(locale, 'searchEngine')}
          <select className="select" value={settings.search.engine} onChange={(event) => onSettings((current) => ({ ...current, search: { ...current.search, engine: event.target.value as Settings['search']['engine'] } }))}>
            <option value="google">Google</option>
            <option value="bing">Bing</option>
            <option value="ddg">DuckDuckGo</option>
            <option value="custom">{t(locale, 'custom')}</option>
          </select>
        </label>
        {settings.search.engine === 'custom' && (
          <label>
            {t(locale, 'customSearchUrl')}
            <input
              className="input"
              value={settings.search.customUrl ?? ''}
              placeholder="https://example.com/search?q={q}"
              onChange={(event) => onSettings((current) => ({ ...current, search: { ...current.search, customUrl: event.target.value } }))}
            />
          </label>
        )}
      </section>
    </aside>
  );
};

const WeatherDetailPanel = ({
  weather,
  settings,
  locale,
  onClose,
  onCityChange
}: {
  weather: WeatherSnapshot;
  settings: Settings;
  locale: Settings['locale'];
  onClose: () => void;
  onCityChange: (city: string) => Promise<void>;
}) => {
  const [cityDraft, setCityDraft] = useState(settings.weather.city ?? '');
  const isZh = locale === 'zh-CN';
  const unit = unitSymbol(settings);

  const uvLabel = (uv: number) => {
    if (uv <= 2) return isZh ? '低' : 'Low';
    if (uv <= 5) return isZh ? '中等' : 'Moderate';
    if (uv <= 7) return isZh ? '高' : 'High';
    if (uv <= 10) return isZh ? '很高' : 'Very High';
    return isZh ? '极高' : 'Extreme';
  };

  const beaufortLevel = (kmh: number) => {
    if (kmh < 1) return 0;
    if (kmh < 6) return 1;
    if (kmh < 12) return 2;
    if (kmh < 20) return 3;
    if (kmh < 29) return 4;
    if (kmh < 39) return 5;
    if (kmh < 50) return 6;
    if (kmh < 62) return 7;
    if (kmh < 75) return 8;
    if (kmh < 89) return 9;
    if (kmh < 103) return 10;
    if (kmh < 118) return 11;
    return 12;
  };

  const windDirectionLabel = (degrees: number) => {
    const zh = ['北', '东北', '东北', '东北', '东', '东南', '东南', '东南', '南', '西南', '西南', '西南', '西', '西北', '西北', '西北'];
    const en = ['N', 'NE', 'NE', 'NE', 'E', 'SE', 'SE', 'SE', 'S', 'SW', 'SW', 'SW', 'W', 'NW', 'NW', 'NW'];
    const index = Math.round(((degrees % 360) / 22.5)) % 16;
    return isZh ? `${zh[index]} ${Math.round(degrees)}°` : `${en[index]} ${Math.round(degrees)}°`;
  };

  const timeLabel = (time?: string) => {
    const [, clock] = time?.split('T') ?? [];
    return clock?.slice(0, 5);
  };

  const nowRef = new Date();
  const padZ = (n: number) => String(n).padStart(2, '0');
  const currentHourStr = `${nowRef.getFullYear()}-${padZ(nowRef.getMonth() + 1)}-${padZ(nowRef.getDate())}T${padZ(nowRef.getHours())}:00`;
  const hourly = weather.hourly ?? [];
  const startIdx = Math.max(0, (() => { const i = hourly.findIndex((h) => h.time >= currentHourStr); return i < 0 ? 0 : i; })());
  const next24 = hourly.slice(startIdx, startIdx + 24);
  const temps = next24.map((h) => h.temperature);
  const minT = temps.length ? Math.min(...temps) : 0;
  const maxT = temps.length ? Math.max(...temps) : 0;
  const rng = Math.max(maxT - minT, 1);
  const W = 360;
  const H = 72;
  const pad = 12;
  const toX = (i: number) => pad + (i / Math.max(temps.length - 1, 1)) * (W - 2 * pad);
  const toY = (t: number) => H - pad - ((t - minT) / rng) * (H - 2 * pad);
  const polyPoints = temps.map((t, i) => `${toX(i)},${toY(t)}`).join(' ');

  const forecastDateParts = (date: string) => {
    const parsed = new Date(`${date}T12:00:00`);
    const week = isZh
      ? ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][parsed.getDay()]
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][parsed.getDay()];
    return {
      date: `${padZ(parsed.getMonth() + 1)}-${padZ(parsed.getDate())}`,
      week
    };
  };

  return (
    <>
      <div className="wd-backdrop" onClick={onClose} />
      <div className="wd-panel" role="dialog" aria-label={isZh ? '天气详情' : 'Weather detail'}>
        <div className="wd-head">
          <div className="wd-location-row">
            <span className="wd-loc-name">{weather.location}</span>
            {weather.offline && <span className="pill">{isZh ? '离线' : 'Offline'}</span>}
          </div>
          <button className="icon-button compact" type="button" aria-label="Close" onClick={onClose}>
            <X size={15} aria-hidden />
          </button>
        </div>

        <div className="wd-city-row">
          <input
            className="input"
            value={cityDraft}
            onChange={(e) => setCityDraft(e.target.value)}
            placeholder={isZh ? '更改城市（如 北京）' : 'Change city (e.g. London)'}
            onKeyDown={(e) => { if (e.key === 'Enter') void onCityChange(cityDraft); }}
          />
          <button className="button" type="button" onClick={() => void onCityChange(cityDraft)}>
            {isZh ? '更新' : 'Update'}
          </button>
        </div>

        <div className="wd-current">
          <div className="wd-main-temp">
            <span className="wd-temp">{Math.round(weather.current.temperature)}{unit}</span>
            <span className="wd-cond">{weatherCodeLabel(weather.current.code, locale)}</span>
          </div>
          <div className="wd-stats-grid">
            <div className="wd-stat">
              <span>{isZh ? '体感温度' : 'Feels like'}</span>
              <strong>{Math.round(weather.current.apparentTemperature)}{unit}</strong>
            </div>
            {weather.current.humidity !== undefined && (
              <div className="wd-stat">
                <span>{isZh ? '湿度' : 'Humidity'}</span>
                <strong>{weather.current.humidity}%</strong>
              </div>
            )}
            {weather.current.uvIndex !== undefined && (
              <div className="wd-stat">
                <span>{isZh ? '紫外线' : 'UV Index'}</span>
                <strong>UV {Math.round(weather.current.uvIndex)} · {uvLabel(weather.current.uvIndex)}</strong>
              </div>
            )}
            {weather.current.windspeed !== undefined && (
              <div className="wd-stat">
                <span>{isZh ? '风速' : 'Wind'}</span>
                <strong>
                  {isZh
                    ? `${beaufortLevel(Math.round(weather.current.windspeed))} 级`
                    : `${Math.round(weather.current.windspeed)} km/h`}
                </strong>
              </div>
            )}
            {weather.current.windDirection !== undefined && (
              <div className="wd-stat">
                <span>{isZh ? '风向' : 'Wind Dir.'}</span>
                <strong>{windDirectionLabel(weather.current.windDirection)}</strong>
              </div>
            )}
            {weather.current.pressure !== undefined && (
              <div className="wd-stat">
                <span>{isZh ? '气压' : 'Pressure'}</span>
                <strong>{Math.round(weather.current.pressure)} hPa</strong>
              </div>
            )}
            {weather.current.sunrise && (
              <div className="wd-stat">
                <span>{isZh ? '日出' : 'Sunrise'}</span>
                <strong>{timeLabel(weather.current.sunrise) ?? '--:--'}</strong>
              </div>
            )}
            {weather.current.sunset && (
              <div className="wd-stat">
                <span>{isZh ? '日落' : 'Sunset'}</span>
                <strong>{timeLabel(weather.current.sunset) ?? '--:--'}</strong>
              </div>
            )}
            {weather.current.precipitation !== undefined && (
              <div className="wd-stat">
                <span>{isZh ? '降水' : 'Precip.'}</span>
                <strong>{weather.current.precipitation} mm</strong>
              </div>
            )}
          </div>
        </div>

        {next24.length > 1 && (
          <div className="wd-section">
            <p className="wd-section-title">{isZh ? '24 小时温度' : '24-Hour Temperature'}</p>
            <div className="wd-chart-wrap">
              <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none" className="wd-chart-svg">
                <defs>
                  <linearGradient id="wd-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polygon
                  points={`${toX(0)},${H} ${polyPoints} ${toX(temps.length - 1)},${H}`}
                  fill="url(#wd-grad)"
                />
                <polyline
                  points={polyPoints}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {next24.filter((_, i) => i % 6 === 0).map((h, labelIdx) => {
                  const origIdx = labelIdx * 6;
                  const t = temps[origIdx];
                  return (
                    <text key={h.time} x={toX(origIdx)} y={toY(t) - 5} fontSize="9" fill="var(--muted)" textAnchor="middle">
                      {Math.round(t)}{unit}
                    </text>
                  );
                })}
              </svg>
              <div className="wd-chart-labels">
                {next24.filter((_, i) => i % 6 === 0).map((h) => (
                  <span key={h.time}>{new Date(`${h.time}:00`).getHours()}:00</span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="wd-section">
          <p className="wd-section-title">{isZh ? `未来 ${weather.daily.length} 天` : `${weather.daily.length}-Day Forecast`}</p>
          <div className="wd-forecast-list">
            {weather.daily.map((day) => (
              <div key={day.date} className="wd-day-row">
                {(() => {
                  const parts = forecastDateParts(day.date);
                  return (
                    <>
                      <span className="wd-day-date">{parts.date}</span>
                      <span className="wd-day-week">{parts.week}</span>
                      <span className="wd-day-cond">{weatherCodeLabel(day.code, locale)}</span>
                      <span className="wd-day-range">
                        <strong>{Math.round(day.max)}</strong>
                        <small>/{Math.round(day.min)}{unit}</small>
                      </span>
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

const ConflictDialog = ({
  locale,
  onResolve
}: {
  locale: Settings['locale'];
  onResolve: (choice: 'local' | 'remote' | 'merge') => Promise<void>;
}) => (
  <div className="modal-overlay" role="dialog" aria-modal aria-label={t(locale, 'conflictTitle')}>
    <div className="modal">
      <h2>{t(locale, 'conflictTitle')}</h2>
      <p>{t(locale, 'conflictBody')}</p>
      <div className="modal-actions">
        <button className="button" type="button" onClick={() => onResolve('local')}>
          {t(locale, 'useLocal')}
        </button>
        <button className="button" type="button" onClick={() => onResolve('remote')}>
          {t(locale, 'useRemote')}
        </button>
        <button className="button primary" type="button" onClick={() => onResolve('merge')}>
          {t(locale, 'mergeBoth')}
        </button>
      </div>
    </div>
  </div>
);

const BaZiPanel = ({
  now,
  locale,
  onClose
}: {
  now: Date;
  locale: Settings['locale'];
  onClose: () => void;
}) => {
  const bz = computeBaZi(now);
  const isZh = locale === 'zh-CN';
  return (
    <>
      <div className="bazi-backdrop" onClick={onClose} />
      <div className="bazi-panel" role="dialog" aria-label={isZh ? '八字' : 'BaZi'}>
        <div className="bazi-head">
          <span className="bazi-title">{isZh ? '此刻八字' : 'BaZi · Four Pillars'}</span>
          <button className="icon-button compact" type="button" aria-label="Close" onClick={onClose}>
            <X size={15} aria-hidden />
          </button>
        </div>
        <div className="bazi-pillars">
          {[
            { label: isZh ? '时' : 'Hour', val: bz.hourPillar },
            { label: isZh ? '日' : 'Day',  val: bz.dayPillar },
            { label: isZh ? '月' : 'Month', val: bz.monthPillar },
            { label: isZh ? '年' : 'Year',  val: bz.yearPillar },
          ].map(({ label, val }) => (
            <div key={label} className="bazi-pillar">
              <span className="bazi-pillar-label">{label}</span>
              <span className="bazi-pillar-stem">{val[0]}</span>
              <span className="bazi-pillar-branch">{val[1]}</span>
            </div>
          ))}
        </div>
        <div className="bazi-meta">
          <span>{isZh ? `${bz.yearElement}年 · ${bz.yearZodiac}年` : `${bz.yearElement} · Year of ${bz.yearZodiac}`}</span>
          <span>{isZh ? bz.shichen : bz.shichenEn}</span>
        </div>
        <p className="bazi-note">
          {isZh
            ? '八字为当前时刻的四柱，随时间自动更新'
            : 'Four Pillars reflect the current moment and update in real time'}
        </p>
      </div>
    </>
  );
};

const AddBookmarkDialog = ({
  initial,
  allFolders,
  locale,
  onSave,
  onClose
}: {
  initial: AddBookmarkDialogData;
  allFolders: FolderRow[];
  locale: Settings['locale'];
  onSave: (title: string, url: string, folderId: string) => Promise<void>;
  onClose: () => void;
}) => {
  const [title, setTitle] = useState(initial.title);
  const [url, setUrl] = useState(initial.url);
  const [folderId, setFolderId] = useState(initial.folderId);
  const isZh = locale === 'zh-CN';
  return (
    <div className="modal-overlay" role="dialog" aria-modal aria-label={isZh ? '加入书签' : 'Add Bookmark'}>
      <div className="modal">
        <h2>{isZh ? '加入书签' : 'Add Bookmark'}</h2>
        <div className="dialog-form">
          <label>
            {isZh ? '名称' : 'Title'}
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </label>
          <label>
            {isZh ? '文件夹' : 'Folder'}
            <select className="select" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
              <option value="root">{isZh ? '根目录' : 'Root'}</option>
              {allFolders.map((f) => (
                <option key={f.id} value={f.id}>
                  {'  '.repeat(f.depth)}{f.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            URL
            <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
        </div>
        <div className="modal-actions">
          <button className="button" type="button" onClick={onClose}>
            {isZh ? '取消' : 'Cancel'}
          </button>
          <button className="button primary" type="button" onClick={() => void onSave(title, url, folderId)}>
            {isZh ? '保存' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

const FreqSiteDialog = ({
  initial,
  locale,
  onSave,
  onClose
}: {
  initial: FreqSiteDialogData;
  locale: Settings['locale'];
  onSave: (title: string, url: string) => Promise<void>;
  onClose: () => void;
}) => {
  const [title, setTitle] = useState(initial.title);
  const [url, setUrl] = useState(initial.url);
  const isZh = locale === 'zh-CN';
  const isAdd = initial.mode === 'add';
  return (
    <div className="modal-overlay" role="dialog" aria-modal aria-label={isZh ? (isAdd ? '添加常用站点' : '编辑常用站点') : (isAdd ? 'Add Site' : 'Edit Site')}>
      <div className="modal">
        <h2>{isZh ? (isAdd ? '添加常用站点' : '编辑常用站点') : (isAdd ? 'Add Frequent Site' : 'Edit Frequent Site')}</h2>
        <div className="dialog-form">
          <label>
            {isZh ? '名称' : 'Title'}
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </label>
          <label>
            URL
            <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
        </div>
        <div className="modal-actions">
          <button className="button" type="button" onClick={onClose}>
            {isZh ? '取消' : 'Cancel'}
          </button>
          <button className="button primary" type="button" onClick={() => void onSave(title, url)}>
            {isZh ? '保存' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};
