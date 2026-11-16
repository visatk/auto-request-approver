import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { chats } from '../schema.js';
import { safe, canSleep, sleep } from '../lib/util.js';
import { approveOne, ensureChat, enqueue, drainPending, afterApprove } from '../lib/approve.js';

// ChatJoinRequest: { chat, from, user_chat_id, date, invite_link?, query_id? }
export default async function (req) {
  const chat = req.chat;
  const row = await db.select().from(chats).where(eq(chats.chatId, chat.id)).get();
  const enabled = !row || row.enabled !== false;

  // ── Guard-bot mode (Bot API 10.1) ───────────────────────────────────────────
  // When this bot is the chat's guard bot, the request carries a query_id and we MUST
  // answer it within 10 seconds — so answer first, do the bookkeeping afterwards.
  if (req.query_id) {
    await safe(api.answerChatJoinRequestQuery({
      chat_join_request_query_id: req.query_id,
      result: enabled ? 'approve' : 'queue', // 'queue' = leave it to the human admins
    }));
    if (enabled) {
      if (!row) await ensureChat(chat);
      await afterApprove(req, row);
    }
    return;
  }

  // ── Classic mode ────────────────────────────────────────────────────────────
  if (!enabled) return; // owner paused auto-approve
  if (!row) await ensureChat(chat);

  let r = await approveOne(chat.id, req.from.id);
  if (r.status === 'retry' && r.wait <= 3 && canSleep()) {
    await sleep(r.wait * 1000);
    r = await approveOne(chat.id, req.from.id);
  }

  switch (r.status) {
    case 'ok':
      await afterApprove(req, row);
      await drainPending(chat.id, 5); // opportunistically clear anything queued earlier
      break;
    case 'retry':
      await enqueue(chat.id, req.from.id); // flood-limited: keep it, approve later
      break;
    case 'norights':
      console.warn('Missing Invite Users right in', chat.id, chat.title);
      break;
    // 'gone': already a member or request withdrawn — nothing to do
  }
}
