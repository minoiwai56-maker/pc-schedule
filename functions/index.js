/* PC搬入予定表：物件の新規・予定変更をDiscordに通知する
   - 予定表が保存されるたびに変更点を「通知待ち」にためる
   - 1分ごとに確認し、最後の変更から1分以上たっていたら、まとめて1回投稿する */
const { onValueWritten } = require('firebase-functions/v2/database');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { props } = require('./notify');
const { summarize } = require('./notify');
admin.initializeApp();
const WEBHOOK = defineSecret('DISCORD_WEBHOOK_URL');
const REGION = 'asia-southeast1';          // データベースと同じ地域
const INSTANCE = 'pc-schedule-default-rtdb';
const QUIET_MS = 60 * 1000;                // 最後の変更から1分たったら送る

exports.queueScheduleChanges = onValueWritten(
  { ref: '/schedule', region: REGION, instance: INSTANCE },
  async (event) => {
    const before = event.data.before.val() || {};
    const after = event.data.after.val() || {};
    const b = props(before), a = props(after);
    const by = (after.meta && after.meta.by) || '';
    const now = Date.now();
    const updates = {};
    const ids = new Set([...b.keys(), ...a.keys()]);
    for (const id of ids) {
      const o = b.get(id) || null, p = a.get(id) || null;
      if (JSON.stringify(o) === JSON.stringify(p)) continue;
      const key = admin.database().ref('notifyQueue/items').push().key;
      updates['notifyQueue/items/' + key] = { id, before: o, after: p, at: now, by };
    }
    if (!Object.keys(updates).length) return;
    updates['notifyQueue/lastAt'] = now;
    await admin.database().ref().update(updates);
  });

exports.flushScheduleNotify = onSchedule(
  { schedule: 'every 1 minutes', region: 'asia-northeast1', timeZone: 'Asia/Tokyo', secrets: [WEBHOOK] },
  async () => {
    const ref = admin.database().ref('notifyQueue');
    const snap = await ref.once('value');
    const q = snap.val();
    if (!q || !q.items) return;
    if (Date.now() - (q.lastAt || 0) < QUIET_MS) return; // まだ編集中
    const entries = Object.entries(q.items).sort((x, y) => x[1].at - y[1].at);
    const lines = summarize(entries.map(([, v]) => v));
    if (lines.length) {
      let body = `📅 **PC搬入予定表が更新されました**\n` + lines.join('\n');
      if (body.length > 1900) body = body.slice(0, 1900) + '\n…ほか';
      const res = await fetch(WEBHOOK.value(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: body }) });
      if (!res.ok) throw new Error('Discord投稿失敗 HTTP ' + res.status); // 失敗したら消さずに次回再送
    }
    const del = {};
    entries.forEach(([k]) => { del['items/' + k] = null; });
    await ref.update(del);
  });

/* ===== PC担当へのアラートメール（金物の発注確認・最終確認）===== */
const nodemailer = require('nodemailer');
const { buildMails, shouldSend, iso } = require('./mail');
const GMAIL_PASS = defineSecret('GMAIL_APP_PASSWORD');
const MAIL_FROM = 'minoiwai56@gmail.com';
let _hol = { at: 0, v: {} };
async function holidays() { /* 祝日（6時間キャッシュ。取れなければ前回の値） */
  if (Date.now() - _hol.at < 6 * 3600e3 && _hol.at) return _hol.v;
  try { const r = await fetch('https://holidays-jp.github.io/api/v1/date.json'); if (r.ok) _hol = { at: Date.now(), v: await r.json() }; }
  catch (e) { console.warn('holidays fetch failed', e); }
  return _hol.v;
}
function jstNow() { const n = new Date(Date.now() + 9 * 3600e3); return new Date(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), n.getUTCHours(), n.getUTCMinutes()); }
async function sendAll(mails) {
  const tr = nodemailer.createTransport({ service: 'gmail', auth: { user: MAIL_FROM, pass: GMAIL_PASS.value().replace(/\s/g, '') } });
  for (const m of mails) await tr.sendMail({ from: `PC搬入予定表 <${MAIL_FROM}>`, to: m.to, subject: m.subject, text: m.body });
}
async function writeStatus(ok, msg) {
  await admin.database().ref('schedule/mailStatus').set({ at: Date.now(), ok, msg: String(msg).slice(0, 200) });
}

exports.sendAlertMails = onSchedule(
  { schedule: 'every 10 minutes', region: 'asia-northeast1', timeZone: 'Asia/Tokyo', secrets: [GMAIL_PASS] },
  async () => {
    const data = (await admin.database().ref('schedule').once('value')).val() || {};
    const stRef = admin.database().ref('notifyState/mailSent');
    const sent = (await stRef.once('value')).val() || {};
    const now = jstNow(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate()), hol = await holidays();
    for (const kind of ['hw', 'fc']) {
      if (!shouldSend(kind, data, now, hol, sent[kind])) continue;
      const mails = buildMails(data, kind, today, hol);
      try {
        await sendAll(mails);
        await stRef.child(kind).set(iso(today)); /* 送れたら今日は送信済み（失敗なら10分後に再送） */
        if (mails.length) await writeStatus(true, `${kind === 'hw' ? '金物' : '最終確認'}：` + mails.map(m => `${m.name} ${m.count}件`).join('・'));
      } catch (e) { console.error(e); await writeStatus(false, e.message); }
    }
  });

/* 設定画面の「テストメールを送る」 */
exports.sendTestMail = onValueWritten(
  { ref: '/schedule/mailTestAt', region: REGION, instance: INSTANCE, secrets: [GMAIL_PASS] },
  async (event) => {
    if (!event.data.after.exists() || event.data.after.val() === event.data.before.val()) return; /* 値が変わったときだけ */
    const data = (await admin.database().ref('schedule').once('value')).val() || {};
    const now = jstNow(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate()), hol = await holidays();
    const mails = [...buildMails(data, 'hw', today, hol, { test: true }), ...buildMails(data, 'fc', today, hol, { test: true })];
    try { await sendAll(mails); await writeStatus(true, 'テスト送信：' + [...new Set(mails.map(m => m.name))].join('・')); }
    catch (e) { console.error(e); await writeStatus(false, 'テスト送信失敗：' + e.message); }
  });
