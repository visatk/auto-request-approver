import { api, BotApiError } from 'sdk';

let cachedUsername;

export async function botUsername() {
  if (!cachedUsername) cachedUsername = (await api.getMe()).username;
  return cachedUsername;
}

export const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Await a Bot API call and swallow "expected" failures (blocked bot, message not modified…).
export async function safe(promise, codes = [400, 403]) {
  try {
    return await promise;
  } catch (e) {
    if (e instanceof BotApiError && codes.includes(e.code)) return null;
    throw e;
  }
}

// setTimeout is not documented for the runtime, so only use it when it exists.
export const canSleep = () => typeof setTimeout === 'function';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
