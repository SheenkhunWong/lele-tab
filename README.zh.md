# LeLe Tab

暖色极简风格的 Chrome / Firefox 新标签页工作台扩展。

[English](README.md)

---

## 功能模块

| 模块 | 说明 |
|------|------|
| **搜索** | 支持 Google / Bing / DuckDuckGo / 自定义搜索引擎。输入 `#关键词` 跳转到已打开的标签页；输入 `!关键词` 直接打开书签。 |
| **日历** | 月视图，支持自定义事件。内置中国节假日、二十四节气和八字日柱显示。 |
| **天气** | 使用 [Open-Meteo](https://open-meteo.com/)，无需 API Key。支持自动定位或手动输入城市，显示当前天气、逐小时预报和 7 天预报。 |
| **待办** | 轻量任务清单，支持分组和拖拽排序。 |
| **书签** | 树形结构书签，支持文件夹嵌套。支持导入/导出标准 Netscape HTML 书签格式，与浏览器书签管理器互通。 |
| **标签页** | 查看、搜索、切换、关闭、归档当前窗口或所有窗口的标签页。 |
| **常用站点** | 固定常用链接，一键直达。 |

**外观定制**
- 亮色 / 暗色 / 跟随系统三种主题
- 7 款字体：系统默认、苹方、[霞鹜文楷](https://github.com/lxgw/LxgwWenKai)、Inter、Noto Sans SC、Noto Serif SC、Roboto
- 字重与字号独立调节
- 自定义背景图片或背景颜色

**布局管理**
- 每个模块卡片可显示/隐藏、拖拽排序，以及在 `1×1`、`2×1`、`2×2` 三种尺寸间切换

**数据与同步**
- 所有数据默认保存在浏览器本地存储中
- 可选 Google Drive 同步，仅使用 `drive.file` scope（只能访问由本扩展创建的文件）
- 同步文件：`bookmarks.html`、`calendar.json`、`todos.json`、`settings.json`、`archived-tabs.json`

**其他**
- Manifest V3，Chrome 与 Firefox 各自独立的 manifest 文件
- 支持简体中文（`zh-CN`）和英文（`en`）
- 零遥测：不收集用户行为数据，不上报任何信息

---

## 技术栈

- **运行时**：React 19 + TypeScript 5
- **构建工具**：Vite 7
- **图标**：Lucide React
- **测试**：Vitest + Testing Library
- **代码规范**：ESLint 9 + Prettier

---

## 快速开始

### 环境要求

- Node.js ≥ 18
- npm ≥ 9

### 安装依赖

```bash
npm install
```

### 开发预览

```bash
npm run dev
```

在 `http://127.0.0.1:5173` 启动本地开发服务器，可预览页面 UI。标签页管理、书签等完整的扩展 API 需要以 unpacked 方式加载到浏览器后才能使用，步骤见下文。

### 构建

```bash
# Chrome
npm run build:chrome

# Firefox
npm run build:firefox
```

构建产物分别输出到 `dist/`（Chrome）和 `dist-firefox/`（Firefox）。

---

## 加载扩展到浏览器

**Chrome / Edge**

1. 执行 `npm run build:chrome`
2. 打开 `chrome://extensions`，开启右上角的**开发者模式**
3. 点击**加载已解压的扩展程序**，选择 `dist/` 目录

**Firefox**

1. 执行 `npm run build:firefox`
2. 打开 `about:debugging#/runtime/this-firefox`
3. 点击**临时载入附加组件**，选择 `dist-firefox/manifest.json` 文件

---

## Google Drive 同步配置（仅开发者需要操作）

> 普通用户安装后只需在设置页点击「连接 Google Drive」即可，无需任何技术操作。

Drive 同步默认关闭，属于可选功能。若要在自己的构建中启用，需在 [Google Cloud Console](https://console.cloud.google.com/) 申请 OAuth 凭证：

**Chrome**

1. APIs & Services → 凭据 → **创建凭据** → OAuth 客户端 ID
2. 应用类型选 **Chrome 应用**
3. 应用程序 ID 填写扩展发布后的 Extension ID（加载 unpacked 后可在 `chrome://extensions` 查看）
4. 将生成的 `client_id` 填入 `manifest.chrome.json` 的 `oauth2.client_id` 字段

**Firefox**

1. 应用类型选 **Web 应用**
2. 已获授权的重定向 URI 中填入 `https://oauthredirect.extensions.mozilla.org/` 以及 `browser.identity.getRedirectURL('oauth2')` 的返回值
3. 将生成的 `client_id` 填入 `src/lib/drive/driveClient.ts` 的 `FIREFOX_CLIENT_ID` 常量

未配置 Client ID 时，扩展仍可完整离线使用；仅 Drive 连接按钮会提示联系开发者。

---

## 验证

```bash
npm run typecheck     # TypeScript 类型检查
npm test              # 单元测试（Vitest）
npm run build:chrome  # 生产构建冒烟测试
```

---

## 目录结构

```
src/
├── background/     # Service Worker — 标签页事件监听、Drive 自动同步
├── lib/
│   ├── bookmarks/  # Netscape HTML 书签解析与序列化
│   ├── calendar/   # 节气、节假日、八字计算
│   ├── drive/      # Google Drive API 客户端
│   ├── weather/    # Open-Meteo API 客户端
│   ├── storage/    # 类型化浏览器存储封装
│   ├── browserApi  # Chrome / Firefox API 统一适配层
│   ├── i18n        # zh-CN / en 多语言消息
│   └── types       # 共享 TypeScript 类型与默认配置
├── newtab/         # 新标签页（React 入口）
├── options/        # 扩展设置页（React 入口）
├── styles/         # 全局 CSS
└── theme/          # 设计令牌（CSS 自定义属性）
```

---

## 隐私声明

LeLe Tab 不做任何遥测，不上传用户行为数据。

- 所有数据默认保存在浏览器本地存储中。
- Google Drive 同步为用户主动启用。启用后扩展仅使用 `drive.file` scope，只能访问由本扩展创建或用户明确选择的文件，文件存储在用户 Drive 的 `/LeLe Tab/` 目录下。
- 天气功能会向 Open-Meteo 发起请求。若用户授予浏览器定位权限，坐标仅用于当次天气查询，不会被扩展额外保存或上报。

---

## 许可证

MIT
