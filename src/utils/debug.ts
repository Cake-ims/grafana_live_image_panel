/**
 * Debugging utilities for Live Image Panel
 */

export const DEBUG = {
  enabled: typeof window !== 'undefined' && (window as any).__GRAFANA_LIVE_IMAGE_DEBUG__ === true,
  
  log: (message: string, ...args: any[]) => {
    if (DEBUG.enabled) {
      console.log(`[LiveImagePanel] ${message}`, ...args);
    }
  },
  
  error: (message: string, ...args: any[]) => {
    if (DEBUG.enabled) {
      console.error(`[LiveImagePanel] ${message}`, ...args);
    }
  },
  
  warn: (message: string, ...args: any[]) => {
    if (DEBUG.enabled) {
      console.warn(`[LiveImagePanel] ${message}`, ...args);
    }
  },
};

/**
 * Validate WebSocket URL format
 */
export function validateWebSocketUrl(url: string): { valid: boolean; error?: string } {
  if (!url || url.trim() === '') {
    return { valid: false, error: 'URL is required' };
  }
  
  try {
    const urlObj = new URL(url);
    if (urlObj.protocol !== 'ws:' && urlObj.protocol !== 'wss:') {
      return { valid: false, error: 'URL must use ws:// or wss:// protocol' };
    }
    return { valid: true };
  } catch (e) {
    return { valid: false, error: 'Invalid URL format' };
  }
}
