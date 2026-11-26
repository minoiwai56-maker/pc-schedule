/* PC担当へのアラートメール（判定は予定表アプリの画面と同じ）。Firebaseに依存しない部分 */
const zp = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${zp(d.getMonth() + 1)}-${zp(d.getDate())}`;
function toDate(s) { const m = String(s || '').match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
const md = s => { const d = toDate(s); return d ? `${d.getMonth() + 1}/${d.getDate()}` : ''; };
const DOW = '日月火水木金土';
const list = v => !v ? [] : (Array.isArray(v) ? v : Object.values(v)).filter(Boolean);
const ALERT_DEFAULT = { fc: { on: true, days: 14, unit: 'cal' }, hw: { on: true, days: 3, unit: 'biz' }, off: { sun: true, sat: true, hol: true, long: true } };
const MAIL_DEFAULT = { hw: { on: true, time: '08:00', skipOff: true }, fc: { on: true, dow: 4, time: '08:00', skipOff: true },
  to: [{ name: '泉', email: 'minoiwai56@gmail.com' }, { name: '安松', email: 'yasumatsu@m-iwai.com' }] };
function deep(def, cur) {
  if (Array.isArray(def)) return Array.isArray(cur) ? cur : (cur && typeof cur === 'object' ? Object.values(cur) : JSON.parse(JSON.stringify(def)));
  const o = {}; for (const k in def) o[k] = (def[k] && typeof def[k] === 'object') ? deep(def[k], cur && cur[k]) : ((cur && cur[k] !== undefined) ? cur[k] : def[k]); return o;
}
function makeCtx(data, holidays) {
  const cfg = deep(ALERT_DEFAULT, data.alertCfg);
  const longs = list(data.holidays).map(h => ({ s: String(h.start || ''), e: String(h.end || '') }));
  const isOff = d => { const w = d.getDay(), s = iso(d), o = cfg.off;
    return (o.sun && w === 0) || (o.sat && w === 6) || (o.hol && !!holidays[s]) || (o.long && longs.some(h => h.s && h.e && s >= h.s && s <= h.e)); };
  return { cfg, isOff };
}
function countDays(a, b, unit, ctx) { if (unit !== 'biz') return Math.round((b - a) / 86400000); let n = 0; const d = new Date(a); while (d < b) { d.setDate(d.getDate() + 1); if (!ctx.isOff(d)) n++; } return n; }
function daysBefore(pc, n, unit, ctx) { const d = new Date(pc); if (unit !== 'biz') { d.setDate(d.getDate() - n); return d; } let c = 0; while (c < n) { d.setDate(d.getDate() - 1); if (!ctx.isOff(d)) c++; } return d; }
const pcsOf = p => (list(p.pcdates).length ? list(p.pcdates) : (p.pcdate ? [p.pcdate] : [])).map(String).filter(Boolean).sort();
function propAlerts(p, today, ctx) {
  const out = [], t = iso(today), cfg = ctx.cfg;
  const pcAll = pcsOf(p);
  if (pcAll.length && pcAll[pcAll.length - 1] < t) return out; /* PC着日が過ぎた物件は出さない */
  if (cfg.fc.on) {
    if (!p.finalCheck) out.push({ type: 'fc', blank: true });
    else { const fd = toDate(p.finalCheck); if (fd) { const n = countDays(fd, today, cfg.fc.unit, ctx); if (n >= cfg.fc.days) out.push({ type: 'fc', days: n }); } }
  }
  if (cfg.hw.on && !p.hwOrdered) {
    const pcs = pcsOf(p);
    if (pcs.length && pcs[0] >= t) { const pc = toDate(pcs[0]); if (today >= daysBefore(pc, cfg.hw.days, cfg.hw.unit, ctx)) out.push({ type: 'hw', pc: pcs[0], left: countDays(today, pc, cfg.hw.unit, ctx) }); }
  }
  return out;
}
/* PC担当ごとのメール（kind: 'hw' | 'fc'）を作る */
function buildMails(data, kind, today, holidays, opts = {}) {
  const ctx = makeCtx(data, holidays), mc = deep(MAIL_DEFAULT, data.mailCfg), unitTxt = u => u === 'biz' ? '営業日' : '日';
  const mails = [];
  for (const to of list(mc.to)) {
    if (!to.email) continue;
    const mine = list(data.properties).filter(p => p && String(p.pc || '') === String(to.name));
    const lines = [];
    for (const p of mine) for (const a of propAlerts(p, today, ctx)) {
      if (a.type !== kind) continue;
      const head = [p.makerName, p.name || '(名称なし)'].filter(Boolean).join('・');
      if (kind === 'hw') lines.push(`・${head}：PC着 ${md(a.pc)}（${DOW[toDate(a.pc).getDay()]}）${a.left > 0 ? 'まであと' + a.left + unitTxt(ctx.cfg.hw.unit) : '本日'}`);
      else lines.push(`・${head}：${a.blank ? '最終確認日が空欄です' : '最終確認 ' + md(p.finalCheck) + '（' + a.days + unitTxt(ctx.cfg.fc.unit) + '経過）'}`);
    }
    if (!lines.length && !opts.test) continue;
    const title = kind === 'hw' ? '金物の発注確認' : '最終確認';
    const subject = `${opts.test ? '【テスト】' : ''}【PC搬入予定表】${title} ${lines.length}件（${md(iso(today))}）`;
    const body = `${to.name}さん\n\n■ ${title}${kind === 'hw' ? '（金物を発注しましたか？）' : '（工務店に日程を再確認してください）'}\n` +
      (lines.length ? lines.join('\n') : '・該当はありません') +
      `\n\n${kind === 'hw' ? '発注済みの物件は、予定表の「要確認」で「発注済み」を押してください。' : '確認したら、予定表の「要確認」で「今日確認した」を押すか、最終確認日を更新してください。'}\n予定表：https://minoiwai56-maker.github.io/pc-schedule/\n\n※このメールは自動送信です。`;
    mails.push({ to: to.email, name: to.name, subject, body, count: lines.length });
  }
  return mails;
}
/* 今この時刻に送るべきか（日本時間で判定） */
function shouldSend(kind, data, nowJst, holidays, lastSent) {
  const mc = deep(MAIL_DEFAULT, data.mailCfg)[kind], ctx = makeCtx(data, holidays);
  const today = new Date(nowJst.getFullYear(), nowJst.getMonth(), nowJst.getDate());
  if (!mc.on) return false;
  if (lastSent === iso(today)) return false;
  if (kind === 'fc' && today.getDay() !== Number(mc.dow)) return false;
  if (mc.skipOff && ctx.isOff(today)) return false;
  const hm = `${zp(nowJst.getHours())}:${zp(nowJst.getMinutes())}`;
  return hm >= mc.time;
}
module.exports = { buildMails, shouldSend, iso, propAlerts, makeCtx };
