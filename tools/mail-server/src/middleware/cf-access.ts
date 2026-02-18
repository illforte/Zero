import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import type { HonoContext } from '../types.js';
import { env } from '../env.js';

interface CloudflareAccessPayload {
  aud: string[];
  email: string;
  iss: string;
  sub: string;
  name?: string;
  custom?: { name?: string };
}

// Cache the JWKS to avoid re-fetching on every request
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS() {
  if (!jwksCache) {
    const certsUrl = `https://${env.CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`;
    jwksCache = createRemoteJWKSet(new URL(certsUrl));
  }
  return jwksCache;
}

/**
 * Cloudflare Access JWT validation middleware.
 * Validates CF-Access-JWT-Assertion header and sets cfAccessUser in context.
 */
export const cloudflareAccessMiddleware = createMiddleware<HonoContext>(async (c, next) => {
  const CF_ACCESS_AUD = env.CF_ACCESS_AUD;
  const CF_ACCESS_TEAM_DOMAIN = env.CF_ACCESS_TEAM_DOMAIN;

  if (!CF_ACCESS_AUD || !CF_ACCESS_TEAM_DOMAIN) {
    throw new HTTPException(500, {
      message: 'Cloudflare Access not configured. Missing CF_ACCESS_AUD or CF_ACCESS_TEAM_DOMAIN.',
    });
  }

  const jwt = c.req.header('CF-Access-JWT-Assertion');

  if (!jwt) {
    throw new HTTPException(401, {
      message: 'Unauthorized: No Cloudflare Access token found',
    });
  }

  try {
    const JWKS = getJWKS();
    const { payload } = await jwtVerify<CloudflareAccessPayload>(jwt, JWKS, {
      audience: CF_ACCESS_AUD,
      issuer: `https://${CF_ACCESS_TEAM_DOMAIN}`,
    });

    const userEmail = payload.email;
    const userName = payload.name || payload.custom?.name || 'User';

    if (!userEmail) {
      throw new HTTPException(401, {
        message: 'Unauthorized: No email in Cloudflare Access token',
      });
    }

    c.set('cfAccessUser', {
      email: userEmail,
      name: userName,
      sub: payload.sub,
    });

    await next();
  } catch (error) {
    if (error instanceof HTTPException) throw error;

    console.error('[cf-access] JWT validation failed:', error);
    throw new HTTPException(401, {
      message: 'Unauthorized: Invalid Cloudflare Access token',
      cause: error,
    });
  }
});

export function getCfAccessUser(c: { get: (key: 'cfAccessUser') => { email: string; name: string; sub: string } | undefined }) {
  return c.get('cfAccessUser');
}
