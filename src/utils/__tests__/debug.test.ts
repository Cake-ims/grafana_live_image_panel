/**
 * Tests for debugging utilities
 */

import { validateWebSocketUrl, formatBytes, getWebSocketState } from '../debug';

describe('validateWebSocketUrl', () => {
  it('should validate correct ws:// URLs', () => {
    expect(validateWebSocketUrl('ws://localhost:8765')).toEqual({ valid: true });
    expect(validateWebSocketUrl('ws://example.com/path')).toEqual({ valid: true });
  });

  it('should validate correct wss:// URLs', () => {
    expect(validateWebSocketUrl('wss://secure.example.com')).toEqual({ valid: true });
  });

  it('should reject empty URLs', () => {
    const result = validateWebSocketUrl('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('URL is required');
  });

  it('should reject non-WebSocket protocols', () => {
    const result = validateWebSocketUrl('http://example.com');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('ws:// or wss://');
  });

  it('should reject invalid URL formats', () => {
    const result = validateWebSocketUrl('not-a-url');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid URL format');
  });
});

describe('formatBytes', () => {
  it('should format bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 Bytes');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1048576)).toBe('1 MB');
  });
});

describe('getWebSocketState', () => {
  it('should return NULL for null WebSocket', () => {
    expect(getWebSocketState(null)).toBe('NULL');
  });

  it('should return state string for WebSocket', () => {
    const ws = new WebSocket('ws://localhost');
    const state = getWebSocketState(ws);
    expect(['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']).toContain(state);
    ws.close();
  });
});

