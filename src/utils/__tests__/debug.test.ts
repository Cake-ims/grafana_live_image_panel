/**
 * Tests for debugging utilities
 */

import { validateWebSocketUrl } from '../debug';

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
