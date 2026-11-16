import { db } from 'sdk';
import { and, eq, desc } from 'sdk/db';
import { chats, pending } from '../schema.js';
import { esc } from './util.js';

export const MAX_WELCOME = 500;

export function listChats(ownerId) {
  return db.select().from(chats)
    .where(and(eq(chats.ownerId, ownerId), eq(chats.active, true)))
    .orderBy(desc(chats.created))
    .limit(25)
    .all();
}

// A chat row, but only if this user manages it.
export async function getOwned(chatId, userId) {
  if (!Number.isFinite(chatId)) return null;
  const r = await db.select().from(chats).where(eq(chats.chatId, chatId)).get();
  return r && r.active && r.ownerId === userId ? r : null;
}

export async function chatsScreen(ownerId) {
  const rows = await listChats(ownerId);
  if (!rows.length) {
    return {
      text: '📭 <b>No channels or groups yet.</b>\n\nAdd me as an administrator (with the <b>Invite Users via Link</b> permission) and it will show up here.',
    };
  }
  const total = rows.reduce((a, r) => a + (r.approved || 0), 0);
  return {
    text: `⚙️ <b>Your chats</b> — ${rows.length} connected, <b>${total}</b> requests approved.\n\nTap a chat to manage it.`,
    reply_markup: {
      inline_keyboard: rows.map((r) => [{
        text: `${r.enabled ? '🟢' : '🔴'} ${r.title || r.chatId}`.slice(0, 60),
        callback_data: `v:${r.chatId}`,
      }]),
    },
  };
}

export async function chatScreen(chatId, ownerId) {
  const r = await getOwned(chatId, ownerId);
  if (!r) return null;
  const queued = await db.$count(pending, eq(pending.chatId, r.chatId));
  const last = r.lastApproved ? r.lastApproved.toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—';

  const keyboard = [
    [{ text: r.enabled ? '⏸ Turn auto-approve OFF' : '▶️ Turn auto-approve ON', callback_data: `t:${r.chatId}` }],
    [{ text: r.welcome ? '🔕 Disable welcome DM' : '🔔 Enable welcome DM', callback_data: `w:${r.chatId}` }],
    [
      { text: '✏️ Welcome text', callback_data: `e:${r.chatId}` },
      ...(r.welcomeText ? [{ text: '🗑 Reset text', callback_data: `r:${r.chatId}` }] : []),
    ],
    [{ text: '🔗 New request-to-join link', callback_data: `l:${r.chatId}` }],
  ];
  if (queued) keyboard.push([{ text: `✅ Approve queued (${queued})`, callback_data: `p:${r.chatId}` }]);
  keyboard.push([{ text: '⬅️ Back', callback_data: 's' }]);

  return {
    text:
      `<b>${esc(r.title || r.chatId)}</b>\n` +
      `Type: ${esc(r.type || '—')}\n` +
      `Approved so far: <b>${r.approved}</b>\n` +
      `Last approval: ${last}\n` +
      (queued ? `Queued (rate-limited): <b>${queued}</b>\n` : '') +
      `\nAuto-approve: ${r.enabled ? '🟢 ON' : '🔴 OFF'}\n` +
      `Welcome DM: ${r.welcome ? '🟢 ON' : '🔴 OFF'}${r.welcomeText ? ' (custom text)' : ''}`,
    reply_markup: { inline_keyboard: keyboard },
  };
}
