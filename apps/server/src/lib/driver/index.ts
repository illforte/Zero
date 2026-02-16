import { GoogleMailManager } from './google';
import { Lair404MailManager } from './lair404';
import { OutlookMailManager } from './microsoft';
import type { MailManager, ManagerConfig } from './types';

const supportedProviders = {
  google: GoogleMailManager,
  microsoft: OutlookMailManager,
  lair404: Lair404MailManager,
};

export const createDriver = (
  provider: keyof typeof supportedProviders | (string & {}),
  config: ManagerConfig,
): MailManager => {
  const Provider = supportedProviders[provider as keyof typeof supportedProviders];
  if (!Provider) throw new Error('Provider not supported');
  return new Provider(config);
};
