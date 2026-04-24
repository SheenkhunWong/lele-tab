# LeLe Tab

LeLe Tab 是一个 Chrome / Firefox 新标签页浏览器扩展，按 `新标签页浏览器扩展 PRD.md` 实施。它提供暖色极简的工作台：搜索、日历、天气、待办、书签、已打开标签页和常用链接。

## 功能

- Manifest V3 新标签页替换，Chrome / Firefox 分别提供 manifest。
- 亮色、暗色、跟随系统三种主题，页面加载前写入主题，减少白屏闪烁。
- 模块卡片支持显示/隐藏、拖拽排序、`1x1` / `2x1` / `2x2` 尺寸切换。
- 日历事件、待办、书签、归档标签页、设置均默认本地保存。
- 书签支持 Netscape Bookmark File Format 的 HTML 导入/导出。
- 天气使用 Open-Meteo，无 API Key；支持定位或手动城市。
- 标签页模块可查看、搜索、切换、关闭和归档当前/所有窗口标签页。
- Google Drive 同步使用用户自己的 Drive 路径和 `drive.file` scope。需要自行配置 OAuth Client ID。
- 设置页同时通过新标签页右上角和扩展 options 页面访问。
- Service Worker 监听最后一个标签页关闭场景，并按设置自动打开新标签页。

## 开发

```bash
npm install
npm run dev
```

开发服务器用于预览页面。浏览器扩展能力需要构建后以 unpacked extension 加载。

## 构建

```bash
npm run build:chrome
npm run build:firefox
```

Chrome 构建产物位于 `dist/`，Firefox 构建产物位于 `dist-firefox/`。

## Google Drive OAuth（开发者一次性配置）

用户安装后只需点击「连接 Google Drive」即可，无需任何技术操作。

开发者发布前需在 [Google Cloud Console](https://console.cloud.google.com/) 申请两个 OAuth Client ID：

**Chrome：**
1. APIs & Services → Credentials → Create Credentials → OAuth client ID
2. 类型选 **Chrome App**，Application ID 填扩展发布后的 Extension ID
3. 将生成的 client_id 填入 `manifest.chrome.json` 的 `oauth2.client_id` 字段

**Firefox：**
1. 类型选 **Web application**，Authorized redirect URIs 填 `https://oauthredirect.extensions.mozilla.org/` 并加上扩展的 redirect URI（`browser.identity.getRedirectURL('oauth2')` 的返回值）
2. 将生成的 client_id 填入 `src/lib/drive/driveClient.ts` 的 `FIREFOX_CLIENT_ID` 常量

未配置 Client ID 时，扩展仍可完整离线使用；仅 Drive 连接会提示联系开发者。

## 验证

```bash
npm run typecheck
npm test
npm run build:chrome
```

## 隐私

LeLe Tab v1 不做遥测，不上传用户行为数据。默认数据保存在浏览器本地存储中。用户主动启用 Google Drive 同步时，扩展只使用 `https://www.googleapis.com/auth/drive.file` scope 访问由扩展创建或用户选择的文件，文件默认位于 `/LeLe Tab/`，包括：

- `bookmarks.html`
- `calendar.json`
- `todos.json`
- `settings.json`
- `archived-tabs.json`

天气功能会向 Open-Meteo 请求天气数据。若用户允许浏览器定位，坐标仅用于天气查询，不会被扩展额外上报或保存为行为数据。
