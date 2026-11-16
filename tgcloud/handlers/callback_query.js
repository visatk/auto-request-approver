import { api, db, BotApiError } from 'sdk';
import { eq } from 'sdk/db';
import { chats, users } from '../schema.js';
import { chatsScreen, chatScreen, getOwned, MAX_WELCOME } from '../lib/settings.js';
import { drainPending } from '../lib/approve.js';
import { esc, safe } from '../lib/util.js';

export default async function (cb) {
  const [act, arg] = (cb.data || '').split(':');
  const uid = cb.from.id;
  const id = Number(arg);

  const answer = (text, alert = false) =>
    safe(api.answerCallbackQuery({ callback_query_id: cb.id, text, show_alert: alert }));
  const render = async (screen) => {
    if (!screen || !cb.message) return;
    await safe(api.editMessageText({
      chat_id: cb.message.chat.id,
      message_id: cb.message.message_id,
      parse_mode: 'HTML',
      ...screen,
    }));
  };

  // ── no chat needed ──────────────────────────────────────────────────────────
  if (act === 's' || act === 'c') {
    if (act === 'c') await db.update(users).set({ awaiting: null }).where(eq(users.userId, uid)).run();
    await answer();
    return render(await chatsScreen(uid));
  }

  // ── everything below needs a chat this user manages ─────────────────────────
  const row = await getOwned(id, uid);
  if (!row) return answer('Chat not found or you are not its manager.', true);

  switch (act) {
    case 'v':
      await answer();
      return render(await chatScreen(id, uid));

    case 't':
      await db.update(chats).set({ enabled: !row.enabled }).where(eq(chats.chatId, id)).run();
      await answer(row.enabled ? 'Auto-approve OFF' : 'Auto-approve ON');
      return render(await chatScreen(id, uid));

    case 'w':
      await db.update(chats).set({ welcome: !row.welcome }).where(eq(chats.chatId, id)).run();
      await answer(row.welcome ? 'Welcome DM OFF' : 'Welcome DM ON');
      return render(await chatScreen(id, uid));

    case 'r':
      await db.update(chats).set({ welcomeText: null }).where(eq(chats.chatId, id)).run();
      await answer('Welcome text reset');
      return render(await chatScreen(id, uid));

    case 'e': {
      await db.update(users).set({ awaiting: id }).where(eq(users.userId, uid)).run();
      await answer();
      return api.sendMessage({
        chat_id: uid,
        parse_mode: 'HTML',
        text:
          `✏️ Send the new welcome text for <b>${esc(row.title || id)}</b> (max ${MAX_WELCOME} characters).\n\n` +
          'Placeholders: <code>{name}</code> = the new member, <code>{chat}</code> = chat title.',
        reply_markup: { inline_keyboard: [[{ text: '✖️ Cancel', callback_data: 'c' }]] },
      });
    }

    case 'l': {
      try {
        const link = await api.createChatInviteLink({
          chat_id: id,
          name: 'Auto Request Approver',
          creates_join_request: true,
        });
        await answer();
        return api.sendMessage({
          chat_id: uid,
          parse_mode: 'HTML',
          text:
            `🔗 <b>Request-to-join link for ${esc(row.title || id)}</b>\n\n${esc(link.invite_link)}\n\n` +
            'Everyone who uses it is approved automatically.',
          link_preview_options: { is_disabled: true },
        });
      } catch (e) {
        if (e instanceof BotApiError) return answer('I need the “Invite Users via Link” right in that chat.', true);
        throw e;
      }
    }

    case 'p': {
      const n = await drainPending(id, 25);
      await answer(n ? `Approved ${n} queued request(s)` : 'Nothing could be approved right now — try again shortly.', !n);
      return render(await chatScreen(id, uid));
    }
  }
  return answer();
}
