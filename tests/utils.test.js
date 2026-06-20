'use strict';

const {
  canonStatus,
  normH,
  buildMap,
  normalizeLink,
  extractUrl,
  toHref,
  esc,
  linkify,
  buildRecord,
  rowsFromMatrix,
  markDuplicates,
  stripRow,
  buildChunks,
  computeKPI,
  importRows,
  createUndoStack,
  applyUndo,
  applyFilters,
  STATUS,
  SAVE_BYTES,
  UNDO_MAX,
} = require('../src/utils');

// ─────────────────────────────────────────────────────────────────────────────
// canonStatus
// ─────────────────────────────────────────────────────────────────────────────
describe('canonStatus', () => {
  test('empty / null / undefined → blank', () => {
    expect(canonStatus('')).toBe('blank');
    expect(canonStatus(null)).toBe('blank');
    expect(canonStatus(undefined)).toBe('blank');
  });

  test('exact STATUS keys pass through unchanged', () => {
    expect(canonStatus('complete')).toBe('complete');
    expect(canonStatus('uncomplete')).toBe('uncomplete');
    expect(canonStatus('lost')).toBe('lost');
    expect(canonStatus('broken')).toBe('broken');
    expect(canonStatus('skip')).toBe('skip');
    expect(canonStatus('blank')).toBe('blank');
  });

  test('Indonesian equivalents', () => {
    expect(canonStatus('belum')).toBe('uncomplete');
    expect(canonStatus('hilang')).toBe('lost');
    expect(canonStatus('rusak')).toBe('broken');
    expect(canonStatus('mati')).toBe('broken');
    expect(canonStatus('lewat')).toBe('skip');
    expect(canonStatus('kosong')).toBe('blank');
    expect(canonStatus('selesai')).toBe('complete');
  });

  test('English shorthand', () => {
    expect(canonStatus('ok')).toBe('complete');
    expect(canonStatus('done')).toBe('complete');
  });

  test('case-insensitive matching', () => {
    expect(canonStatus('COMPLETE')).toBe('complete');
    expect(canonStatus('Broken')).toBe('broken');
    expect(canonStatus('BELUM')).toBe('uncomplete');
  });

  test('substring matching (words embedded in longer strings)', () => {
    expect(canonStatus('link broken!')).toBe('broken');
    expect(canonStatus('file hilang')).toBe('lost');
    expect(canonStatus('sudah selesai')).toBe('complete');
  });

  test('incomplete is treated as uncomplete (not complete)', () => {
    expect(canonStatus('incomplete')).toBe('uncomplete');
  });

  test('unrecognised values fall back to blank', () => {
    expect(canonStatus('random text')).toBe('blank');
    expect(canonStatus('12345')).toBe('blank');
    expect(canonStatus('???')).toBe('blank');
  });

  test('leading/trailing whitespace is trimmed', () => {
    expect(canonStatus('  complete  ')).toBe('complete');
    expect(canonStatus('\tbroken\n')).toBe('broken');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// normH
// ─────────────────────────────────────────────────────────────────────────────
describe('normH', () => {
  test('lowercases and strips non-alphanumeric', () => {
    expect(normH('Link URL')).toBe('linkurl');
    expect(normH('Last Page')).toBe('lastpage');
    expect(normH('REGION!')).toBe('region');
  });

  test('handles empty / null / undefined', () => {
    expect(normH('')).toBe('');
    expect(normH(null)).toBe('');
    expect(normH(undefined)).toBe('');
  });

  test('keeps digits', () => {
    expect(normH('Status2')).toBe('status2');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildMap
// ─────────────────────────────────────────────────────────────────────────────
describe('buildMap', () => {
  test('maps known column headers to field indices', () => {
    const map = buildMap(['No', 'Link URL', 'Status', 'Region']);
    expect(map.name).toBe(0);
    expect(map.link).toBe(1);
    expect(map.status).toBe(2);
    expect(map.region).toBe(3);
  });

  test('Indonesian header aliases', () => {
    const map = buildMap(['Nomor', 'Tautan', 'Wilayah', 'Keterangan']);
    expect(map.name).toBe(0);
    expect(map.link).toBe(1);
    expect(map.region).toBe(2);
    expect(map.status).toBe(3);
  });

  test('first occurrence wins when a header appears twice', () => {
    const map = buildMap(['link', 'url']);
    expect(map.link).toBe(0);
  });

  test('unrecognised headers are omitted', () => {
    const map = buildMap(['foo', 'bar', 'baz']);
    expect(Object.keys(map)).toHaveLength(0);
  });

  test('empty headers array', () => {
    expect(buildMap([])).toEqual({});
  });

  test('headers with mixed case and spaces', () => {
    const map = buildMap(['Download Link', 'Link Part', 'Last Pg']);
    expect(map.link).toBe(0);
    expect(map.part).toBe(1);
    expect(map.lastpage).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizeLink
// ─────────────────────────────────────────────────────────────────────────────
describe('normalizeLink', () => {
  test('strips http:// and https://', () => {
    expect(normalizeLink('http://example.com')).toBe('example.com');
    expect(normalizeLink('https://example.com')).toBe('example.com');
  });

  test('strips www. prefix', () => {
    expect(normalizeLink('https://www.example.com')).toBe('example.com');
    expect(normalizeLink('www.example.com')).toBe('example.com');
  });

  test('strips query strings', () => {
    expect(normalizeLink('https://example.com/page?foo=1&bar=2')).toBe('example.com/page');
  });

  test('strips fragments', () => {
    expect(normalizeLink('https://example.com/page#section')).toBe('example.com/page');
  });

  test('strips trailing slashes', () => {
    expect(normalizeLink('https://example.com/')).toBe('example.com');
    expect(normalizeLink('https://example.com/path///')).toBe('example.com/path');
  });

  test('lowercases the result', () => {
    expect(normalizeLink('HTTPS://Example.COM/Path')).toBe('example.com/path');
  });

  test('strips invisible / zero-width characters', () => {
    const zwsp = '​';
    const nbsp = ' ';
    const bom  = '﻿';
    expect(normalizeLink(`https://example.com${zwsp}`)).toBe('example.com');
    expect(normalizeLink(`${nbsp}https://example.com`)).toBe('example.com');
    expect(normalizeLink(`${bom}https://example.com`)).toBe('example.com');
  });

  test('empty / null / undefined → empty string', () => {
    expect(normalizeLink('')).toBe('');
    expect(normalizeLink(null)).toBe('');
    expect(normalizeLink(undefined)).toBe('');
  });

  test('variant URLs that should all normalise to the same key', () => {
    const variants = [
      'https://example.com',
      'http://example.com',
      'https://www.example.com',
      'http://www.example.com/',
      'HTTPS://WWW.EXAMPLE.COM/',
      'https://example.com?x=1',
      'https://example.com#frag',
    ];
    const normalised = variants.map(normalizeLink);
    expect(new Set(normalised).size).toBe(1);
  });

  test('preserves path when meaningful', () => {
    expect(normalizeLink('https://example.com/video/123')).toBe('example.com/video/123');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// extractUrl
// ─────────────────────────────────────────────────────────────────────────────
describe('extractUrl', () => {
  test('extracts URL from HYPERLINK formula', () => {
    expect(extractUrl('=HYPERLINK("https://example.com","label")')).toBe('https://example.com');
    expect(extractUrl("=HYPERLINK('https://example.com','label')")).toBe('https://example.com');
  });

  test('case-insensitive HYPERLINK keyword', () => {
    expect(extractUrl('=hyperlink("https://example.com","x")')).toBe('https://example.com');
  });

  test('extracts plain URL from text', () => {
    expect(extractUrl('https://example.com')).toBe('https://example.com');
    expect(extractUrl('visit https://example.com today')).toBe('https://example.com');
  });

  test('returns empty string when no URL found', () => {
    expect(extractUrl('no url here')).toBe('');
    expect(extractUrl('')).toBe('');
    expect(extractUrl(null)).toBe('');
  });

  test('prefers HYPERLINK formula over inline URL when both present', () => {
    expect(extractUrl('=HYPERLINK("https://target.com") see also https://other.com'))
      .toBe('https://target.com');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// toHref
// ─────────────────────────────────────────────────────────────────────────────
describe('toHref', () => {
  test('leaves http/https URLs unchanged', () => {
    expect(toHref('https://example.com')).toBe('https://example.com');
    expect(toHref('http://example.com')).toBe('http://example.com');
  });

  test('prepends https:// to bare domains', () => {
    expect(toHref('example.com')).toBe('https://example.com');
    expect(toHref('www.example.com/path')).toBe('https://www.example.com/path');
  });

  test('strips leading slashes before prepending', () => {
    expect(toHref('//example.com')).toBe('https://example.com');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// esc
// ─────────────────────────────────────────────────────────────────────────────
describe('esc', () => {
  test('escapes HTML special characters', () => {
    expect(esc('<script>')).toBe('&lt;script&gt;');
    expect(esc('"quoted"')).toBe('&quot;quoted&quot;');
    expect(esc('a & b')).toBe('a &amp; b');
  });

  test('null / undefined → empty string', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });

  test('numbers are coerced to strings', () => {
    expect(esc(42)).toBe('42');
  });

  test('plain text is returned unchanged', () => {
    expect(esc('hello world')).toBe('hello world');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// linkify
// ─────────────────────────────────────────────────────────────────────────────
describe('linkify', () => {
  test('wraps a bare URL in an anchor tag', () => {
    const out = linkify('https://example.com');
    expect(out).toContain('<a href="https://example.com"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener"');
  });

  test('wraps a www URL and adds https://', () => {
    const out = linkify('www.example.com');
    expect(out).toContain('href="https://www.example.com"');
  });

  test('escapes surrounding text', () => {
    const out = linkify('see <here> https://example.com');
    expect(out).toContain('&lt;here&gt;');
  });

  test('empty / null / undefined → dash placeholder', () => {
    expect(linkify('')).toContain('—');
    expect(linkify(null)).toContain('—');
    expect(linkify(undefined)).toContain('—');
  });

  test('resets regex lastIndex between calls (no stale state)', () => {
    const url = 'https://example.com';
    const first  = linkify(url);
    const second = linkify(url);
    expect(first).toBe(second);
  });

  test('text with no URL is escaped and returned', () => {
    const out = linkify('no link here');
    expect(out).toBe('no link here');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildRecord
// ─────────────────────────────────────────────────────────────────────────────
describe('buildRecord', () => {
  test('returns a record with all expected fields', () => {
    const r = buildRecord({ link: 'https://example.com', status: 'complete', region: 'id' });
    expect(r).toMatchObject({
      link: 'https://example.com',
      status: 'complete',
      region: 'ID',
    });
    expect(r._id).toMatch(/^r/);
    expect(typeof r.inputAt).toBe('number');
    expect(typeof r.updatedAt).toBe('number');
    expect(r._flag).toBeNull();
  });

  test('canonicalises status', () => {
    expect(buildRecord({ status: 'selesai' }).status).toBe('complete');
    expect(buildRecord({ status: 'rusak' }).status).toBe('broken');
    expect(buildRecord({}).status).toBe('blank');
  });

  test('uppercases region', () => {
    expect(buildRecord({ region: 'id' }).region).toBe('ID');
  });

  test('trims whitespace from string fields', () => {
    const r = buildRecord({ link: '  https://example.com  ', part: '  video  ' });
    expect(r.link).toBe('https://example.com');
    expect(r.part).toBe('video');
  });

  test('generates unique _id values across multiple calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => buildRecord({})._id));
    expect(ids.size).toBe(50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// rowsFromMatrix
// ─────────────────────────────────────────────────────────────────────────────
describe('rowsFromMatrix', () => {
  test('empty matrix returns empty array', () => {
    expect(rowsFromMatrix([])).toEqual([]);
  });

  test('parses standard header + data rows', () => {
    const matrix = [
      ['No', 'Link', 'Status', 'Region'],
      ['1', 'https://example.com', 'complete', 'ID'],
      ['2', 'https://other.com', 'broken', 'MY'],
    ];
    const rows = rowsFromMatrix(matrix);
    expect(rows).toHaveLength(2);
    expect(rows[0].link).toBe('https://example.com');
    expect(rows[0].status).toBe('complete');
    expect(rows[0].region).toBe('ID');
  });

  test('skips header row detection up to row 5', () => {
    const matrix = [
      ['irrelevant', 'noise'],        // row 0 — no recognized headers
      ['No', 'Link', 'Status'],       // row 1 — first with ≥2 recognized headers
      ['1', 'https://example.com', 'complete'],
    ];
    const rows = rowsFromMatrix(matrix);
    expect(rows).toHaveLength(1);
    expect(rows[0].link).toBe('https://example.com');
  });

  test('skips rows with neither link nor name', () => {
    const matrix = [
      ['No', 'Link', 'Status'],
      ['', '', 'complete'],           // no link or name → skipped
      ['1', 'https://example.com', 'broken'],
    ];
    const rows = rowsFromMatrix(matrix);
    expect(rows).toHaveLength(1);
  });

  test('extracts URL from HYPERLINK formula in link cell', () => {
    const matrix = [
      ['No', 'Link', 'Status'],
      ['1', '=HYPERLINK("https://example.com","label")', 'complete'],
    ];
    const rows = rowsFromMatrix(matrix);
    expect(rows[0].link).toBe('https://example.com');
  });

  test('uses first cell containing "/" as link when no link column exists', () => {
    const matrix = [
      ['Status', 'Region'],           // no 'link' header → fallback
      ['complete', 'https://example.com/page'],
    ];
    const rows = rowsFromMatrix(matrix);
    expect(rows[0].link).toBe('https://example.com/page');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// markDuplicates
// ─────────────────────────────────────────────────────────────────────────────
describe('markDuplicates', () => {
  const makeRow = (link, extra = {}) => ({ link, _dup: false, _dupKeep: false, ...extra });

  test('returns 0 for empty dataset', () => {
    expect(markDuplicates([])).toBe(0);
  });

  test('returns 0 when no duplicates exist', () => {
    const data = [makeRow('https://a.com'), makeRow('https://b.com')];
    expect(markDuplicates(data)).toBe(0);
    expect(data[0]._dup).toBe(false);
    expect(data[1]._dup).toBe(false);
  });

  test('detects exact duplicate links', () => {
    const data = [makeRow('https://example.com'), makeRow('https://example.com')];
    expect(markDuplicates(data)).toBe(1);
    expect(data[0]._dupKeep).toBe(true);
    expect(data[1]._dup).toBe(true);
  });

  test('normalises protocol variants (http vs https)', () => {
    const data = [makeRow('http://example.com'), makeRow('https://example.com')];
    expect(markDuplicates(data)).toBe(1);
  });

  test('normalises www prefix', () => {
    const data = [makeRow('https://example.com'), makeRow('https://www.example.com')];
    expect(markDuplicates(data)).toBe(1);
  });

  test('normalises trailing slash', () => {
    const data = [makeRow('https://example.com'), makeRow('https://example.com/')];
    expect(markDuplicates(data)).toBe(1);
  });

  test('normalises query strings', () => {
    const data = [makeRow('https://example.com/page'), makeRow('https://example.com/page?x=1')];
    expect(markDuplicates(data)).toBe(1);
  });

  test('case-insensitive comparison', () => {
    const data = [makeRow('https://EXAMPLE.COM'), makeRow('https://example.com')];
    expect(markDuplicates(data)).toBe(1);
  });

  test('rows with empty links are not counted as duplicates', () => {
    const data = [makeRow(''), makeRow(''), makeRow('https://example.com')];
    expect(markDuplicates(data)).toBe(0);
  });

  test('marks the first occurrence as _dupKeep', () => {
    const data = [makeRow('https://a.com'), makeRow('https://a.com'), makeRow('https://a.com')];
    markDuplicates(data);
    expect(data[0]._dupKeep).toBe(true);
    expect(data[1]._dup).toBe(true);
    expect(data[2]._dup).toBe(true);
  });

  test('resets flags on subsequent calls', () => {
    const data = [makeRow('https://a.com'), makeRow('https://a.com')];
    markDuplicates(data);
    data[1].link = 'https://b.com';  // remove the duplicate
    const count = markDuplicates(data);
    expect(count).toBe(0);
    expect(data[0]._dup).toBe(false);
    expect(data[0]._dupKeep).toBe(false);
    expect(data[1]._dup).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// stripRow / buildChunks
// ─────────────────────────────────────────────────────────────────────────────
describe('stripRow', () => {
  test('retains only storage-relevant fields', () => {
    const row = {
      link: 'https://example.com', test: 't', status: 'complete', part: 'p',
      date: 'd', region: 'ID', update: 'u', lastpage: 'lp', active: 'a',
      _id: 'r123', inputAt: 1000, updatedAt: 2000, _statusLocked: true,
      _dup: true, _dupKeep: false, _flag: 'new',  // these should be stripped
    };
    const s = stripRow(row);
    expect(s._dup).toBeUndefined();
    expect(s._flag).toBeUndefined();
    expect(s._statusLocked).toBe(1);
    expect(s.link).toBe('https://example.com');
  });

  test('_statusLocked=false is stored as undefined (omitted)', () => {
    const row = { _statusLocked: false, link: '', test: '', status: '', part: '',
      date: '', region: '', update: '', lastpage: '', active: '', _id: '', inputAt: 0, updatedAt: 0 };
    expect(stripRow(row)._statusLocked).toBeUndefined();
  });
});

describe('buildChunks', () => {
  test('returns empty array for empty DATA', () => {
    expect(buildChunks([])).toEqual([]);
  });

  test('puts all rows in one chunk when data is small', () => {
    const data = [
      { link: 'https://a.com', test: '', status: 'complete', part: '', date: '', region: '',
        update: '', lastpage: '', active: '', _id: 'r1', inputAt: 1, updatedAt: 1 },
      { link: 'https://b.com', test: '', status: 'blank',    part: '', date: '', region: '',
        update: '', lastpage: '', active: '', _id: 'r2', inputAt: 2, updatedAt: 2 },
    ];
    const chunks = buildChunks(data);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(2);
  });

  test('splits into multiple chunks when total exceeds SAVE_BYTES', () => {
    // Each row ~ 200 bytes; SAVE_BYTES = 3.5 MB → need ~17 500 rows to trigger a split.
    // Use a huge string to force a split with fewer rows.
    const bigLink = 'x'.repeat(SAVE_BYTES - 10);
    const data = [
      { link: bigLink, test: '', status: '', part: '', date: '', region: '',
        update: '', lastpage: '', active: '', _id: 'r1', inputAt: 1, updatedAt: 1 },
      { link: 'https://b.com', test: '', status: '', part: '', date: '', region: '',
        update: '', lastpage: '', active: '', _id: 'r2', inputAt: 2, updatedAt: 2 },
    ];
    const chunks = buildChunks(data);
    expect(chunks.length).toBeGreaterThan(1);
  });

  test('every row appears exactly once across all chunks', () => {
    const makeRow = (n) => ({
      link: `https://example.com/${n}`, test: '', status: 'blank', part: '', date: '',
      region: '', update: '', lastpage: '', active: '', _id: `r${n}`, inputAt: n, updatedAt: n,
    });
    const data = Array.from({ length: 10 }, (_, i) => makeRow(i));
    const chunks = buildChunks(data);
    const allLinks = chunks.flat().map(r => r.link);
    expect(allLinks).toHaveLength(10);
    expect(new Set(allLinks).size).toBe(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeKPI
// ─────────────────────────────────────────────────────────────────────────────
describe('computeKPI', () => {
  test('all zeros for empty dataset', () => {
    const k = computeKPI([]);
    expect(k.total).toBe(0);
    expect(k.complete).toBe(0);
  });

  test('counts each status correctly', () => {
    const data = [
      { status: 'complete' }, { status: 'complete' },
      { status: 'uncomplete' },
      { status: 'lost' },
      { status: 'blank' }, { status: 'blank' }, { status: 'blank' },
    ];
    const k = computeKPI(data);
    expect(k.total).toBe(7);
    expect(k.complete).toBe(2);
    expect(k.uncomplete).toBe(1);
    expect(k.lost).toBe(1);
    expect(k.blank).toBe(3);
    expect(k.skip).toBe(0);
    expect(k.broken).toBe(0);
  });

  test('total equals sum of all status counts', () => {
    const data = [
      { status: 'complete' }, { status: 'blank' }, { status: 'skip' },
    ];
    const k = computeKPI(data);
    const sum = k.complete + k.uncomplete + k.lost + k.skip + k.broken + k.blank;
    expect(sum).toBe(k.total);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// importRows
// ─────────────────────────────────────────────────────────────────────────────
describe('importRows — replace mode', () => {
  test('replaces all existing data with incoming rows', () => {
    const DATA = [
      { link: 'https://old.com', status: 'complete', _flag: null, _id: 'r0' },
    ];
    const rows = [
      { link: 'https://new1.com', status: 'blank' },
      { link: 'https://new2.com', status: 'broken' },
    ];
    const { added } = importRows(DATA, rows, 'replace');
    expect(added).toBe(2);
    expect(DATA).toHaveLength(2);
    expect(DATA[0].link).toBe('https://new1.com');
    expect(DATA[0]._flag).toBe('new');
  });

  test('all replaced rows get _flag=new', () => {
    const DATA = [];
    importRows(DATA, [{ link: 'https://a.com', status: 'blank' }], 'replace');
    expect(DATA[0]._flag).toBe('new');
  });
});

describe('importRows — append mode', () => {
  test('appends rows without touching existing data', () => {
    const DATA = [{ link: 'https://existing.com', status: 'complete', _flag: null, _id: 'r0' }];
    const { added } = importRows(DATA, [{ link: 'https://new.com', status: 'blank' }], 'append');
    expect(added).toBe(1);
    expect(DATA).toHaveLength(2);
    expect(DATA[1].link).toBe('https://new.com');
    expect(DATA[1]._flag).toBe('new');
  });
});

describe('importRows — merge mode', () => {
  test('updates existing rows matched by normalised URL', () => {
    const DATA = [
      { link: 'https://example.com', status: 'blank', _flag: null, _id: 'r1', inputAt: 100, _statusLocked: false },
    ];
    const rows = [{ link: 'http://www.example.com/', status: 'complete' }];
    const { updated } = importRows(DATA, rows, 'merge');
    expect(updated).toBe(1);
    expect(DATA).toHaveLength(1);
    expect(DATA[0].status).toBe('complete');
    expect(DATA[0]._flag).toBe('upd');
    expect(DATA[0].link).toBe('https://example.com');  // original link preserved
  });

  test('adds new rows that do not match existing entries', () => {
    const DATA = [{ link: 'https://existing.com', status: 'complete', _flag: null, _id: 'r1', inputAt: 1, _statusLocked: false }];
    const { added } = importRows(DATA, [{ link: 'https://new.com', status: 'blank' }], 'merge');
    expect(added).toBe(1);
    expect(DATA).toHaveLength(2);
  });

  test('does not overwrite status when incoming status is blank', () => {
    const DATA = [{ link: 'https://example.com', status: 'complete', _flag: null, _id: 'r1', inputAt: 1, _statusLocked: false }];
    importRows(DATA, [{ link: 'https://example.com', status: 'blank' }], 'merge');
    expect(DATA[0].status).toBe('complete');
  });

  test('does not overwrite status when _statusLocked is true', () => {
    const DATA = [{ link: 'https://example.com', status: 'complete', _flag: null, _id: 'r1', inputAt: 1, _statusLocked: true }];
    importRows(DATA, [{ link: 'https://example.com', status: 'broken' }], 'merge');
    expect(DATA[0].status).toBe('complete');
  });

  test('preserves inputAt of existing row on merge', () => {
    const DATA = [{ link: 'https://example.com', status: 'blank', _flag: null, _id: 'r1', inputAt: 999, _statusLocked: false }];
    importRows(DATA, [{ link: 'https://example.com', status: 'complete', inputAt: 1 }], 'merge');
    expect(DATA[0].inputAt).toBe(999);
  });
});

describe('importRows — source deduplication', () => {
  test('skips duplicate links within the incoming rows', () => {
    const DATA = [];
    const rows = [
      { link: 'https://example.com', status: 'blank' },
      { link: 'https://example.com', status: 'complete' },  // duplicate → skipped
    ];
    const { added, srcDups } = importRows(DATA, rows, 'append');
    expect(added).toBe(1);
    expect(srcDups).toBe(1);
  });

  test('URL variant in source is treated as duplicate', () => {
    const DATA = [];
    const rows = [
      { link: 'https://example.com', status: 'blank' },
      { link: 'http://www.example.com/', status: 'broken' }, // same normalised key
    ];
    const { srcDups } = importRows(DATA, rows, 'append');
    expect(srcDups).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createUndoStack / applyUndo
// ─────────────────────────────────────────────────────────────────────────────
describe('createUndoStack', () => {
  test('starts empty', () => {
    expect(createUndoStack().length).toBe(0);
  });

  test('push and pop work correctly', () => {
    const stack = createUndoStack();
    stack.push({ kind: 'edit', id: '1', prev: {} });
    expect(stack.length).toBe(1);
    const entry = stack.pop();
    expect(entry.kind).toBe('edit');
    expect(stack.length).toBe(0);
  });

  test(`caps at UNDO_MAX (${UNDO_MAX}) entries`, () => {
    const stack = createUndoStack();
    for (let i = 0; i < UNDO_MAX + 5; i++) {
      stack.push({ kind: 'edit', id: String(i), prev: {} });
    }
    expect(stack.length).toBe(UNDO_MAX);
  });

  test('oldest entry is discarded first when cap exceeded', () => {
    const stack = createUndoStack();
    stack.push({ kind: 'edit', id: 'FIRST', prev: {} });
    for (let i = 0; i < UNDO_MAX; i++) stack.push({ kind: 'edit', id: String(i), prev: {} });
    // pop everything and verify FIRST is gone
    const entries = [];
    let e;
    while ((e = stack.pop())) entries.push(e.id);
    expect(entries).not.toContain('FIRST');
  });
});

describe('applyUndo', () => {
  test('kind=remove reinserts rows at original indices', () => {
    const DATA = [{ _id: 'a', link: 'a' }, { _id: 'c', link: 'c' }];
    const removedRow = { _id: 'b', link: 'b' };
    applyUndo(DATA, { kind: 'remove', items: [{ i: 1, row: removedRow }] });
    expect(DATA[1]._id).toBe('b');
    expect(DATA).toHaveLength(3);
  });

  test('kind=remove reinserts multiple rows in ascending index order', () => {
    const DATA = [{ _id: 'c', link: 'c' }];
    applyUndo(DATA, {
      kind: 'remove',
      items: [
        { i: 2, row: { _id: 'x', link: 'x' } },
        { i: 0, row: { _id: 'a', link: 'a' } },
      ],
    });
    expect(DATA[0]._id).toBe('a');
  });

  test('kind=edit restores previous field values', () => {
    const DATA = [{ _id: 'r1', status: 'broken', link: 'https://x.com' }];
    applyUndo(DATA, { kind: 'edit', id: 'r1', prev: { status: 'complete' } });
    expect(DATA[0].status).toBe('complete');
  });

  test('kind=edit is a no-op when id not found', () => {
    const DATA = [{ _id: 'r1', status: 'broken' }];
    expect(() => applyUndo(DATA, { kind: 'edit', id: 'missing', prev: { status: 'complete' } })).not.toThrow();
    expect(DATA[0].status).toBe('broken');
  });

  test('kind=fields restores fields for multiple rows', () => {
    const DATA = [
      { _id: 'r1', status: 'broken' },
      { _id: 'r2', status: 'lost' },
    ];
    applyUndo(DATA, {
      kind: 'fields',
      items: [
        { id: 'r1', prev: { status: 'complete' } },
        { id: 'r2', prev: { status: 'skip' } },
      ],
    });
    expect(DATA[0].status).toBe('complete');
    expect(DATA[1].status).toBe('skip');
  });

  test('kind=snapshot replaces entire DATA array', () => {
    const DATA = [{ _id: 'r1' }, { _id: 'r2' }];
    const snap = [{ _id: 'old1' }];
    applyUndo(DATA, { kind: 'snapshot', prev: snap });
    expect(DATA).toHaveLength(1);
    expect(DATA[0]._id).toBe('old1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyFilters
// ─────────────────────────────────────────────────────────────────────────────
describe('applyFilters — text search', () => {
  const makeRow = (overrides) => ({
    link: '', test: '', region: '', part: '', update: '', lastpage: '',
    status: 'blank', inputAt: 1000, _flag: null, _dup: false, ...overrides,
  });

  test('returns all rows when filters are empty', () => {
    const DATA = [makeRow({ link: 'https://a.com' }), makeRow({ link: 'https://b.com' })];
    expect(applyFilters(DATA, {})).toHaveLength(2);
  });

  test('q filter matches link field (case-insensitive)', () => {
    const DATA = [makeRow({ link: 'https://example.com' }), makeRow({ link: 'https://other.com' })];
    expect(applyFilters(DATA, { q: 'example' })).toHaveLength(1);
  });

  test('q filter matches region field', () => {
    const DATA = [makeRow({ region: 'ID' }), makeRow({ region: 'MY' })];
    expect(applyFilters(DATA, { q: 'id' })).toHaveLength(1);
  });

  test('q filter matches part field', () => {
    const DATA = [makeRow({ part: 'video' }), makeRow({ part: 'audio' })];
    expect(applyFilters(DATA, { q: 'vid' })).toHaveLength(1);
  });

  test('status filter matches label, not key', () => {
    const DATA = [makeRow({ status: 'complete' }), makeRow({ status: 'broken' })];
    expect(applyFilters(DATA, { status: 'Complete' })).toHaveLength(1);
  });

  test('region filter is case-sensitive exact match', () => {
    const DATA = [makeRow({ region: 'ID' }), makeRow({ region: 'MY' })];
    expect(applyFilters(DATA, { region: 'ID' })).toHaveLength(1);
    expect(applyFilters(DATA, { region: 'id' })).toHaveLength(0);
  });

  test('part filter exact match', () => {
    const DATA = [makeRow({ part: 'video' }), makeRow({ part: 'audio' })];
    expect(applyFilters(DATA, { part: 'video' })).toHaveLength(1);
  });

  test('updated filter keeps only rows with _flag set', () => {
    const DATA = [makeRow({ _flag: 'new' }), makeRow({ _flag: null })];
    expect(applyFilters(DATA, { updated: true })).toHaveLength(1);
  });

  test('dups filter keeps only _dup rows', () => {
    const DATA = [makeRow({ _dup: true }), makeRow({ _dup: false })];
    expect(applyFilters(DATA, { dups: true })).toHaveLength(1);
  });

  test('from/to date range filters by inputAt', () => {
    const DATA = [
      makeRow({ inputAt: new Date('2024-01-10').getTime() }),
      makeRow({ inputAt: new Date('2024-03-15').getTime() }),
      makeRow({ inputAt: new Date('2024-06-01').getTime() }),
    ];
    const result = applyFilters(DATA, { from: '2024-02-01', to: '2024-04-30' });
    expect(result).toHaveLength(1);
    expect(result[0].inputAt).toBe(new Date('2024-03-15').getTime());
  });

  test('multiple filters are ANDed together', () => {
    const DATA = [
      makeRow({ link: 'https://example.com', region: 'ID', status: 'complete' }),
      makeRow({ link: 'https://example.com', region: 'MY', status: 'complete' }),
      makeRow({ link: 'https://other.com', region: 'ID', status: 'broken' }),
    ];
    const result = applyFilters(DATA, { q: 'example', region: 'ID', status: 'Complete' });
    expect(result).toHaveLength(1);
    expect(result[0].region).toBe('ID');
  });
});

describe('applyFilters — sorting', () => {
  const makeRow = (link, status = 'blank', part = '', region = '', test = '', inputAt = 0) => ({
    link, status, part, region, test, inputAt,
    update: '', lastpage: '', _flag: null, _dup: false,
  });

  test('link-asc sorts links alphabetically ascending', () => {
    const DATA = [makeRow('z.com'), makeRow('a.com'), makeRow('m.com')];
    const result = applyFilters(DATA, { sort: 'link-asc' });
    expect(result.map(r => r.link)).toEqual(['a.com', 'm.com', 'z.com']);
  });

  test('link-desc sorts links alphabetically descending', () => {
    const DATA = [makeRow('a.com'), makeRow('z.com'), makeRow('m.com')];
    const result = applyFilters(DATA, { sort: 'link-desc' });
    expect(result.map(r => r.link)).toEqual(['z.com', 'm.com', 'a.com']);
  });

  test('date-desc sorts newest first', () => {
    const DATA = [makeRow('a.com', 'blank', '', '', '', 100), makeRow('b.com', 'blank', '', '', '', 300), makeRow('c.com', 'blank', '', '', '', 200)];
    const result = applyFilters(DATA, { sort: 'date-desc' });
    expect(result.map(r => r.inputAt)).toEqual([300, 200, 100]);
  });

  test('date-asc sorts oldest first', () => {
    const DATA = [makeRow('a.com', 'blank', '', '', '', 300), makeRow('b.com', 'blank', '', '', '', 100)];
    const result = applyFilters(DATA, { sort: 'date-asc' });
    expect(result.map(r => r.inputAt)).toEqual([100, 300]);
  });

  test('status-asc sorts by status key ascending', () => {
    const DATA = [makeRow('c', 'skip'), makeRow('a', 'broken'), makeRow('b', 'complete')];
    const result = applyFilters(DATA, { sort: 'status-asc' });
    expect(result.map(r => r.status)).toEqual(['broken', 'complete', 'skip']);
  });

  test('status-desc sorts by status key descending', () => {
    const DATA = [makeRow('a', 'broken'), makeRow('b', 'complete'), makeRow('c', 'skip')];
    const result = applyFilters(DATA, { sort: 'status-desc' });
    expect(result.map(r => r.status)).toEqual(['skip', 'complete', 'broken']);
  });

  test('part-asc sorts by part ascending', () => {
    const DATA = [makeRow('a', 'blank', 'video'), makeRow('b', 'blank', 'audio'), makeRow('c', 'blank', 'image')];
    const result = applyFilters(DATA, { sort: 'part-asc' });
    expect(result.map(r => r.part)).toEqual(['audio', 'image', 'video']);
  });

  test('part-desc sorts by part descending', () => {
    const DATA = [makeRow('a', 'blank', 'audio'), makeRow('b', 'blank', 'video')];
    const result = applyFilters(DATA, { sort: 'part-desc' });
    expect(result.map(r => r.part)).toEqual(['video', 'audio']);
  });

  test('region-asc sorts by region ascending', () => {
    const DATA = [makeRow('a', 'blank', '', 'MY'), makeRow('b', 'blank', '', 'ID')];
    const result = applyFilters(DATA, { sort: 'region-asc' });
    expect(result.map(r => r.region)).toEqual(['ID', 'MY']);
  });

  test('region-desc sorts by region descending', () => {
    const DATA = [makeRow('a', 'blank', '', 'ID'), makeRow('b', 'blank', '', 'MY')];
    const result = applyFilters(DATA, { sort: 'region-desc' });
    expect(result.map(r => r.region)).toEqual(['MY', 'ID']);
  });

  test('test-asc sorts by test ascending', () => {
    const DATA = [makeRow('a', 'blank', '', '', 'z'), makeRow('b', 'blank', '', '', 'a')];
    const result = applyFilters(DATA, { sort: 'test-asc' });
    expect(result.map(r => r.test)).toEqual(['a', 'z']);
  });

  test('test-desc sorts by test descending', () => {
    const DATA = [makeRow('a', 'blank', '', '', 'a'), makeRow('b', 'blank', '', '', 'z')];
    const result = applyFilters(DATA, { sort: 'test-desc' });
    expect(result.map(r => r.test)).toEqual(['z', 'a']);
  });

  test('unknown sort key leaves order unchanged', () => {
    const DATA = [makeRow('z.com'), makeRow('a.com')];
    const result = applyFilters(DATA, { sort: 'bogus-sort' });
    expect(result.map(r => r.link)).toEqual(['z.com', 'a.com']);
  });

  test('applyFilters does not mutate the original DATA array order', () => {
    const DATA = [makeRow('z.com'), makeRow('a.com')];
    applyFilters(DATA, { sort: 'link-asc' });
    expect(DATA[0].link).toBe('z.com'); // original unchanged
  });
});
