/* 予定表の変更内容を文章にする（Firebaseに依存しない部分。テストしやすいよう分けている） */
const zp = n => String(n).padStart(2, '0');
function md(s) { // '2026-11-25' -> '11/25'
  const m = String(s || '').match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
  return m ? `${+m[2]}/${+m[3]}` : String(s || '');
}
function list(v) { if (!v) return []; return Array.isArray(v) ? v.filter(Boolean) : Object.values(v).filter(Boolean); }
function pcs(p) { return list(p.pcdates).length ? list(p.pcdates).map(String).sort() : (p.pcdate ? [String(p.pcdate)] : []); }
function props(data) { const m = new Map(); list(data && data.properties).forEach(p => { if (p && p.id != null) m.set(String(p.id), p); }); return m; }
/* 1行の形：【新規】工務店名・物件名：PC着M/D・土台M/D・上棟M/D */
function lineText(kind, p) {
  const pc = pcs(p);
  const head = [p.makerName, p.name || '(名称なし)'].filter(Boolean).join('・');
  const dates = [
    'PC着' + (pc.length ? pc.map(md).join('、') : '未定'),
    '土台' + (p.dodai ? md(p.dodai) : '未定'),
    '上棟' + (p.joto ? md(p.joto) : '未定'),
  ].join('・');
  return `【${kind}】${head}：${dates}`;
}
/* 通知のきっかけにする項目（PC着・土台・上棟・物件名・工務店名） */
/* 日付は書き方（2026/12/1 と 2026-12-01 など）の違いを無視して比べる */
function nd(s) { const m = String(s || '').match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/); return m ? `${m[1]}-${zp(m[2])}-${zp(m[3])}` : String(s || '').trim(); }
const KEYS = p => JSON.stringify([pcs(p).map(nd).sort(), nd(p.dodai), nd(p.joto), String(p.name || '').trim(), String(p.makerName || '').trim()]);
/* before/after の schedule データから、通知する行の一覧を作る（削除は通知しない） */
function diffLines(before, after) {
  const b = props(before), a = props(after), lines = [];
  for (const [id, p] of a) {
    const o = b.get(id);
    if (!o) { lines.push({ id, kind: '新規', text: lineText('新規', p) }); continue; }
    if (KEYS(o) !== KEYS(p)) lines.push({ id, kind: '変更', text: lineText('変更', p) });
  }
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
