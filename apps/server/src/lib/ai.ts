import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { env } from '../env';

export interface ModelMetadata {
  user_id?: string;
  session_id?: string;
  trace_id?: string;
  project?: string;
  tags?: string[];
  [key: string]: any;
}

export const getOpenAI = (metadata?: ModelMetadata) => {
  const headers: Record<string, string> = {
    'x-litellm-metadata': JSON.stringify({
      project: metadata?.project || 'mail-zero',
      user_id: metadata?.user_id,
      session_id: metadata?.session_id,
      ...metadata,
    }),
  };

  if (metadata?.user_id) {
    headers['x-litellm-user-id'] = metadata.user_id;
  }

  return createOpenAI({
    apiKey: env.LITELLM_VIRTUAL_KEY || env.OPENAI_API_KEY,
    baseURL: env.LITELLM_BASE_URL,
    headers,
  });
};

export const getAnthropic = () => {
  return createAnthropic({
    apiKey: env.ANTHROPIC_API_KEY,
  });
};

export const getModel = (modelName?: string, metadata?: ModelMetadata) => {
  if (env.USE_ANTHROPIC === 'true') {
    return getAnthropic()(modelName || env.OPENAI_MODEL || 'claude-3-7-sonnet-20250219');
  }
  return getOpenAI(metadata)(modelName || env.OPENAI_MODEL || 'gpt-4o');
};

export const getMiniModel = (modelName?: string, metadata?: ModelMetadata) => {
  if (env.USE_ANTHROPIC === 'true') {
    return getAnthropic()(modelName || env.OPENAI_MINI_MODEL || 'claude-3-haiku-20240307');
  }
  return getOpenAI(metadata)(modelName || env.OPENAI_MINI_MODEL || 'gpt-4o-mini');
};
