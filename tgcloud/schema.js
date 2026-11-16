import { table, integer, text, boolean, index, uniqueIndex, sql } from 'sdk/db';

// Every channel / group the bot is an administrator of.
export const chats = table('chats', {
  chatId:       integer('chat_id').primaryKey(),
  title:        text('title'),
  type:         text('type'),                              // channel | group | supergroup
  ownerId:      integer('owner_id'),                       // user who added the bot (manages settings)
  enabled:      boolean('enabled').default(true),          // auto-approve on/off
  welcome:      boolean('welcome').default(true),          // DM a welcome after approval
  welcomeText:  text('welcome_text'),                      // custom welcome ({name}, {chat}); null = default
  active:       boolean('active').default(true),           // false once the bot is removed
  approved:     integer('approved').notNull().default(0),  // lifetime approved requests
  lastApproved: integer('last_approved', { mode: 'timestamp' }),
  created:      integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  ownerIdx: index('idx_chats_owner').on(t.ownerId),
}));

// People who started the bot in private.
export const users = table('users', {
  userId:   integer('user_id').primaryKey(),
  name:     text('name'),
  awaiting: integer('awaiting'),   // chat_id whose welcome text this user is typing right now
  created:  integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// Requests we could not approve yet (Telegram flood limit / transient error). Drained later.
export const pending = table('pending', {
  id:      integer('id').primaryKey({ autoIncrement: true }),
  chatId:  integer('chat_id').notNull(),
  userId:  integer('user_id').notNull(),
  created: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  uq: uniqueIndex('uidx_pending').on(t.chatId, t.userId),
}));
