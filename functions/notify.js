/* 予定表の変更内容を文章にする（Firebaseに依存しない部分。テストしやすいよう分けている） */
const zp = n => String(n).padStart(2, '0');
function md(s) { // '2026-11-25' -> '11/25'
  const m = String(s || '').match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
  return m ? `${+m[2]}/${+m[3]}` : String(s || '');
}
function list(v) { if (!v) return []; return Array.isArray(v) ? v.filter(Boolean) : Object.values(v).filter(Boolean); }
function pcs(p) { return list(p.pcdates).length ? list(p.pcdates).map(String).sort() : (p.pcdate ? [String(p.pcdate)] : []); }
function props(data) { const m = new Map(); list(data && data.properties).forEach(p => { if (p && p.id != null) m.set(String(p.id), p); }); return m; }
function datesText(p) {
  const a = [];
  const pc = pcs(p);
  if (pc.length) a.push('PC着 ' + pc.map(md).join('・'));
  if (p.dodai) a.push('土台 ' + md(p.dodai));
  if (p.joto) a.push('上棟 ' + md(p.joto));
  return a.join(' / ');
}
const FIELDS = [
  ['pc', p => pcs(p).map(md).join('・') || '未定', 'PC着'],
  ['dodai', p => p.dodai ? md(p.dodai) : '未定', '土台'],
  ['joto', p => p.joto ? md(p.joto) : '未定', '上棟'],
  ['factory', p => p.pcFactory || '未設定', 'PC工場'],
  ['name', p => p.name || '', '物件名'],
];
/* before/after の schedule データから、通知する行の一覧を作る */
function diffLines(before, after) {
  const b = props(before), a = props(after), lines = [];
  for (const [id, p] of a) {
    const o = b.get(id);
    if (!o) { lines.push({ id, kind: '新規', text: `【新規】${p.name || '(名称なし)'}${datesText(p) ? '（' + datesText(p) + '）' : ''}` }); continue; }
    const ch = [];
    for (const [, f, label] of FIELDS) { const x = f(o), y = f(p); if (x !== y) ch.push(`${label} ${x}→${y}`); }
    if (ch.length) lines.push({ id, kind: '変更', text: `【変更】${p.name || o.name || '(名称なし)'}：${ch.join('、')}` });
  }
  for (const [id, o] of b) if (!a.has(id)) lines.push({ id, kind: '削除', text: `【削除】${o.name || '(名称なし)'}` });
  return lines;
}
/* 同じ物件の行が複数たまったら、最初の状態と最後の状態から1行にまとめ直す */
function summarize(items) {
  const byId = new Map();
  for (const it of items) {
    const cur = byId.get(it.id);
    if (!cur) byId.set(it.id, { first: it.before, last: it.after });
    else cur.last = it.after;
  }
  const lines = [];
  for (const [id, { first, last }] of byId) {
    const b = first ? { properties: [first] } : { properties: [] };
    const a = last ? { properties: [last] } : { properties: [] };
    diffLines(b, a).forEach(l => lines.push(l.text));
  }
  return lines;
}
module.exports = { diffLines, summarize, md, props };
