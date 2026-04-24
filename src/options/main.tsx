import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Download, Shield, Trash2, Upload } from 'lucide-react';
import '../styles/global.css';
import './options.css';
import { authorizeDrive, downloadAllDataFromDrive, getDriveToken, uploadAllDataToDrive } from '../lib/drive/driveClient';
import { moduleLabels, t } from '../lib/i18n';
import { clearLocalData, readStorage, writeStorage } from '../lib/storage/storage';
import type { ArchivedTabGroup, BookmarkNode, CalendarEvent, FrequentSite, ServiceLog, Settings, Todo } from '../lib/types';
import { defaultLayout, defaultSettings } from '../lib/types';

const applyTheme = (settings: Settings) => {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const fontMap: Record<Settings['fontFamily'], string> = {
    system: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    pingfang: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
    lxgw: '"LXGW WenKai", "霞鹜文楷", "Kaiti SC", serif',
    inter: '"Inter", "Segoe UI", sans-serif',
    'noto-sans': '"Noto Sans SC", sans-serif',
    'noto-serif': '"Noto Serif SC", serif',
    roboto: '"Roboto", "Segoe UI", sans-serif'
  };
  document.documentElement.dataset.theme = settings.theme === 'system' ? (prefersDark ? 'dark' : 'light') : settings.theme;
  document.documentElement.style.setProperty('--font-scale', String(settings.fontScale));
  document.documentElement.style.setProperty('--font-sans', fontMap[settings.fontFamily]);
  document.documentElement.style.setProperty('--font-weight', String(settings.fontWeight));
  localStorage.setItem('lele-tab-theme', settings.theme);
};

const OptionsApp = () => {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [message, setMessage] = useState('');
  const [logs, setLogs] = useState<ServiceLog[]>([]);
  const [logsVisible, setLogsVisible] = useState(false);

  useEffect(() => {
    void readStorage('settings').then((stored) => {
      setSettings(stored);
      applyTheme(stored);
    });
  }, []);

  const updateSettings = async (next: Settings) => {
    await writeStorage('settings', next);
    setSettings(next);
    applyTheme(next);
  };

  const locale = settings.locale;

  const exportAll = async () => {
    const payload = {
      settings,
      bookmarks: await readStorage('bookmarks'),
      todos: await readStorage('todos'),
      calendar: await readStorage('calendar'),
      archivedTabs: await readStorage('archivedTabs'),
      frequentSites: await readStorage('frequentSites')
    };
    const href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = 'lele-tab-data.json';
    anchor.click();
    URL.revokeObjectURL(href);
  };

  const importAll = async (file?: File) => {
    if (!file) return;
    const payload = JSON.parse(await file.text()) as Partial<{
      settings: Settings;
      bookmarks: BookmarkNode[];
      todos: Todo[];
      calendar: CalendarEvent[];
      archivedTabs: ArchivedTabGroup[];
      frequentSites: FrequentSite[];
    }>;
    if (payload.settings) await updateSettings(payload.settings);
    if (payload.bookmarks) await writeStorage('bookmarks', payload.bookmarks);
    if (payload.todos) await writeStorage('todos', payload.todos);
    if (payload.calendar) await writeStorage('calendar', payload.calendar);
    if (payload.archivedTabs) await writeStorage('archivedTabs', payload.archivedTabs);
    if (payload.frequentSites) await writeStorage('frequentSites', payload.frequentSites);
    setMessage('Imported.');
  };

  const driveUpload = async () => {
    setMessage('Uploading...');
    try {
      const token = (await getDriveToken()) ?? (await authorizeDrive());
      await uploadAllDataToDrive(token);
      setMessage('Upload complete.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Upload failed.');
    }
  };

  const driveDownload = async () => {
    setMessage('Downloading...');
    try {
      const token = (await getDriveToken()) ?? (await authorizeDrive());
      const pulled = await downloadAllDataFromDrive(token);
      if (pulled.settings) await updateSettings(pulled.settings);
      if (pulled.bookmarks) await writeStorage('bookmarks', pulled.bookmarks);
      if (pulled.todos) await writeStorage('todos', pulled.todos);
      if (pulled.calendar) await writeStorage('calendar', pulled.calendar);
      if (pulled.archivedTabs) await writeStorage('archivedTabs', pulled.archivedTabs);
      if (pulled.frequentSites) await writeStorage('frequentSites', pulled.frequentSites);
      setMessage('Download complete.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Download failed.');
    }
  };

  return (
    <main className="options-shell">
      <header className="options-hero">
        <div>
          <p className="eyebrow">LeLe Tab</p>
          <h1>{t(locale, 'settings')}</h1>
        </div>
        <Shield aria-hidden size={44} />
      </header>

      <section className="settings-grid">
        <section>
          <h2>{t(locale, 'appearance')}</h2>
          <label>
            {t(locale, 'theme')}
            <select className="select" value={settings.theme} onChange={(event) => updateSettings({ ...settings, theme: event.target.value as Settings['theme'] })}>
              <option value="system">{t(locale, 'system')}</option>
              <option value="light">{t(locale, 'light')}</option>
              <option value="dark">{t(locale, 'dark')}</option>
            </select>
          </label>
          <label>
            {t(locale, 'locale')}
            <select className="select" value={settings.locale} onChange={(event) => updateSettings({ ...settings, locale: event.target.value as Settings['locale'] })}>
              <option value="zh-CN">简体中文</option>
              <option value="en">English</option>
            </select>
          </label>
          <label>
            {t(locale, 'fontFamily')}
            <select className="select" value={settings.fontFamily} onChange={(event) => updateSettings({ ...settings, fontFamily: event.target.value as Settings['fontFamily'] })}>
              <option value="system">{t(locale, 'fontSystem')}</option>
              <option value="pingfang">{t(locale, 'fontPingFang')}</option>
              <option value="lxgw">{t(locale, 'fontLXGW')}</option>
              <option value="inter">{t(locale, 'fontInter')}</option>
            </select>
          </label>
          <label>
            {t(locale, 'fontWeight')}
            <select className="select" value={settings.fontWeight} onChange={(event) => updateSettings({ ...settings, fontWeight: Number(event.target.value) as Settings['fontWeight'] })}>
              <option value="400">400</option>
              <option value="500">500</option>
              <option value="600">600</option>
            </select>
          </label>
          <label>
            {t(locale, 'fontScaleLabel')}
            <input className="input" type="range" min="0.9" max="1.15" step="0.05" value={settings.fontScale} onChange={(event) => updateSettings({ ...settings, fontScale: Number(event.target.value) })} />
          </label>
        </section>

        <section>
          <h2>{t(locale, 'modules')}</h2>
          {settings.layout.map((item) => (
            <label key={item.moduleId} className="switch-row">
              <span>{moduleLabels[locale][item.moduleId]}</span>
              <input
                type="checkbox"
                checked={item.visible}
                onChange={(event) =>
                  updateSettings({
                    ...settings,
                    layout: settings.layout.map((layoutItem) => (layoutItem.moduleId === item.moduleId ? { ...layoutItem, visible: event.target.checked } : layoutItem))
                  })
                }
              />
            </label>
          ))}
          <button className="button" type="button" onClick={() => updateSettings({ ...settings, layout: defaultLayout })}>
            Reset layout
          </button>
        </section>

        <section>
          <h2>{t(locale, 'sync')}</h2>
          <label>
            {t(locale, 'drivePath')}
            <input className="input" value={settings.drive.folderPath} onChange={(event) => updateSettings({ ...settings, drive: { ...settings.drive, folderPath: event.target.value } })} />
          </label>
          <label className="switch-row">
            <span>{t(locale, 'autoSync')}</span>
            <input type="checkbox" checked={settings.drive.autoSync} onChange={(event) => updateSettings({ ...settings, drive: { ...settings.drive, autoSync: event.target.checked } })} />
          </label>
          <div className="toolbar">
            <button className="button primary" type="button" onClick={driveUpload}>
              <Upload size={16} aria-hidden />
              {t(locale, 'upload')}
            </button>
            <button className="button" type="button" onClick={driveDownload}>
              <Download size={16} aria-hidden />
              {t(locale, 'download')}
            </button>
          </div>
        </section>

        <section>
          <h2>{t(locale, 'weather')}</h2>
          <label>
            City
            <input className="input" value={settings.weather.city ?? ''} onChange={(event) => updateSettings({ ...settings, weather: { ...settings.weather, city: event.target.value } })} />
          </label>
          <label>
            Unit
            <select className="select" value={settings.weather.unit} onChange={(event) => updateSettings({ ...settings, weather: { ...settings.weather, unit: event.target.value as 'C' | 'F' } })}>
              <option value="C">Celsius</option>
              <option value="F">Fahrenheit</option>
            </select>
          </label>
        </section>

        <section>
          <h2>{t(locale, 'behavior')}</h2>
          <label className="switch-row">
            <span>{t(locale, 'preventLastTabClose')}</span>
            <input type="checkbox" checked={settings.behavior.preventLastTabClose} onChange={(event) => updateSettings({ ...settings, behavior: { ...settings.behavior, preventLastTabClose: event.target.checked } })} />
          </label>
          <label>
            Search engine
            <select className="select" value={settings.search.engine} onChange={(event) => updateSettings({ ...settings, search: { ...settings.search, engine: event.target.value as Settings['search']['engine'] } })}>
              <option value="google">Google</option>
              <option value="bing">Bing</option>
              <option value="ddg">DuckDuckGo</option>
              <option value="custom">Custom</option>
            </select>
          </label>
        </section>

        <section>
          <h2>{t(locale, 'data')}</h2>
          <div className="toolbar">
            <button className="button" type="button" onClick={exportAll}>
              <Download size={16} aria-hidden />
              JSON
            </button>
            <label className="button file-button">
              <Upload size={16} aria-hidden />
              JSON
              <input type="file" accept="application/json" onChange={(event) => importAll(event.target.files?.[0])} />
            </label>
            <button
              className="button danger"
              type="button"
              onClick={async () => {
                await clearLocalData();
                await updateSettings(defaultSettings);
                setMessage('Local data cleared.');
              }}
            >
              <Trash2 size={16} aria-hidden />
              Clear
            </button>
          </div>
          {message && <p className="module-meta">{message}</p>}
        </section>

        <section>
          <h2>{t(locale, 'about')}</h2>
          <p className="module-meta">LeLe Tab v1.0</p>
          <div className="toolbar">
            <button
              className="button"
              type="button"
              onClick={async () => {
                const stored = await readStorage('serviceLogs');
                setLogs(stored ?? []);
                setLogsVisible(true);
              }}
            >
              {t(locale, 'logs')}
            </button>
            {logsVisible && (
              <button
                className="button"
                type="button"
                onClick={async () => {
                  await writeStorage('serviceLogs', []);
                  setLogs([]);
                }}
              >
                {t(locale, 'clearLogs')}
              </button>
            )}
          </div>
          {logsVisible && (
            <ul className="compact-list" style={{ maxHeight: '320px' }}>
              {logs.length === 0 ? (
                <li style={{ gridTemplateColumns: '1fr', color: 'var(--muted)' }}>{t(locale, 'noLogs')}</li>
              ) : (
                logs.map((log) => (
                  <li key={log.id} style={{ gridTemplateColumns: '1fr', color: log.level === 'error' ? 'var(--danger)' : log.level === 'warn' ? 'orange' : 'inherit' }}>
                    <small>{new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(log.createdAt)}</small>
                    <span>{log.message}</span>
                  </li>
                ))
              )}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
};

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OptionsApp />
  </React.StrictMode>
);
