# Auto Request Approver

Telegram bot that approves join requests automatically — add it as an admin to a channel/group and it's done.
Runs on [Telegram Serverless](https://core.telegram.org/bots/serverless): no server, no webhook plumbing.

## Features
- **Auto-approve** every join request (`approveChatJoinRequest`), classic mode.
- **Guard-bot mode** (Bot API 10.1, June 2026): if the bot is assigned as a chat's *guard bot*, requests arrive with a
  `query_id` and are answered via `answerChatJoinRequestQuery` (`approve`, or `queue` when paused) inside Telegram's 10-second window.
- **Flood-limit safe**: on `429`/5xx the request goes to a `pending` queue and is drained on the next approval or via the
  *Approve queued* button — nothing is lost.
- **One-tap request links**: creates `creates_join_request` invite links for you (requests only exist for such links / join-by-request groups).
- **Per-chat settings** in private chat: auto-approve on/off, welcome DM on/off, custom welcome text (`{name}`, `{chat}`), stats.
- **Self-managing**: registers chats when promoted, warns if *Invite Users via Link* is missing, cleans up when removed.

## Deploy
1. @BotFather → your bot → **Serverless** → **ON**; copy **CLI Access → Access token**.
2. ```bash
   npm install
   npx tgcloud login      # paste app<id>:<secret>
   npx tgcloud push
   npx tgcloud migrate    # review + confirm the new tables
   npx tgcloud webhook    # should say "in sync" (allowed_updates are built from handlers/)
   ```
3. Optional, BotFather → `/setcommands`:
   ```
   start - How it works
   settings - Manage your chats
   cancel - Cancel current input
   ```
4. Optional guard-bot mode: enable join-request queries for the bot in BotFather (if offered), then assign it as the chat's guard bot in the chat's admin settings.

## Test without deploying
```bash
npx tgcloud run handlers/message "$(cat examples/start.json5)"
npx tgcloud run handlers/chat_join_request "$(cat examples/join_request.json5)"
```

## Layout
| File | Update | Job |
|---|---|---|
| `handlers/chat_join_request.js` | `chat_join_request` | approve (classic or guard), queue on limits, welcome DM |
| `handlers/my_chat_member.js` | `my_chat_member` | register chat on promotion, rights warning, cleanup on removal |
| `handlers/message.js` | `message` | `/start`, `/settings`, welcome-text input |
| `handlers/callback_query.js` | `callback_query` | toggles, text editing, link creation, queue drain |
| `lib/approve.js` | – | approve/classify errors, queue, counters, welcome text |
| `lib/settings.js` | – | settings screens, ownership check |
| `schema.js` | – | `chats`, `users`, `pending` |

## Notes & limits
- Needs the **Invite Users via Link** admin right (that's also what delivers `chat_join_request` updates).
- The Bot API has no bulk-approve call: requests pending *before* the bot was added are not back-filled.
- Platform rules honored: no foreign keys, relative `.js` imports, all `db` calls awaited, one handler per update type, push → migrate.
- `setTimeout` isn't documented for the runtime, so short flood waits are only slept when it exists; otherwise requests are queued.
