// Pure utility functions extracted from index.html for testability.
// These have no DOM or browser-API dependencies.

const STATUS = {
  complete:   { label: 'Complete',     color: 'green'  },
  uncomplete: { label: 'Uncomplete',   color: 'amber'  },
  lost:       { label: 'Lost File',    color: 'orange' },
  skip:       { label: 'Skip',         color: 'gray'   },
  broken:     { label: 'Broken Link',  color: 'red'    },
  blank:      { label: 'Blank',        color: 'blank'  },
};

// ---- status canonicalization ----
function canonStatus(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (!s) return 'blank';
  if (STATUS[s]) return s;
  if (s.includes('uncomplete') || s.includes('incomplete') || s.includes('belum')) return 'uncomplete';
  if (s.includes('lost') || s.includes('hilang')) return 'lost';
  if (s.includes('broken') || s.includes('rusak') || s.includes('mati')) return 'broken';
  if (s.includes('skip') || s.includes('lewat')) return 'skip';
  if (s.includes('blank') || s.includes('kosong')) return 'blank';
  if (s.includes('complete') || s.includes('selesai') || s === 'ok' || s === 'done') return 'complete';
  return 'blank';
}

// ---- header normalization & mapping ----
function normH(h) {
  return String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const FIELD_ALIASES = {
  name:     ['name', 'no', 'nomor', 'index', 'idx', 'id'],
  link:     ['link', 'url', 'tautan', 'linkurl', 'downloadlink'],
  test:     ['test', 'tes', 'tested', 'check'],
  status:   ['status', 'state', 'keterangan'],
  part:     ['linkpart', 'part', 'type', 'jenis', 'tipe'],
  date:     ['date', 'tanggal', 'tgl'],
  region:   ['region', 'wilayah', 'negara', 'country', 'area'],
  update:   ['update', 'updated', 'pembaruan'],
  lastpage: ['lastpage', 'page', 'halaman', 'lastpg'],
  active:   ['active', 'aktif', 'status2'],
};

function buildMap(headers) {
  const map = {};
  headers.forEach((h, i) => {
    const n = normH(h);
    for (const f in FIELD_ALIASES) {
      if (FIELD_ALIASES[f].includes(n)) {
        if (map[f] === undefined) map[f] = i;
      }
    }
  });
  return map;
}

// ---- URL / link utilities ----
function normalizeLink(l) {
  let s = String(l || '').trim();
  // strip invisible/control/zero-width chars
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u001F\u007F-\u009F\u00A0\u200B-\u200F\u2028\u2029\uFEFF]/g, '');
  s = s.toLowerCase();
  s = s.replace(/^https?:\/\//, '');
  s = s.replace(/^www\./, '');
  s = s.replace(/\?.*$/, '');
  s = s.replace(/#.*/, '');
  s = s.replace(/\/+$/, '');
  return s;
}

const URL_RE = /((?:https?:\/\/|www\.)[^\s<>"']+|[a-z0-9][a-z0-9-]*(?:\.[a-z]{2,})+(?:\/[^\s<>"']*)?)/gi;

function toHref(u) {
  return /^https?:\/\//i.test(u) ? u : 'https://' + u.replace(/^\/+/, '');
}

function extractUrl(text) {
  const s = String(text || '');
  const h = s.match(/=HYPERLINK\(\s*["']([^"']+)["']/i);
  if (h) return h[1];
  const m = s.match(URL_RE);
  return m ? m[0] : '';
}

function esc(s) {
  return String(s == null ? '' : s).replace(
    /[&<>"]/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  );
}

function linkify(text) {
  const s = String(text == null ? '' : text);
  if (!s) return '<span class="mono">—</span>';
  let out = '', last = 0, m;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(s))) {
    out += esc(s.slice(last, m.index));
    const u = m[0];
    out += `<a href="${esc(toHref(u))}" target="_blank" rel="noopener">${esc(u)}</a>`;
    last = m.index + u.length;
  }
  out += esc(s.slice(last));
  return out || '<span class="mono">—</span>';
}

// ---- record building ----
function buildRecord(o) {
  const st = canonStatus(o.status);
  return {
    link:      String(o.link     || '').trim(),
    test:      String(o.test     || '').trim(),
    status:    st,
    part:      String(o.part     || '').trim(),
    date:      String(o.date     || '').trim(),
    region:    String(o.region   || '').trim().toUpperCase(),
    update:    String(o.update   || '').trim(),
    lastpage:  String(o.lastpage || '').trim(),
    active:    String(o.active   || '').trim(),
    updatedAt: Date.now(),
    inputAt:   Date.now(),
    _flag:     null,
    _id:       'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
  };
}

function rowsFromMatrix(matrix) {
  if (!matrix.length) return [];
  let hIdx = 0;
  for (let i = 0; i < Math.min(matrix.length, 5); i++) {
    const m = buildMap(matrix[i]);
    if (Object.keys(m).length >= 2) { hIdx = i; break; }
  }
  const headers = matrix[hIdx];
  const map = buildMap(headers);
  const hasLink = map.link !== undefined;
  const out = [];
  for (let i = hIdx + 1; i < matrix.length; i++) {
    const r = matrix[i]; if (!r || !r.length) continue;
    const get = k => map[k] !== undefined ? r[map[k]] : '';
    let link = hasLink ? get('link') : (r.find(c => String(c || '').includes('/')) || r[0] || '');
    link = String(link || '').trim();
    const u = extractUrl(link); if (u) link = u;
    if (!link && !get('name')) continue;
    out.push(buildRecord({
      name: get('name'), link, test: get('test'), status: get('status'),
      part: get('part'), date: get('date'), region: get('region'),
      update: get('update'), lastpage: get('lastpage'), active: get('active'),
    }));
  }
  return out;
}

// ---- duplicate detection ----
function markDuplicates(DATA) {
  const seen = new Map(); let dup = 0;
  for (const r of DATA) { r._dup = false; r._dupKeep = false; }
  for (const r of DATA) {
    const k = normalizeLink(r.link); if (!k) continue;
    if (seen.has(k)) { r._dup = true; dup++; seen.get(k)._dupKeep = true; }
    else seen.set(k, r);
  }
  return dup;
}

// ---- chunked storage helpers ----
const SAVE_BYTES = 3500000;

function stripRow(r) {
  return {
    link: r.link, test: r.test, status: r.status, part: r.part, date: r.date,
    region: r.region, update: r.update, lastpage: r.lastpage, active: r.active,
    _id: r._id, inputAt: r.inputAt, updatedAt: r.updatedAt,
    _statusLocked: r._statusLocked ? 1 : undefined,
  };
}

function buildChunks(DATA) {
  const chunks = []; let cur = [], bytes = 0;
  for (const r of DATA) {
    const s = stripRow(r); const sz = JSON.stringify(s).length + 1;
    if (cur.length && bytes + sz > SAVE_BYTES) { chunks.push(cur); cur = []; bytes = 0; }
    cur.push(s); bytes += sz;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

// ---- KPI computation ----
function computeKPI(DATA) {
  const k = { total: DATA.length, complete: 0, uncomplete: 0, lost: 0, skip: 0, broken: 0, blank: 0 };
  DATA.forEach(r => { k[r.status] = (k[r.status] || 0) + 1; });
  return k;
}

// ---- import rows ----
function importRows(DATA, rows, mode) {
  let added = 0, updated = 0;
  DATA.forEach(r => { r._flag = null; });

  // deduplicate within source first
  const srcSeen = new Map(); let srcDups = 0;
  const deduped = [];
  rows.forEach(r => {
    const k = normalizeLink(r.link);
    if (k && srcSeen.has(k)) { srcDups++; }
    else { if (k) srcSeen.set(k, true); deduped.push(r); }
  });
  rows = deduped;

  if (mode === 'replace') {
    DATA.length = 0;
    rows.forEach(r => DATA.push({ ...r, _flag: 'new' }));
    added = rows.length;
  } else if (mode === 'append') {
    rows.forEach(r => { DATA.push({ ...r, _flag: 'new' }); added++; });
  } else { // merge
    const idx = new Map();
    DATA.forEach((r, i) => { const k = normalizeLink(r.link); if (k) idx.set(k, i); });
    rows.forEach(r => {
      const k = normalizeLink(r.link);
      if (k && idx.has(k)) {
        const i = idx.get(k);
        const ex = DATA[i];
        const newStatus = (!r.status || r.status === 'blank') ? ex.status : (ex._statusLocked ? ex.status : r.status);
        DATA[i] = { ...ex, ...r, link: ex.link, status: newStatus, _statusLocked: ex._statusLocked, inputAt: ex.inputAt, _flag: 'upd', updatedAt: Date.now() };
        updated++;
      } else {
        DATA.push({ ...r, _flag: 'new' });
        if (k) idx.set(k, DATA.length - 1);
        added++;
      }
    });
  }
  return { added, updated, srcDups };
}

// ---- undo stack ----
const UNDO_MAX = 25;

function createUndoStack() {
  const stack = [];
  return {
    push(entry) {
      stack.push(entry);
      if (stack.length > UNDO_MAX) stack.shift();
    },
    pop() { return stack.pop(); },
    get length() { return stack.length; },
  };
}

function applyUndo(DATA, entry) {
  if (entry.kind === 'remove') {
    entry.items.slice().sort((a, b) => a.i - b.i).forEach(it => {
      DATA.splice(Math.min(it.i, DATA.length), 0, it.row);
    });
  } else if (entry.kind === 'edit') {
    const r = DATA.find(x => x._id === entry.id);
    if (r) Object.assign(r, entry.prev);
  } else if (entry.kind === 'fields') {
    entry.items.forEach(it => {
      const r = DATA.find(x => x._id === it.id);
      if (r) Object.assign(r, it.prev);
    });
  } else if (entry.kind === 'snapshot') {
    DATA.length = 0;
    entry.prev.forEach(r => DATA.push(r));
  }
}

// ---- filtering & sorting ----
function applyFilters(DATA, filters) {
  const q = (filters.q || '').toLowerCase();
  const from = filters.from ? new Date(filters.from + 'T00:00:00').getTime() : null;
  const to   = filters.to   ? new Date(filters.to   + 'T23:59:59').getTime() : null;

  let view = DATA.filter(r => {
    if (q && !([r.link, r.test, r.region, r.part, r.update, r.lastpage]
      .some(f => (f || '').toLowerCase().includes(q)))) return false;
    if (filters.status && STATUS[r.status] && STATUS[r.status].label !== filters.status) return false;
    if (filters.region && r.region !== filters.region) return false;
    if (filters.part && r.part !== filters.part) return false;
    if (filters.updated && !r._flag) return false;
    if (filters.dups && !r._dup) return false;
    if (from && (r.inputAt || 0) < from) return false;
    if (to && (r.inputAt || 0) > to) return false;
    return true;
  });

  switch (filters.sort) {
    case 'link-asc':    view.sort((a, b) => a.link.localeCompare(b.link)); break;
    case 'link-desc':   view.sort((a, b) => b.link.localeCompare(a.link)); break;
    case 'date-desc':   view.sort((a, b) => (b.inputAt || 0) - (a.inputAt || 0)); break;
    case 'date-asc':    view.sort((a, b) => (a.inputAt || 0) - (b.inputAt || 0)); break;
    case 'status-asc':  view.sort((a, b) => (a.status || '').localeCompare(b.status || '')); break;
    case 'status-desc': view.sort((a, b) => (b.status || '').localeCompare(a.status || '')); break;
    case 'part-asc':    view.sort((a, b) => (a.part || '').localeCompare(b.part || '')); break;
    case 'part-desc':   view.sort((a, b) => (b.part || '').localeCompare(a.part || '')); break;
    case 'region-asc':  view.sort((a, b) => (a.region || '').localeCompare(b.region || '')); break;
    case 'region-desc': view.sort((a, b) => (b.region || '').localeCompare(a.region || '')); break;
    case 'test-asc':    view.sort((a, b) => (a.test || '').localeCompare(b.test || '')); break;
    case 'test-desc':   view.sort((a, b) => (b.test || '').localeCompare(a.test || '')); break;
  }

  return view;
}

module.exports = {
  STATUS,
  canonStatus,
  normH,
  buildMap,
  FIELD_ALIASES,
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
  SAVE_BYTES,
  UNDO_MAX,
};
