import { api, db } from 'sdk';
import { eq, sql } from 'sdk/db';
import { chats, pending } from '../schema.js';
import { esc, safe } from '../lib/util.js';

// Fires when the bot's own status in a chat changes (added, promoted, demoted, removed…).
export default async function (u) {
  const chat = u.chat;
  if (chat.type === 'private') return;

  const old = u.old_chat_member;
  const now = u.new_chat_member;
  const st = now.status;

  if (st === 'left' || st === 'kicked') {
    await db.update(chats).set({ active: false }).where(eq(chats.chatId, chat.id)).run();
    await db.delete(pending).where(eq(pending.chatId, chat.id)).run();
    return;
  }

  const isAdmin = st === 'administrator';
  const canInvite = isAdmin && now.can_invite_users !== false;
  const wasInvite = old.status === 'administrator' && old.can_invite_users !== false;

  if (isAdmin) {
    await db.insert(chats)
      .values({ chatId: chat.id, title: chat.title, type: chat.type, ownerId: u.from.id, active: true })
      .onConflictDoUpdate({
        target: chats.chatId,
        set: {
          title: chat.title,
          type: chat.type,
          // A fresh re-add hands ownership to the new adder; otherwise keep the existing owner.
          ownerId: sql`CASE WHEN ${chats.active} = 0 THEN ${u.from.id} ELSE coalesce(${chats.ownerId}, ${u.from.id}) END`,
          active: true,
        },
      })
      .run();
  }

  if (old.status === st && wasInvite === canInvite) return; // nothing meaningful changed

  const title = esc(chat.title || 'your chat');
  let text;
  if (canInvite) {
    text =
      `✅ <b>Active in ${title}.</b>\nNew join requests will be approved automatically.\n\n` +
      `💡 Requests only appear for links created with <i>“Request admin approval”</i> — ` +
      `use /settings → your chat → <b>New request-to-join link</b> and I'll make one for you.`;
  } else if (isAdmin) {
    text = `⚠️ I'm an admin in <b>${title}</b>, but I'm missing the <b>Invite Users via Link</b> permission — I can't approve requests without it.`;
  } else {
    text = `ℹ️ I was added to <b>${title}</b>, but I'm not an administrator yet. Promote me to admin (with “Invite Users via Link”) and I'll start approving join requests.`;
  }
  await safe(api.sendMessage({ chat_id: u.from.id, parse_mode: 'HTML', text }));
}
