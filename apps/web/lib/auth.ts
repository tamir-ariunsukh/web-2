'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  GraphQLClientError,
  cookieToken,
  graphqlRequest,
} from './graphql-client';

/**
 * Session handling.
 *
 * Tokens live in httpOnly cookies so the browser never sees them. The access
 * token is short-lived; the refresh token is rotated by the API on every use.
 */

export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string | null;
  readonly role: string;
}

const ACCESS_TTL_SECONDS = 60 * 15;
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30;

const ME_QUERY = /* GraphQL */ `
  query Me {
    me {
      id
      email
      firstName
      lastName
      phone
      role
    }
  }
`;

const REGISTER_MUTATION = /* GraphQL */ `
  mutation Register($input: RegisterInput!) {
    register(input: $input) {
      accessToken
      refreshToken
      user {
        id
        email
        firstName
        lastName
        phone
        role
      }
    }
  }
`;

const LOGIN_MUTATION = /* GraphQL */ `
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      accessToken
      refreshToken
      user {
        id
        email
        firstName
        lastName
        phone
        role
      }
    }
  }
`;

const LOGOUT_MUTATION = /* GraphQL */ `
  mutation Logout($refreshToken: String!) {
    logout(refreshToken: $refreshToken) {
      success
    }
  }
`;

interface AuthPayload {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly user: SessionUser;
}

const secure = process.env.NODE_ENV === 'production';

async function storeTokens(accessToken: string, refreshToken: string): Promise<void> {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: ACCESS_TTL_SECONDS,
  });
  jar.set(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: REFRESH_TTL_SECONDS,
  });
}

/** The signed-in user, or `null` when there is no valid session. */
export async function getSession(): Promise<SessionUser | null> {
  const token = await cookieToken();
  if (!token) return null;

  try {
    const data = await graphqlRequest<{ me: SessionUser | null }, Record<string, never>>(
      ME_QUERY,
      {},
      { token },
    );
    return data.me;
  } catch (error) {
    // An expired or revoked token is treated as signed out rather than an error.
    if (error instanceof GraphQLClientError) return null;
    throw error;
  }
}

/** Reads a form field as a string, ignoring non-string values such as files. */
function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

export interface AuthActionState {
  readonly error?: string;
}

export async function registerAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const input = {
    email: field(formData, 'email'),
    password: field(formData, 'password'),
    firstName: field(formData, 'firstName'),
    lastName: field(formData, 'lastName'),
    phone: field(formData, 'phone') || undefined,
  };

  if (input.password.length < 12) {
    return { error: 'Password must be at least 12 characters' };
  }

  try {
    const data = await graphqlRequest<{ register: AuthPayload }, { input: typeof input }>(
      REGISTER_MUTATION,
      { input },
    );
    await storeTokens(data.register.accessToken, data.register.refreshToken);
  } catch (error) {
    return { error: messageFor(error) };
  }

  redirect('/');
}

export async function loginAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const input = {
    email: field(formData, 'email'),
    password: field(formData, 'password'),
  };

  try {
    const data = await graphqlRequest<{ login: AuthPayload }, { input: typeof input }>(
      LOGIN_MUTATION,
      { input },
    );
    await storeTokens(data.login.accessToken, data.login.refreshToken);
  } catch (error) {
    return { error: messageFor(error) };
  }

  redirect('/');
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  const refreshToken = jar.get(REFRESH_COOKIE)?.value;

  if (refreshToken) {
    try {
      await graphqlRequest<{ logout: { success: boolean } }, { refreshToken: string }>(
        LOGOUT_MUTATION,
        { refreshToken },
        { token: '' },
      );
    } catch {
      // The local session is cleared regardless, so a failed revoke is not fatal.
    }
  }

  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
  redirect('/');
}

/** Maps a GraphQL error onto text safe to show in a form. */
function messageFor(error: unknown): string {
  if (error instanceof GraphQLClientError) {
    if (error.code === 'EMAIL_ALREADY_REGISTERED') {
      return 'An account with this email already exists';
    }
    if (error.code === 'UNAUTHENTICATED' || error.code === 'INVALID_CREDENTIALS') {
      return 'Email or password is incorrect';
    }
    if (error.code === 'ACCOUNT_LOCKED') {
      return 'Too many failed attempts. Try again later.';
    }
    return error.message;
  }
  return 'Could not reach the server. Is the API running?';
}
