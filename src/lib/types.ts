export type ThemeMode = 'light' | 'dark' | 'system';
export type LocaleCode = 'zh-CN' | 'en';
export type ModuleSize = '1x1' | '2x1' | '2x2';
export type ModuleId = 'search' | 'calendar' | 'weather' | 'todos' | 'bookmarks' | 'tabs' | 'quickLinks';

export type FrequentSite = {
  id: string;
  title: string;
  url: string;
  order: number;
  createdAt: number;
  updatedAt: number;
};

export type BookmarkNode = {
  id: string;
  type: 'folder' | 'link';
  title: string;
  url?: string;
  icon?: string;
  children?: BookmarkNode[];
  order: number;
  createdAt: number;
  updatedAt: number;
};

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay?: boolean;
  note?: string;
  createdAt: number;
  updatedAt: number;
};

export type Todo = {
  id: string;
  text: string;
  done: boolean;
  group?: string;
  order: number;
  createdAt: number;
  updatedAt: number;
};

export type ArchivedTabGroup = {
  id: string;
  name: string;
  tabs: Array<{ title: string; url: string; favicon?: string }>;
  createdAt: number;
};

export type LayoutItem = {
  moduleId: ModuleId;
  size: ModuleSize;
  order: number;
  visible: boolean;
};

export type Settings = {
  theme: ThemeMode;
  fontFamily: 'system' | 'pingfang' | 'lxgw' | 'inter' | 'noto-sans' | 'noto-serif' | 'roboto';
  fontWeight: 300 | 400 | 500 | 600 | 700;
  layout: LayoutItem[];
  weather: {
    source: 'open-meteo' | 'owm';
    apiKey?: string;
    city?: string;
    unit: 'C' | 'F';
  };
  search: {
    engine: 'google' | 'bing' | 'ddg' | 'custom';
    customUrl?: string;
  };
  behavior: {
    preventLastTabClose: boolean;
  };
  drive: {
    folderPath: string;
    autoSync: boolean;
    fileNames: {
      bookmarks: string;
      calendar: string;
      todos: string;
      settings: string;
      archivedTabs: string;
      frequentSites: string;
    };
  };
  locale: LocaleCode;
  fontScale: number;
  backgroundImage?: string;
  backgroundColor?: string;
  backgroundOpacity?: number;
  calendarWeekStart: 'mon' | 'sun';
  calendarHolidayCountries?: string[];
  calendarShowSolarTerms?: boolean;
  baziEnabled?: boolean;
};

export type SyncEnvelope<T> = {
  schemaVersion: 1;
  lastModified: number;
  data: T;
};

export type RuntimeTab = {
  id?: number;
  windowId?: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
  active?: boolean;
};

export type WeatherSnapshot = {
  location: string;
  updatedAt: number;
  offline?: boolean;
  current: {
    temperature: number;
    apparentTemperature: number;
    code: number;
    label: string;
    humidity?: number;
    uvIndex?: number;
    precipitation?: number;
    windspeed?: number;
    windDirection?: number;
    pressure?: number;
    sunrise?: string;
    sunset?: string;
  };
  hourly?: Array<{ time: string; temperature: number }>;
  daily: Array<{
    date: string;
    min: number;
    max: number;
    code: number;
    label: string;
  }>;
};

export type StorageShape = {
  settings: Settings;
  bookmarks: BookmarkNode[];
  todos: Todo[];
  calendar: CalendarEvent[];
  archivedTabs: ArchivedTabGroup[];
  frequentSites: FrequentSite[];
  weatherCache?: WeatherSnapshot;
  driveToken?: string;
  serviceLogs?: ServiceLog[];
};

export type ServiceLog = {
  id: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  createdAt: number;
};

export type RuntimeMessage =
  | { type: 'GET_TABS'; scope: 'current' | 'all' }
  | { type: 'FOCUS_TAB'; tabId: number; windowId?: number }
  | { type: 'CLOSE_TAB'; tabId: number }
  | { type: 'ARCHIVE_TABS'; scope: 'current' | 'all' }
  | { type: 'IMPORT_BROWSER_BOOKMARKS' }
  | { type: 'OPEN_URL'; url: string; active?: boolean; window?: boolean }
  | { type: 'GET_LOGS' }
  | { type: 'CLEAR_LOGS' };

export type RuntimeResponse<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
};

export const defaultLayout: LayoutItem[] = [
  { moduleId: 'search', size: '2x1', order: 0, visible: true },
  { moduleId: 'calendar', size: '1x1', order: 1, visible: true },
  { moduleId: 'weather', size: '1x1', order: 2, visible: true },
  { moduleId: 'todos', size: '1x1', order: 3, visible: true },
  { moduleId: 'bookmarks', size: '2x2', order: 4, visible: true },
  { moduleId: 'tabs', size: '2x1', order: 5, visible: true },
  { moduleId: 'quickLinks', size: '1x1', order: 6, visible: true }
];

export const defaultSettings: Settings = {
  theme: 'system',
  fontFamily: 'system',
  fontWeight: 500,
  layout: defaultLayout,
  weather: { source: 'open-meteo', unit: 'C' },
  search: { engine: 'google' },
  behavior: { preventLastTabClose: true },
  drive: {
    folderPath: '/LeLe Tab/',
    autoSync: false,
    fileNames: {
      bookmarks: 'bookmarks.html',
      calendar: 'calendar.json',
      todos: 'todos.json',
      settings: 'settings.json',
      archivedTabs: 'archived-tabs.json',
      frequentSites: 'frequent-sites.json'
    }
  },
  locale: 'zh-CN',
  fontScale: 1,
  calendarWeekStart: 'mon'
};

export const storageDefaults: StorageShape = {
  settings: defaultSettings,
  frequentSites: [],
  bookmarks: [
    {
      id: 'folder-start',
      type: 'folder',
      title: '开始',
      order: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      children: [
        {
          id: 'bookmark-claude',
          type: 'link',
          title: 'Claude',
          url: 'https://claude.ai',
          order: 0,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ]
    }
  ],
  todos: [],
  calendar: [],
  archivedTabs: [],
  serviceLogs: []
};
