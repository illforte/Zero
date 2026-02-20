import type { MailManager, ManagerConfig } from './types.js';
import { ImapMailManager } from './imap.js';
import { GoogleMailManager } from './google.js';

const supportedProviders = {
  imap: ImapMailManager,
  google: GoogleMailManager,
};

export const createDriver = (
  provider: keyof typeof supportedProviders | (string & {}),
  config: ManagerConfig,
): MailManager => {
  const Provider = supportedProviders[provider as keyof typeof supportedProviders];
  if (!Provider) throw new Error(`Provider not supported: ${provider}`);
  return new Provider(config);
};
