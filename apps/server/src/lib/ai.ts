import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { env } from '../env';

export const getOpenAI = () => {
  return createOpenAI({
    apiKey: env.LITELLM_VIRTUAL_KEY || env.OPENAI_API_KEY,
    baseURL: env.LITELLM_BASE_URL,
  });
};

export const getAnthropic = () => {
  return createAnthropic({
    apiKey: env.ANTHROPIC_API_KEY,
  });
};

export const getModel = (modelName?: string) => {
  if (env.USE_OPENAI === 'true') {
    return getOpenAI()(modelName || env.OPENAI_MODEL || 'gpt-4o');
  }
  return getAnthropic()(modelName || env.OPENAI_MODEL || 'claude-3-7-sonnet-20250219');
};

export const getMiniModel = (modelName?: string) => {
  if (env.USE_OPENAI === 'true') {
    return getOpenAI()(modelName || env.OPENAI_MINI_MODEL || 'gpt-4o-mini');
  }
  return getAnthropic()(modelName || env.OPENAI_MINI_MODEL || 'claude-3-haiku-20240307');
};
