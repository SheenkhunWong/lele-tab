import type { BookmarkNode } from '../types';

const now = () => Date.now();

export const createId = (prefix = 'id') => {
  if ('crypto' in globalThis && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const decodeHtml = (value: string) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const parseAttrs = (raw: string) => {
  const attrs = new Map<string, string>();
  raw.replace(/([A-Z_:-]+)=["']([^"']*)["']/gi, (_, key: string, value: string) => {
    attrs.set(key.toUpperCase(), decodeHtml(value));
    return '';
  });
  return attrs;
};

const toSeconds = (value?: number) => Math.floor((value ?? now()) / 1000);

const renderNode = (node: BookmarkNode, depth: number): string => {
  const indent = '\t'.repeat(depth);
  const addDate = toSeconds(node.createdAt);
  const modified = toSeconds(node.updatedAt);

  if (node.type === 'folder') {
    const children = [...(node.children ?? [])].sort((a, b) => a.order - b.order).map((child) => renderNode(child, depth + 1));
    return [
      `${indent}<DT><H3 ADD_DATE="${addDate}" LAST_MODIFIED="${modified}">${escapeHtml(node.title)}</H3>`,
      `${indent}<DL><p>`,
      ...children,
      `${indent}</DL><p>`
    ].join('\n');
  }

  const icon = node.icon ? ` ICON="${escapeHtml(node.icon)}"` : '';
  return `${indent}<DT><A HREF="${escapeHtml(node.url ?? '')}" ADD_DATE="${addDate}" LAST_MODIFIED="${modified}"${icon}>${escapeHtml(node.title)}</A>`;
};

export const serializeBookmarkHtml = (nodes: BookmarkNode[], lastModified = Math.floor(Date.now() / 1000)): string => {
  const body = [...nodes].sort((a, b) => a.order - b.order).map((node) => renderNode(node, 1)).join('\n');
  return [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<META name="generator" content="LeLe Tab v1.0">',
    `<META name="last-modified" content="${lastModified}">`,
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
    body,
    '</DL><p>',
    ''
  ].join('\n');
};

export const getBookmarkHtmlLastModified = (html: string): number | undefined => {
  const match = html.match(/<META\s+name=["']last-modified["']\s+content=["'](\d+)["']/i);
  return match ? Number(match[1]) : undefined;
};

export const parseBookmarkHtml = (html: string): BookmarkNode[] => {
  const root: BookmarkNode[] = [];
  const stack: BookmarkNode[][] = [root];
  let pendingFolder: BookmarkNode | null = null;
  const tokenPattern = /<DT><H3([^>]*)>([\s\S]*?)<\/H3>|<DT><A([^>]*)>([\s\S]*?)<\/A>|<DL><p>|<\/DL><p>/gi;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(html))) {
    const [token] = match;

    if (/^<DT><H3/i.test(token)) {
      const attrs = parseAttrs(match[1] ?? '');
      const createdAt = Number(attrs.get('ADD_DATE') ?? Math.floor(now() / 1000)) * 1000;
      const updatedAt = Number(attrs.get('LAST_MODIFIED') ?? Math.floor(createdAt / 1000)) * 1000;
      const siblings = stack[stack.length - 1];
      const folder: BookmarkNode = {
        id: createId('folder'),
        type: 'folder',
        title: decodeHtml((match[2] ?? '').trim()),
        order: siblings.length,
        createdAt,
        updatedAt,
        children: []
      };
      siblings.push(folder);
      pendingFolder = folder;
      continue;
    }

    if (/^<DT><A/i.test(token)) {
      const attrs = parseAttrs(match[3] ?? '');
      const createdAt = Number(attrs.get('ADD_DATE') ?? Math.floor(now() / 1000)) * 1000;
      const updatedAt = Number(attrs.get('LAST_MODIFIED') ?? Math.floor(createdAt / 1000)) * 1000;
      const siblings = stack[stack.length - 1];
      siblings.push({
        id: createId('bookmark'),
        type: 'link',
        title: decodeHtml((match[4] ?? '').trim()) || attrs.get('HREF') || 'Untitled',
        url: attrs.get('HREF') ?? '',
        icon: attrs.get('ICON'),
        order: siblings.length,
        createdAt,
        updatedAt
      });
      pendingFolder = null;
      continue;
    }

    if (/^<DL><p>/i.test(token)) {
      if (pendingFolder?.children) {
        stack.push(pendingFolder.children);
        pendingFolder = null;
      }
      continue;
    }

    if (/^<\/DL><p>/i.test(token) && stack.length > 1) {
      stack.pop();
      pendingFolder = null;
    }
  }

  return root;
};

export const mergeBookmarksByUrl = (local: BookmarkNode[], remote: BookmarkNode[]): BookmarkNode[] => {
  const existingUrls = new Set<string>();
  const collectUrls = (nodes: BookmarkNode[]): void => {
    for (const node of nodes) {
      if (node.type === 'link' && node.url) existingUrls.add(node.url);
      else if (node.type === 'folder') collectUrls(node.children ?? []);
    }
  };
  collectUrls(local);

  const mergeInto = (base: BookmarkNode[], incoming: BookmarkNode[]): BookmarkNode[] => {
    const result = [...base];
    for (const node of incoming) {
      if (node.type === 'link') {
        if (node.url && existingUrls.has(node.url)) continue;
        existingUrls.add(node.url ?? '');
        result.push({ ...node, order: result.length });
      } else {
        const existingIdx = result.findIndex((n) => n.type === 'folder' && n.title === node.title);
        if (existingIdx >= 0) {
          result[existingIdx] = {
            ...result[existingIdx],
            children: mergeInto(result[existingIdx].children ?? [], node.children ?? [])
          };
        } else {
          const filteredChildren = mergeInto([], node.children ?? []);
          result.push({ ...node, children: filteredChildren, order: result.length });
        }
      }
    }
    return result.map((n, i) => ({ ...n, order: i }));
  };

  return mergeInto(local, remote);
};
