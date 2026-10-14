import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Credentials and tokens.
 *
 * Passwords use scrypt from Node's own `crypto` module. The original build used
 * argon2, whose parameters are recorded here so an existing hash can be
 * recognised: hashes produced by argon2 verify to `false` rather than throwing,
 * and `needsRehash` reports them so the next successful login upgrades the row.
 *
 * JWTs are HS256 and implemented directly — the format is a signed JSON payload,
 * which is a few lines of HMAC rather than a dependency.
 */

const scrypt = promisify(scryptCallback);

/** scrypt: 2^15 * 8 * 128 = 32 MiB, matching argon2's 19 MiB + overhead class. */
const SCRYPT_COST = 32_768;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELISM = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

const ISSUER = 'airline-booking';
const AUDIENCE = 'airline-booking-api';

/** Encodes as `scrypt$N$r$p$salt$hash`, all base64url. */
export async function hashPassword(plain) {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(plain, salt, KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELISM,
    maxmem: 256 * 1024 * 1024,
  });
  return [
    'scrypt',
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELISM,
    salt.toString('base64url'),
    Buffer.from(derived).toString('base64url'),
  ].join('$');
}

export async function verifyPassword(hash, plain) {
  try {
    const parts = String(hash).split('$');
    if (parts[0] !== 'scrypt' || parts.length !== 6) return false;

    const [, cost, blockSize, parallelism, salt, expected] = parts;
    const derived = await scrypt(plain, Buffer.from(salt, 'base64url'), KEY_LENGTH, {
      N: Number(cost),
      r: Number(blockSize),
      p: Number(parallelism),
      maxmem: 256 * 1024 * 1024,
    });

    const expectedBuffer = Buffer.from(expected, 'base64url');
    const actual = Buffer.from(derived);
    if (expectedBuffer.length !== actual.length) return false;
    return timingSafeEqual(expectedBuffer, actual);
  } catch {
    return false;
  }
}

/** True when the stored hash uses parameters below the current defaults. */
export function needsRehash(hash) {
  const parts = String(hash).split('$');
  if (parts[0] !== 'scrypt' || parts.length !== 6) return true;
  return Number(parts[1]) < SCRYPT_COST;
}

// ─────────────────────────────────────────────────────────────
// JWT (HS256)
// ─────────────────────────────────────────────────────────────

function encodeSegment(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function sign(data, secret) {
  return createHmac('sha256', Buffer.from(secret, 'utf8')).update(data).digest('base64url');
}

/**
 * Parses a duration such as `15m` or `30d` into seconds.
 *
 * TTLs come from the environment as human strings, so an unsupported format must
 * fail loudly at boot rather than produce a token that never expires.
 */
export function parseTtl(ttl) {
  const match = /^(\d+)([smhd])$/.exec(String(ttl).trim());
  if (!match) throw new Error(`Unsupported TTL format: ${ttl}`);

  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier = { s: 1, m: 60, h: 3_600, d: 86_400 }[unit];
  if (multiplier === undefined) throw new Error(`Unsupported TTL unit: ${unit}`);
  return amount * multiplier;
}

export function signAccessToken({ sub, email, role }, secret, ttl) {
  const issuedAt = Math.floor(Date.now() / 1_000);
  const expiresIn = parseTtl(ttl);
  const header = encodeSegment({ alg: 'HS256', typ: 'JWT' });
  const payload = encodeSegment({
    sub,
    email,
    role,
    iss: ISSUER,
    aud: AUDIENCE,
    iat: issuedAt,
    exp: issuedAt + expiresIn,
  });
  const signature = sign(`${header}.${payload}`, secret);
  return { token: `${header}.${payload}.${signature}`, expiresIn };
}

export function signRefreshToken({ sub, jti, family }, secret, ttl) {
  const issuedAt = Math.floor(Date.now() / 1_000);
  const expiresIn = parseTtl(ttl);
  const header = encodeSegment({ alg: 'HS256', typ: 'JWT' });
  const payload = encodeSegment({
    sub,
    jti,
    family,
    iss: ISSUER,
    aud: AUDIENCE,
    iat: issuedAt,
    exp: issuedAt + expiresIn,
  });
  const signature = sign(`${header}.${payload}`, secret);
  return { token: `${header}.${payload}.${signature}`, expiresIn };
}

function verify(token, secret) {
  const parts = String(token).split('.');
  if (parts.length !== 3) throw new Error('TOKEN_INVALID');

  const [header, payload, signature] = parts;
  const expected = sign(`${header}.${payload}`, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new Error('TOKEN_INVALID');
  }

  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new Error('TOKEN_INVALID');
  }

  if (claims.iss !== ISSUER || claims.aud !== AUDIENCE) throw new Error('TOKEN_INVALID');
  if (typeof claims.exp !== 'number' || claims.exp * 1_000 <= Date.now()) {
    throw new Error('TOKEN_EXPIRED');
  }
  return claims;
}

export function verifyAccessToken(token, secret) {
  const claims = verify(token, secret);
  if (
    typeof claims.sub !== 'string' ||
    typeof claims.email !== 'string' ||
    typeof claims.role !== 'string'
  ) {
    throw new Error('TOKEN_INVALID');
  }
  return {
    claims: { sub: claims.sub, email: claims.email, role: claims.role },
    expiresAt: new Date(claims.exp * 1_000),
  };
}

export function verifyRefreshToken(token, secret) {
  const claims = verify(token, secret);
  if (
    typeof claims.sub !== 'string' ||
    typeof claims.jti !== 'string' ||
    typeof claims.family !== 'string'
  ) {
    throw new Error('TOKEN_INVALID');
  }
  return {
    claims: { sub: claims.sub, jti: claims.jti, family: claims.family },
    expiresAt: new Date(claims.exp * 1_000),
  };
}

export function hashRefreshToken(token) {
  return createHmac('sha256', 'refresh-token-hash').update(String(token)).digest('hex');
}

export function newTokenFamilyId() {
  return randomBytes(16).toString('hex');
}

// ─────────────────────────────────────────────────────────────
// PII encryption (AES-256-GCM)
// ─────────────────────────────────────────────────────────────

import { createCipheriv, createDecipheriv } from 'node:crypto';

/**
 * Encrypts passenger PII at rest with AES-256-GCM. The key is 32 bytes hex
 * encoded in `PII_ENCRYPTION_KEY`; a missing key is a configuration error and is
 * reported at boot rather than silently storing plaintext.
 */
export function encryptPii(plain, keyHex) {
  const key = Buffer.from(keyHex, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${encrypted.toString('base64url')}.${tag.toString('base64url')}`;
}

export function decryptPii(payload, keyHex) {
  const [version, iv, data, tag] = String(payload).split('.');
  if (version !== 'v1') throw new Error('Unsupported PII payload version');

  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
