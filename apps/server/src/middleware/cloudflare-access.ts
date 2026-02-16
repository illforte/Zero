import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import type { HonoContext } from '../ctx';

/**
 * Cloudflare Access JWT validation middleware
 *
 * Validates the CF-Access-JWT-Assertion header against Cloudflare's public keys
 * and extracts user information from the validated JWT.
 */

interface CloudflareAccessPayload {
  aud: string[];
  email: string;
  iss: string;
  sub: string;
  name?: string;
  custom?: {
    name?: string;
  };
}

export const cloudflareAccessMiddleware = createMiddleware<HonoContext>(async (c, next) => {
  const CF_ACCESS_AUD = c.env.CF_ACCESS_AUD;
  const CF_ACCESS_TEAM_DOMAIN = c.env.CF_ACCESS_TEAM_DOMAIN;

  if (!CF_ACCESS_AUD || !CF_ACCESS_TEAM_DOMAIN) {
    throw new HTTPException(500, {
      message: 'Cloudflare Access not configured. Missing CF_ACCESS_AUD or CF_ACCESS_TEAM_DOMAIN.'
    });
  }

  // Get the JWT from the CF-Access-JWT-Assertion header
  const jwt = c.req.header('CF-Access-JWT-Assertion');

  if (!jwt) {
    throw new HTTPException(401, {
      message: 'Unauthorized: No Cloudflare Access token found'
    });
  }

  try {
    // Cloudflare's public keys endpoint
    const certsUrl = `https://${CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`;
    const JWKS = createRemoteJWKSet(new URL(certsUrl));

    // Verify the JWT against Cloudflare's public keys
    const { payload } = await jwtVerify<CloudflareAccessPayload>(jwt, JWKS, {
      audience: CF_ACCESS_AUD,
      issuer: `https://${CF_ACCESS_TEAM_DOMAIN}`,
    });

    // Extract user information from the validated JWT
    const userEmail = payload.email;
    const userName = payload.name || payload.custom?.name || 'User';

    if (!userEmail) {
      throw new HTTPException(401, {
        message: 'Unauthorized: No email in Cloudflare Access token'
      });
    }

    // Store the validated user info in the context for downstream use
    c.set('cfAccessUser', {
      email: userEmail,
      name: userName,
      sub: payload.sub,
    });

    await next();
  } catch (error) {
    console.error('Cloudflare Access JWT validation failed:', error);

    if (error instanceof HTTPException) {
      throw error;
    }

    throw new HTTPException(401, {
      message: 'Unauthorized: Invalid Cloudflare Access token',
      cause: error,
    });
  }
});

/**
 * Helper function to get the authenticated user from Cloudflare Access
 */
export function getCfAccessUser(c: HonoContext) {
  return c.get('cfAccessUser');
}
