#!/bin/bash
# Mail-Zero Vault Credentials Setup
# Run this as admin on lair404

VAULT_SKIP_VERIFY=1 vault kv put secret/lair404/mail-zero \
  POSTGRES_USER='mailzero' \
  POSTGRES_PASSWORD='kH6+b8ZXLMKRwwlNoTpJZ11AWPxs85iD5uqTKM4rtSg=' \
  POSTGRES_DB='mailzero' \
  REDIS_URL='http://mail-zero-upstash-proxy:80' \
  REDIS_TOKEN='NZkCcRENqWgaCgHrXgaYIEwk6vdI3FapU/Tx2tcH6I0=' \
  GROQ_API_KEY='placeholder_will_use_litellm' \
  OPENAI_API_KEY='placeholder_will_use_litellm' \
  OPENAI_MODEL='gpt-4o' \
  OPENAI_MINI_MODEL='gpt-4o-mini' \
  AI_SYSTEM_PROMPT='You are a helpful email assistant for lair404.xyz mail system.'

echo "✅ Credentials stored in Vault at secret/lair404/mail-zero"
