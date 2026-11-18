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
