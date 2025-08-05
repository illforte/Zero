import type { ParsedMessage } from '@/types';

export interface MagicLink {
  id: string;
  url: string;
  service: string;
  threadId: string;
  from: string;
  subject: string;
  receivedAt: Date;
}

const MAGIC_LINK_KEYWORDS = [
  'magic',
  'login',
  'signin',
  'sign-in',
  'sign_in',
  'token',
  'auth',
  'verify',
  'verification',
  'session',
  'key',
];

const SERVICE_PATTERNS: Record<string, RegExp[]> = {
  Google: [/google/i, /gmail/i, /youtube/i],
  Microsoft: [/microsoft/i, /outlook/i, /office/i, /azure/i],
  Amazon: [/amazon/i, /aws/i],
  Apple: [/apple/i, /icloud/i],
  Facebook: [/facebook/i, /meta/i],
  Twitter: [/twitter/i, /x\.com/i],
  GitHub: [/github/i],
  LinkedIn: [/linkedin/i],
  PayPal: [/paypal/i],
  Stripe: [/stripe/i],
  Discord: [/discord/i],
  Slack: [/slack/i],
  Notion: [/notion/i],
  Vercel: [/vercel/i],
  Cloudflare: [/cloudflare/i],
};

const isAssetUrl = (url: string): boolean => {
  return /\.(png|jpe?g|gif|webp|svg|css|js|ico)(\?|$)/i.test(url);
};

export const detectMagicLinkFromEmail = (message: ParsedMessage): MagicLink | null => {
  if (!message.body && !message.decodedBody && !message.subject) return null;

  const bodyText = message.decodedBody || message.body || '';

  const urlRegex = /https?:\/\/[^\s"'<>]+/gi;
  const matches = [...bodyText.matchAll(urlRegex)];

  let foundUrl: string | null = null;
  for (const m of matches) {
    const url = m[0];
    if (isAssetUrl(url)) continue;
    const lowerUrl = url.toLowerCase();
    if (MAGIC_LINK_KEYWORDS.some((kw) => lowerUrl.includes(kw))) {
      foundUrl = url;
      break;
    }
  }

  if (!foundUrl) return null;

  let service = 'Unknown Service';
  const fromEmail = message.sender?.email || '';
  const fromName = message.sender?.name || '';
  for (const [serviceName, patterns] of Object.entries(SERVICE_PATTERNS)) {
    if (
      patterns.some((p) => p.test(fromEmail) || p.test(fromName) || p.test(message.subject || ''))
    ) {
      service = serviceName;
      break;
    }
  }

  return {
    id: `${message.id}-magic-link`,
    url: foundUrl,
    service,
    threadId: message.threadId || message.id,
    from: fromEmail,
    subject: message.subject || '',
    receivedAt: new Date(message.receivedOn),
  };
};
