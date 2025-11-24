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
  
  info: (message: string, ...args: any[]) => {
    if (DEBUG.enabled) {
      console.info(`[LiveImagePanel] ${message}`, ...args);
    }
  },
  
  // Enable debug mode from browser console: window.__GRAFANA_LIVE_IMAGE_DEBUG__ = true
  enable: () => {
    if (typeof window !== 'undefined') {
      (window as any).__GRAFANA_LIVE_IMAGE_DEBUG__ = true;
      DEBUG.enabled = true;
      console.log('[LiveImagePanel] Debug mode enabled');
    }
  },
  
  disable: () => {
    if (typeof window !== 'undefined') {
      (window as any).__GRAFANA_LIVE_IMAGE_DEBUG__ = false;
      DEBUG.enabled = false;
      console.log('[LiveImagePanel] Debug mode disabled');
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

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return '0 Bytes';
  }
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Get WebSocket ready state as string
 */
export function getWebSocketState(ws: WebSocket | null): string {
  if (!ws) {
    return 'NULL';
  }
  
  const states = {
    0: 'CONNECTING',
    1: 'OPEN',
    2: 'CLOSING',
    3: 'CLOSED',
  };
  
  return states[ws.readyState as keyof typeof states] || 'UNKNOWN';
}

