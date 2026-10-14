import { loadEnv } from '../env.js';
import { AppError, ErrorCode } from '../lib/errors.js';
import { auth } from '../services/index.js';
import { appendCookie, readJsonBody, sendJson, serialiseCookie } from '../http/router.js';
import { ACCESS_COOKIE, REFRESH_COOKIE, userView } from '../http/auth-context.js';

/**
 * Auth routes.
 *
 * Tokens are set as httpOnly cookies and also returned in the body, so a browser
 * and a scripted client can both use the same endpoint.
 */

const ACCESS_MAX_AGE_SECONDS = 15 * 60;
const REFRESH_MAX_AGE_SECONDS = 30 * 86_400;

function setSessionCookies(res, session, env) {
  appendCookie(
    res,
    serialiseCookie(ACCESS_COOKIE, session.accessToken, {
      maxAge: ACCESS_MAX_AGE_SECONDS,
      secure: env.cookieSecure,
    }),
  );
  appendCookie(
    res,
    serialiseCookie(REFRESH_COOKIE, session.refreshToken, {
      maxAge: REFRESH_MAX_AGE_SECONDS,
      secure: env.cookieSecure,
    }),
  );
}

export function registerAuthRoutes(router) {
  router.post('/api/auth/register', async (req, res, context) => {
    const env = loadEnv();
    const body = await readJsonBody(req);
    const session = await auth.register(body, env);
    setSessionCookies(res, session, env);
    sendJson(res, 201, {
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      user: userView(auth.findUserById(session.user.id)),
    });
  });

  router.post('/api/auth/login', async (req, res, context) => {
    const env = loadEnv();
    const body = await readJsonBody(req);
    const session = await auth.login(body, env);
    setSessionCookies(res, session, env);
    sendJson(res, 200, {
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      user: userView(auth.findUserById(session.user.id)),
    });
  });

  router.post('/api/auth/refresh', (req, res, context) => {
    const env = loadEnv();
    const token = context.cookies[REFRESH_COOKIE];
    if (!token) throw new AppError(ErrorCode.UNAUTHENTICATED, 'You must be signed in');

    const session = auth.refreshSession(token, env);
    setSessionCookies(res, session, env);
    sendJson(res, 200, { accessToken: session.accessToken, expiresIn: session.expiresIn });
  });

  router.post('/api/auth/logout', (req, res, context) => {
    const env = loadEnv();
    auth.logout(context.cookies[REFRESH_COOKIE]);

    // Clearing a cookie requires the same attributes it was set with, otherwise
    // the browser keeps the original.
    for (const name of [ACCESS_COOKIE, REFRESH_COOKIE]) {
      appendCookie(
        res,
        serialiseCookie(name, '', { maxAge: 0, secure: env.cookieSecure }),
      );
    }
    sendJson(res, 200, { ok: true });
  });

  router.get('/api/auth/me', (req, res, context) => {
    if (!context.user) {
      throw new AppError(ErrorCode.UNAUTHENTICATED, 'You must be signed in');
    }
    const row = auth.findUserById(context.user.id);
    if (!row) throw new AppError(ErrorCode.UNAUTHENTICATED, 'You must be signed in');
    sendJson(res, 200, { user: userView(row) });
  });
}
