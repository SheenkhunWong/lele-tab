import type { RuntimeMessage, RuntimeResponse } from './types';

type AnyApi = typeof chrome & {
  runtime?: typeof chrome.runtime;
  tabs?: typeof chrome.tabs;
  windows?: typeof chrome.windows;
  storage?: typeof chrome.storage;
  bookmarks?: typeof chrome.bookmarks;
  identity?: typeof chrome.identity;
  alarms?: typeof chrome.alarms;
};

const getRawApi = (): AnyApi | undefined => {
  const globalApi = globalThis as typeof globalThis & { chrome?: AnyApi; browser?: AnyApi };
  return globalApi.browser ?? globalApi.chrome;
};

export const isExtensionRuntime = () => Boolean(getRawApi()?.runtime?.id);

const callbackToPromise = <T>(runner: (callback: (value: T) => void) => void): Promise<T> =>
  new Promise((resolve, reject) => {
    try {
      runner((value) => {
        const error = getRawApi()?.runtime?.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(value);
      });
    } catch (error) {
      reject(error);
    }
  });

export const browserApi = {
  raw: getRawApi,

  storage: {
    async get<T extends Record<string, unknown>>(keys?: string | string[] | Record<string, unknown>): Promise<T> {
      const api = getRawApi();
      if (!api?.storage?.local) return {} as T;
      const result = api.storage.local.get(keys as never);
      if (result && typeof (result as Promise<T>).then === 'function') return result as Promise<T>;
      return callbackToPromise<T>((callback) => api.storage.local.get(keys as never, callback));
    },

    async set(items: Record<string, unknown>): Promise<void> {
      const api = getRawApi();
      if (!api?.storage?.local) return;
      const result = api.storage.local.set(items);
      if (result && typeof (result as Promise<void>).then === 'function') return result as Promise<void>;
      return callbackToPromise<void>((callback) => api.storage.local.set(items, () => callback(undefined)));
    },

    async remove(keys: string | string[]): Promise<void> {
      const api = getRawApi();
      if (!api?.storage?.local) return;
      const result = api.storage.local.remove(keys);
      if (result && typeof (result as Promise<void>).then === 'function') return result as Promise<void>;
      return callbackToPromise<void>((callback) => api.storage.local.remove(keys, () => callback(undefined)));
    }
  },

  tabs: {
    async query(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
      const api = getRawApi();
      if (!api?.tabs) return [];
      const result = api.tabs.query(queryInfo);
      if (result && typeof (result as Promise<chrome.tabs.Tab[]>).then === 'function') return result as Promise<chrome.tabs.Tab[]>;
      return callbackToPromise<chrome.tabs.Tab[]>((callback) => api.tabs.query(queryInfo, callback));
    },

    async create(createProperties: chrome.tabs.CreateProperties): Promise<chrome.tabs.Tab> {
      const api = getRawApi();
      if (!api?.tabs) throw new Error('Tabs API is unavailable.');
      const result = api.tabs.create(createProperties);
      if (result && typeof (result as Promise<chrome.tabs.Tab>).then === 'function') return result as Promise<chrome.tabs.Tab>;
      return callbackToPromise<chrome.tabs.Tab>((callback) => api.tabs.create(createProperties, callback));
    },

    async update(tabId: number, updateProperties: chrome.tabs.UpdateProperties): Promise<chrome.tabs.Tab> {
      const api = getRawApi();
      if (!api?.tabs) throw new Error('Tabs API is unavailable.');
      const result = api.tabs.update(tabId, updateProperties);
      if (result && typeof (result as Promise<chrome.tabs.Tab>).then === 'function') return result as Promise<chrome.tabs.Tab>;
      return callbackToPromise<chrome.tabs.Tab>((callback) =>
        api.tabs.update(tabId, updateProperties, (tab) => {
          if (!tab) throw new Error('Tab update did not return a tab.');
          callback(tab);
        })
      );
    },

    async remove(tabId: number): Promise<void> {
      const api = getRawApi();
      if (!api?.tabs) throw new Error('Tabs API is unavailable.');
      const result = api.tabs.remove(tabId);
      if (result && typeof (result as Promise<void>).then === 'function') return result as Promise<void>;
      return callbackToPromise<void>((callback) => api.tabs.remove(tabId, () => callback(undefined)));
    }
  },

  windows: {
    async update(windowId: number, updateInfo: chrome.windows.UpdateInfo): Promise<chrome.windows.Window> {
      const api = getRawApi();
      if (!api?.windows) throw new Error('Windows API is unavailable.');
      const result = api.windows.update(windowId, updateInfo);
      if (result && typeof (result as Promise<chrome.windows.Window>).then === 'function') return result as Promise<chrome.windows.Window>;
      return callbackToPromise<chrome.windows.Window>((callback) => api.windows.update(windowId, updateInfo, callback));
    }
  },

  runtime: {
    async sendMessage<T = unknown>(message: RuntimeMessage): Promise<RuntimeResponse<T>> {
      const api = getRawApi();
      if (!api?.runtime?.sendMessage) return { ok: false, error: 'Runtime API is unavailable.' };
      const result = api.runtime.sendMessage(message);
      if (result && typeof (result as Promise<RuntimeResponse<T>>).then === 'function') return result as Promise<RuntimeResponse<T>>;
      return callbackToPromise<RuntimeResponse<T>>((callback) => api.runtime.sendMessage(message, callback));
    }
  },

  identity: {
    getRedirectURL(path = 'oauth2'): string {
      const api = getRawApi();
      if (!api?.identity?.getRedirectURL) throw new Error('Identity API is unavailable.');
      return api.identity.getRedirectURL(path);
    },

    async launchWebAuthFlow(details: chrome.identity.WebAuthFlowDetails): Promise<string> {
      const api = getRawApi();
      if (!api?.identity?.launchWebAuthFlow) throw new Error('Identity API is unavailable.');
      const result = api.identity.launchWebAuthFlow(details);
      if (result && typeof (result as Promise<string>).then === 'function') return result as Promise<string>;
      return callbackToPromise<string>((callback) =>
        api.identity.launchWebAuthFlow(details, (responseUrl) => {
          if (!responseUrl) throw new Error('Authorization did not return a response URL.');
          callback(responseUrl);
        })
      );
    },

    async getAuthToken(details: { interactive: boolean }): Promise<string> {
      const api = getRawApi();
      type IdentityWithGetAuthToken = typeof chrome.identity & { getAuthToken: (d: { interactive: boolean }, cb: (token: string) => void) => void };
      if (typeof (api?.identity as IdentityWithGetAuthToken | undefined)?.getAuthToken !== 'function') {
        throw new Error('getAuthToken API is unavailable.');
      }
      return callbackToPromise<string>((callback) =>
        (api!.identity as IdentityWithGetAuthToken).getAuthToken(details, (token) => {
          if (!token) throw new Error('Authorization failed.');
          callback(token);
        })
      );
    },

    async removeCachedAuthToken(token: string): Promise<void> {
      const api = getRawApi();
      type IdentityWithRemove = typeof chrome.identity & { removeCachedAuthToken: (d: { token: string }, cb: () => void) => void };
      if (typeof (api?.identity as IdentityWithRemove | undefined)?.removeCachedAuthToken !== 'function') return;
      return callbackToPromise<void>((callback) =>
        (api!.identity as IdentityWithRemove).removeCachedAuthToken({ token }, () => callback(undefined))
      );
    }
  }
};
