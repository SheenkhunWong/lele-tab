import { describe, expect, it } from 'vitest';
import { parseBookmarkHtml, serializeBookmarkHtml } from '../src/lib/bookmarks/html';
import type { BookmarkNode } from '../src/lib/types';

describe('Netscape bookmark HTML', () => {
  it('serializes and parses folders and links without losing hierarchy', () => {
    const nodes: BookmarkNode[] = [
      {
        id: 'folder-1',
        type: 'folder',
        title: 'Work & Research',
        order: 0,
        createdAt: 1735689600000,
        updatedAt: 1735689700000,
        children: [
          {
            id: 'link-1',
            type: 'link',
            title: 'Example <Docs>',
            url: 'https://example.com/docs?a=1&b=2',
            icon: 'data:image/png;base64,abc',
            order: 0,
            createdAt: 1735689600000,
            updatedAt: 1735689600000
          }
        ]
      }
    ];

    const html = serializeBookmarkHtml(nodes, 1735689800);
    const parsed = parseBookmarkHtml(html);

    expect(html).toContain('NETSCAPE-Bookmark-file-1');
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ type: 'folder', title: 'Work & Research' });
    expect(parsed[0].children?.[0]).toMatchObject({
      type: 'link',
      title: 'Example <Docs>',
      url: 'https://example.com/docs?a=1&b=2',
      icon: 'data:image/png;base64,abc'
    });
  });

  it('parses a browser-style bookmark file', () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
  <DT><H3 ADD_DATE="1735689600" LAST_MODIFIED="1735689601">Folder</H3>
  <DL><p>
    <DT><A HREF="https://anthropic.com" ADD_DATE="1735689602">Anthropic</A>
  </DL><p>
</DL><p>`;

    const parsed = parseBookmarkHtml(html);

    expect(parsed[0].title).toBe('Folder');
    expect(parsed[0].children?.[0].url).toBe('https://anthropic.com');
  });
});
