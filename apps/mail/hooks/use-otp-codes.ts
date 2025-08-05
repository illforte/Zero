import { useCallback, useEffect, useState } from 'react';

const COPIED_OTP_CODES_KEY = 'copiedOtpCodes';

export function useCopiedOtpCodes() {
  const [copiedCodes, setCopiedCodes] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const stored = localStorage.getItem(COPIED_OTP_CODES_KEY);
      if (stored) {
        setCopiedCodes(new Set(JSON.parse(stored)));
      }
    } catch (error) {
      console.error('Failed to load copied OTP codes:', error);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(COPIED_OTP_CODES_KEY, JSON.stringify([...copiedCodes]));
    } catch (error) {
      console.error('Failed to save copied OTP codes:', error);
    }
  }, [copiedCodes]);

  const markAsCopied = useCallback((codeId: string) => {
    setCopiedCodes((prev) => new Set([...prev, codeId]));
  }, []);

  const isCodeCopied = useCallback(
    (codeId: string) => {
      return copiedCodes.has(codeId);
    },
    [copiedCodes],
  );

  const clearAll = useCallback(() => {
    setCopiedCodes(new Set());
  }, []);

  return {
    markAsCopied,
    isCodeCopied,
    clearAll,
    copiedCodes,
  };
}
