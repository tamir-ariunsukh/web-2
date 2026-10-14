/**
 * Session state.
 *
 * The user is cached in memory and refreshed from the API after each auth action.
 * No token is stored in JavaScript: the session lives in an httpOnly cookie, so
 * this module only ever needs to know *who* is signed in, not how to authenticate.
 */

import { api } from './api.js';

export const session = {
  user: null,
  loaded: false,
};

/**
 * Restores the signed-in user at boot.
 *
 * `/api/auth/me` returns 401 once the access cookie lapses, but the API client
 * renews it from the refresh cookie and replays the call, so a returning visitor
 * with a valid refresh session stays signed in.
 */
export async function loadSession() {
  try {
    const payload = await api.get('/api/auth/me');
    session.user = payload.user;
  } catch {
    session.user = null;
  }
  session.loaded = true;
  return session.user;
}

export function setUser(user) {
  session.user = user;
  session.loaded = true;
}

export async function signIn(email, password) {
  const payload = await api.post('/api/auth/login', { email, password });
  setUser(payload.user);
  return payload.user;
}

export async function signUp(input) {
  const payload = await api.post('/api/auth/register', input);
  setUser(payload.user);
  return payload.user;
}

export async function signOut() {
  try {
    await api.post('/api/auth/logout');
  } finally {
    setUser(null);
  }
}

export function isStaff(user = session.user) {
  return user?.role === 'ADMIN' || user?.role === 'AGENT';
}

export function isAdmin(user = session.user) {
  return user?.role === 'ADMIN';
}

export function isSignedIn() {
  return session.user !== null;
}
