import { api, db, BotApiError } from 'sdk';
import { eq, asc, sql } from 'sdk/db';
import { chats, pending } from '../schema.js';
import { esc, safe } from './util.js';

/**
 * Approve one request and classify the outcome:
 *  ok       – approved
 *  gone     – already a member / request withdrawn / handled by someone else
 *  retry    – flood limit or transient error (wait = suggested seconds)
 *  norights – bot lost the "Invite Users" right or was removed
 */
export async function approveOne(chatId, userId) {
  try {
    await api.approveChatJoinRequest({ chat_id: chatId, user_id: userId });
    return { status: 'ok' };
  } catch (e) {
    if (!(e instanceof BotApiError)) throw e;
    const d = String(e.description || '');
    if (e.code === 429) return { status: 'retry', wait: (e.parameters && e.parameters.retry_after) || 5 };
    if (e.code === 403 || /not enough rights|admin(istrator)? (rights )?required|CHAT_ADMIN/i.test(d)) {
      return { status: 'norights' };
    }
    if (e.code === 400) return { status: 'gone' };
    if (e.code >= 500) return { status: 'retry', wait: 5 };
    throw e;
  }
}

export async function ensureChat(chat) {
  await db.insert(chats)
    .values({ chatId: chat.id, title: chat.title, type: chat.type })
    .onConflictDoUpdate({ target: chats.chatId, set: { title: chat.title, type: chat.type } })
    .run();
}

export async function bump(chatId, n = 1) {
  await db.update(chats)
    .set({ approved: sql`${chats.approved} + ${n}`, lastApproved: new Date() })
    .where(eq(chats.chatId, chatId))
    .run();
}

export async function enqueue(chatId, userId) {
  const exists = await db.select().from(pending)
    .where(eq(pending.chatId, chatId)).all();
  if (exists.some((p) => p.userId === userId)) return;
  await db.insert(pending).values({ chatId, userId }).run();
}

// Approve queued requests (oldest first). Stops at the first flood-limit / rights error.
export async function drainPending(chatId, limit = 10) {
  const rows = await db.select().from(pending)
    .where(eq(pending.chatId, chatId))
    .orderBy(asc(pending.id))
    .limit(limit)
    .all();
  let approved = 0;
  for (const p of rows) {
    const r = await approveOne(chatId, p.userId);
    if (r.status === 'retry' || r.status === 'norights') break;
    await db.delete(pending).where(eq(pending.id, p.id)).run();
    if (r.status === 'ok') approved++;
  }
  if (approved) await bump(chatId, approved);
  return approved;
}

export function welcomeMessage(row, chatTitle, firstName) {
  const custom = row && row.welcomeText;
  const body = custom
    ? esc(custom).replace(/\{name\}/g, esc(firstName)).replace(/\{chat\}/g, esc(chatTitle))
    : 'Welcome aboard! 🎉';
  return `✅ <b>Your request to join ${esc(chatTitle || 'the chat')} was approved.</b>\n${body}`;
}

// Runs after a successful approval: counters + optional welcome DM.
export async function afterApprove(req, row) {
  await bump(req.chat.id, 1);
  if (!row || row.welcome !== false) {
    // user_chat_id is valid for 5 minutes, even if the user never started the bot.
    await safe(api.sendMessage({
      chat_id: req.user_chat_id,
      parse_mode: 'HTML',
      text: welcomeMessage(row, req.chat.title, req.from.first_name),
    }));
  }
}
