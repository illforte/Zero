import { useCallback, useEffect, useState } from 'react';

const USED_MAGIC_LINKS_KEY = 'usedMagicLinks';

export function useMagicLinks() {
  const [usedLinks, setUsedLinks] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const stored = localStorage.getItem(USED_MAGIC_LINKS_KEY);
      if (stored) {
        setUsedLinks(new Set(JSON.parse(stored)));
      }
    } catch (error) {
      console.error('Failed to load used magic links:', error);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(USED_MAGIC_LINKS_KEY, JSON.stringify([...usedLinks]));
    } catch (error) {
      console.error('Failed to save used magic links:', error);
    }
  }, [usedLinks]);

  const markAsUsed = useCallback((linkId: string) => {
    setUsedLinks((prev) => new Set([...prev, linkId]));
  }, []);

  const isLinkUsed = useCallback(
    (linkId: string) => {
      return usedLinks.has(linkId);
    },
    [usedLinks],
  );

  const clearAll = useCallback(() => {
    setUsedLinks(new Set());
  }, []);

  return {
    markAsUsed,
    isLinkUsed,
    clearAll,
    usedLinks,
  };
}
