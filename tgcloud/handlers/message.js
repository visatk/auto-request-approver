import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { users, chats } from '../schema.js';
import { botUsername } from '../lib/util.js';
import { chatsScreen, chatScreen, getOwned, MAX_WELCOME } from '../lib/settings.js';

const INTRO =
  '<b>What can this bot do?</b>\n\n' +
  '➜ This bot can approve join requests automatically.\n\n' +
  "➜ Just add the bot as an administrator in your channels/groups and it's done ✅\n\n" +
  '<i>The bot needs the “Invite Users via Link” permission. Join requests only appear where the invite link / group uses “Request admin approval” — /settings can create such a link for you.</i>';

export default async function (m) {
  // Only talk in private chats — groups/channels are handled by chat_join_request.
  if (m.chat.type !== 'private' || !m.from || m.from.is_bot) return;

  const uid = m.from.id;
  let me = await db.select().from(users).where(eq(users.userId, uid)).get();
  if (!me) {
    await db.insert(users).values({ userId: uid, name: m.from.first_name }).run();
    me = { userId: uid, awaiting: null };
  }

  const text = (m.text || '').trim();
  const cmd = text.startsWith('/') ? text.split(/[\s@]/)[0].toLowerCase() : '';
  const reply = (extra) => api.sendMessage({ chat_id: m.chat.id, parse_mode: 'HTML', ...extra });

  // ── Waiting for a custom welcome text? ──────────────────────────────────────
  if (me.awaiting) {
    if (!cmd && text) {
      const chat = await getOwned(me.awaiting, uid);
      await db.update(users).set({ awaiting: null }).where(eq(users.userId, uid)).run();
      if (!chat) return reply({ text: 'That chat is no longer available.' });
      await db.update(chats).set({ welcomeText: text.slice(0, MAX_WELCOME) }).where(eq(chats.chatId, chat.chatId)).run();
      await reply({ text: '✅ Welcome text saved.' });
      return reply(await chatScreen(chat.chatId, uid));
    }
    // any command cancels the input
    await db.update(users).set({ awaiting: null }).where(eq(users.userId, uid)).run();
    if (cmd === '/cancel') return reply({ text: 'Cancelled.' });
  }

  if (cmd === '/settings' || cmd === '/chats' || cmd === '/stats') {
    return reply(await chatsScreen(uid));
  }

  const username = await botUsername();
  const rights = 'admin=invite_users';
  return reply({
    text: INTRO,
    reply_markup: {
      inline_keyboard: [
        [
          { text: '➕ Add to Channel', url: `https://t.me/${username}?startchannel&${rights}` },
          { text: '➕ Add to Group',   url: `https://t.me/${username}?startgroup=true&${rights}` },
        ],
        [{ text: '⚙️ My chats', callback_data: 's' }],
      ],
    },
  });
}
