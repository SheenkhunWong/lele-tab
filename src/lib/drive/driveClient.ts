import { browserApi } from '../browserApi';
import { parseBookmarkHtml, serializeBookmarkHtml } from '../bookmarks/html';
import { readStorage, wrapEnvelope, writeStorage } from '../storage/storage';
import type { BookmarkNode, CalendarEvent, FrequentSite, Settings, Todo, ArchivedTabGroup, SyncEnvelope } from '../types';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

type DriveFile = { id: string; name: string; mimeType?: string; modifiedTime?: string };
type SyncFileKey = 'bookmarks' | 'calendar' | 'todos' | 'settings' | 'archivedTabs' | 'frequentSites';

// Firefox OAuth Web Client ID — fill in after registering on Google Cloud Console
// (Chrome uses manifest.chrome.json oauth2.client_id + chrome.identity.getAuthToken instead)
const FIREFOX_CLIENT_ID = '';

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

const escapeDriveQuery = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const supportsGetAuthToken = () =>
  typeof ((globalThis as Record<string, unknown>).chrome as { identity?: { getAuthToken?: unknown } } | undefined)
    ?.identity?.getAuthToken === 'function';

export const authorizeDrive = async (): Promise<string> => {
  if (supportsGetAuthToken()) {
    return browserApi.identity.getAuthToken({ interactive: true });
  }
  // Firefox: launchWebAuthFlow
  if (!FIREFOX_CLIENT_ID) throw new Error('Google Drive not configured. Please contact the developer.');
  const redirectUri = browserApi.identity.getRedirectURL('oauth2');
  console.log('[LeLe Tab] Firefox OAuth redirect URI:', redirectUri);
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', FIREFOX_CLIENT_ID);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', DRIVE_SCOPE);
  authUrl.searchParams.set('prompt', 'consent');
  const redirected = await browserApi.identity.launchWebAuthFlow({ url: authUrl.toString(), interactive: true });
  const params = new URL(redirected.replace('#', '?')).searchParams;
  const token = params.get('access_token');
  if (!token) throw new Error('Google authorization did not return a token.');
  await writeStorage('driveToken', token);
  return token;
};

export const getDriveToken = async (): Promise<string | undefined> => {
  if (supportsGetAuthToken()) {
    try {
      return await browserApi.identity.getAuthToken({ interactive: false });
    } catch {
      return undefined;
    }
  }
  const stored = await readStorage('driveToken');
  return stored || undefined;
};

export const revokeDriveToken = async (): Promise<void> => {
  if (supportsGetAuthToken()) {
    try {
      const token = await browserApi.identity.getAuthToken({ interactive: false });
      await browserApi.identity.removeCachedAuthToken(token);
    } catch {
      // ignore: already revoked or never authorized
    }
    return;
  }
  await writeStorage('driveToken', undefined as unknown as string);
};

const driveFetch = async <T>(token: string, input: RequestInfo | URL, init?: RequestInit): Promise<T> => {
  const response = await fetch(input, {
    ...init,
    headers: { ...authHeader(token), ...(init?.headers ?? {}) }
  });
  if (response.status === 401 && !supportsGetAuthToken()) {
    // Firefox token expired: clear stored token so next getDriveToken() triggers re-auth
    await writeStorage('driveToken', undefined as unknown as string);
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Drive request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
};

const findFile = async (token: string, name: string, parentId?: string): Promise<DriveFile | undefined> => {
  const clauses = [`name='${escapeDriveQuery(name)}'`, 'trashed=false'];
  if (parentId) clauses.push(`'${parentId}' in parents`);
  const url = new URL(`${DRIVE_API}/files`);
  url.searchParams.set('q', clauses.join(' and '));
  url.searchParams.set('fields', 'files(id,name,mimeType,modifiedTime)');
  const result = await driveFetch<{ files: DriveFile[] }>(token, url);
  return result.files[0];
};

const createFolder = async (token: string, name: string, parentId?: string): Promise<DriveFile> => {
  const metadata: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder'
  };
  if (parentId) metadata.parents = [parentId];
  return driveFetch<DriveFile>(token, `${DRIVE_API}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata)
  });
};

export const ensureDrivePath = async (token: string, path: string): Promise<string> => {
  const parts = path.split('/').map((part) => part.trim()).filter(Boolean);
  let parentId: string | undefined;

  for (const part of parts) {
    const existing = await findFile(token, part, parentId);
    parentId = existing?.id ?? (await createFolder(token, part, parentId)).id;
  }

  if (!parentId) {
    const root = await findFile(token, 'LeLe Tab');
    return root?.id ?? (await createFolder(token, 'LeLe Tab')).id;
  }

  return parentId;
};

const uploadTextFile = async (token: string, fileName: string, parentId: string, content: string, mimeType: string) => {
  const existing = await findFile(token, fileName, parentId);
  const metadata: Record<string, unknown> = { name: fileName, mimeType };
  if (!existing) metadata.parents = [parentId];

  const boundary = `lele-tab-${Date.now()}`;
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${mimeType}; charset=UTF-8`,
    '',
    content,
    `--${boundary}--`
  ].join('\r\n');

  const url = existing ? `${DRIVE_UPLOAD}/${existing.id}?uploadType=multipart` : `${DRIVE_UPLOAD}?uploadType=multipart`;
  return driveFetch<DriveFile>(token, url, {
    method: existing ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  });
};

const downloadTextFile = async (token: string, fileName: string, parentId: string): Promise<string | undefined> => {
  const file = await findFile(token, fileName, parentId);
  if (!file) return undefined;
  const response = await fetch(`${DRIVE_API}/files/${file.id}?alt=media`, { headers: authHeader(token) });
  if (!response.ok) throw new Error(`Drive download failed: ${response.status}`);
  return response.text();
};

export const uploadAllDataToDrive = async (token: string): Promise<void> => {
  const settings = await readStorage('settings');
  const folderId = await ensureDrivePath(token, settings.drive.folderPath);
  const [bookmarks, calendar, todos, archivedTabs, frequentSites] = await Promise.all([
    readStorage('bookmarks'),
    readStorage('calendar'),
    readStorage('todos'),
    readStorage('archivedTabs'),
    readStorage('frequentSites')
  ]);

  await Promise.all([
    uploadTextFile(token, settings.drive.fileNames.bookmarks, folderId, serializeBookmarkHtml(bookmarks), 'text/html'),
    uploadJson(token, settings.drive.fileNames.calendar, folderId, wrapEnvelope(calendar)),
    uploadJson(token, settings.drive.fileNames.todos, folderId, wrapEnvelope(todos)),
    uploadJson(token, settings.drive.fileNames.settings, folderId, wrapEnvelope(settings)),
    uploadJson(token, settings.drive.fileNames.archivedTabs, folderId, wrapEnvelope(archivedTabs)),
    uploadJson(token, settings.drive.fileNames.frequentSites, folderId, wrapEnvelope(frequentSites))
  ]);
};

const uploadJson = async <T>(token: string, name: string, folderId: string, envelope: SyncEnvelope<T>) =>
  uploadTextFile(token, name, folderId, JSON.stringify(envelope, null, 2), 'application/json');

const parseJsonEnvelope = <T>(content?: string): SyncEnvelope<T> | undefined => {
  if (!content) return undefined;
  const parsed = JSON.parse(content) as SyncEnvelope<T>;
  if (parsed.schemaVersion !== 1) throw new Error('Unsupported schemaVersion.');
  return parsed;
};

export const downloadAllDataFromDrive = async (token: string) => {
  const settings = await readStorage('settings');
  const folderId = await ensureDrivePath(token, settings.drive.folderPath);
  const files = settings.drive.fileNames;
  const [bookmarksHtml, calendarJson, todosJson, settingsJson, archivedJson, frequentSitesJson] = await Promise.all([
    downloadTextFile(token, files.bookmarks, folderId),
    downloadTextFile(token, files.calendar, folderId),
    downloadTextFile(token, files.todos, folderId),
    downloadTextFile(token, files.settings, folderId),
    downloadTextFile(token, files.archivedTabs, folderId),
    downloadTextFile(token, files.frequentSites, folderId)
  ]);

  return {
    bookmarks: bookmarksHtml ? parseBookmarkHtml(bookmarksHtml) : undefined,
    calendar: parseJsonEnvelope<CalendarEvent[]>(calendarJson)?.data,
    todos: parseJsonEnvelope<Todo[]>(todosJson)?.data,
    settings: parseJsonEnvelope<Settings>(settingsJson)?.data,
    archivedTabs: parseJsonEnvelope<ArchivedTabGroup[]>(archivedJson)?.data,
    frequentSites: parseJsonEnvelope<FrequentSite[]>(frequentSitesJson)?.data
  };
};
