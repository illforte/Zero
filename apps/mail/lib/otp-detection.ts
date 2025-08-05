import type { ParsedMessage } from '@/types';

export interface OTPCode {
  id: string;
  code: string;
  service: string;
  threadId: string;
  from: string;
  subject: string;
  receivedAt: Date;
  expiresAt?: Date;
  isExpired: boolean;
}

const OTP_PATTERNS = [
  // Codes with explicit context (most specific)
  // /Your (?:verification|security|authentication|confirmation|access|login) code is:?\s*([A-Z0-9]{4,8})/i,
  // /(?:verification|security|authentication|confirmation|access|login) code:?\s*([A-Z0-9]{4,8})/i,
  // /(?:code|OTP|PIN)(?:\s+is)?:?\s*([A-Z0-9]{4,8})/i,
  // /Use (?:code|this):?\s*([A-Z0-9]{4,8})/i,
  // /Enter:?\s*([A-Z0-9]{4,8})/i,

  // Service-specific patterns
  /G-(\d{6})/, // Google format
  /(\d{6})\s+is your/i,
  /is\s+(\d{4,8})(?!\s*(?:px|em|rem|%|pt|vh|vw))/i, // Exclude CSS units

  // Codes with formatting
  /\b(\d{3}[-\s]\d{3})\b/, // 123-456 or 123 456
  /\b(\d{4}[-\s]\d{4})\b/, // 1234-5678
  /\b(\d{2}[-\s]\d{2}[-\s]\d{2})\b/, // 12-34-56

  // Standalone numeric codes (4-8 digits) - exclude hex colors, dates, times
  /(?<!#)(?<!:)(?<!-)(?<![A-Z0-9])(\d{6})(?![A-Z0-9])(?!:)(?!-)(?!\s*(?:UTC|GMT|EST|PST|PDT|CDT|MDT))/, // Exactly 6 digits
  /(?<!#)(?<!:)(?<!-)(?<![A-Z0-9])(?!19\d{2})(?!20\d{2})(\d{4})(?![A-Z0-9])(?!:)(?!-)/, // Exactly 4 digits, not years
  /(?<!#)(?<!:)(?<!-)(?<![A-Z0-9])(\d{5})(?![A-Z0-9])(?!:)(?!-)/, // Exactly 5 digits
  /(?<!#)(?<!:)(?<!-)(?<![A-Z0-9])(\d{7})(?![A-Z0-9])(?!:)(?!-)/, // Exactly 7 digits
  /(?<!#)(?<!:)(?<!-)(?<![A-Z0-9])(\d{8})(?![A-Z0-9])(?!:)(?!-)(?!\s*(?:UTC|GMT|EST|PST|PDT|CDT|MDT))/, // Exactly 8 digits

  // Alphanumeric codes (less common) - exclude hex colors
  /(?<!#)(?<![A-Z0-9])([A-Z0-9]{6})(?![A-Z0-9])(?![A-F0-9]{0,2})/,
  /(?<!#)(?<![A-Z0-9])([A-Z0-9]{8})(?![A-Z0-9])/,

  // Fallback patterns - more restrictive
  /(?<!#)(?<![\w-])([A-Z0-9]{4,8})(?![\w-])(?!\s*[);,}])/i, // Avoid CSS, function calls, etc.
];

const isValidOTPCode = (code: string): boolean => {
  // Exclude years (1900-2099)
  if (/^(19|20)\d{2}$/.test(code)) return false;

  // Exclude common timestamp patterns
  if (/^\d{2}:\d{2}$/.test(code)) return false; // HH:MM
  if (/^\d{6}$/.test(code) && code.match(/^([01]\d|2[0-3])([0-5]\d){2}$/)) return false; // HHMMSS

  // Exclude codes that are all the same digit (e.g., 000000, 111111)
  if (/^(\d)\1+$/.test(code)) return false;

  // Exclude sequential numbers (e.g., 123456, 987654)
  const digits = code.split('').map(Number);
  const isSequential = digits.every(
    (digit, i) => i === 0 || digit === digits[i - 1] + 1 || digit === digits[i - 1] - 1,
  );
  if (isSequential && code.length >= 4) return false;

  return true;
};

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

export const detectOTPFromEmail = (message: ParsedMessage): OTPCode | null => {
  if (!message.subject && !message.body) return null;

  const otpKeywords = [
    'verification code',
    'verify',
    'otp',
    'one-time',
    '2fa',
    'two-factor',
    'security code',
    'confirmation code',
    'access code',
    'login code',
  ];

  const content = `${message.subject} ${message.decodedBody}`.toLowerCase();
  const hasOTPKeyword = otpKeywords.some((keyword) => content.includes(keyword));

  if (!hasOTPKeyword) return null;

  let code: string | null = null;
  const bodyText = message.decodedBody || message.body || '';

  for (const pattern of OTP_PATTERNS) {
    const match = bodyText.match(pattern);
    if (match && match[1]) {
      const potentialCode = match[1].replace(/[-\s]/g, '');
      if (isValidOTPCode(potentialCode)) {
        code = potentialCode;
        break;
      }
    }
  }

  if (!code) return null;

  let service = 'Unknown Service';
  const fromEmail = message.sender?.email || '';
  const fromName = message.sender?.name || '';

  for (const [serviceName, patterns] of Object.entries(SERVICE_PATTERNS)) {
    if (
      patterns.some(
        (pattern) =>
          pattern.test(fromEmail) || pattern.test(fromName) || pattern.test(message.subject || ''),
      )
    ) {
      service = serviceName;
      break;
    }
  }

  if (service === 'Unknown Service' && message.sender?.name) {
    service = message.sender.name.split(' ')[0];
  }

  const receivedAt = new Date(message.receivedOn);
  const expiresAt = new Date(receivedAt.getTime() + 10 * 60 * 1000); // 10 minutes
  const isExpired = new Date() > expiresAt;

  return {
    id: `${message.id}-otp`,
    code,
    service,
    threadId: message.threadId || message.id,
    from: fromEmail,
    subject: message.subject || '',
    receivedAt,
    expiresAt,
    isExpired,
  };
};
