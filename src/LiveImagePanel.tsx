import React, { useEffect, useRef, useState, useCallback } from 'react';
import { PanelProps } from '@grafana/data';
import { DEBUG, validateWebSocketUrl } from './utils/debug';
import UTIF from 'utif';
import lz4 from 'lz4js';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface LiveImagePanelOptions {
  wsUrl: string;
  reconnectDelay: number;
  imageFormat: 'auto' | 'image/jpeg' | 'image/png' | 'image/webp' | 'image/tiff' | 'image/bmp' | 'image/lz4';
  showStatusIndicator: boolean;
  objectFit: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
}

interface Props extends PanelProps<LiveImagePanelOptions> {}

// Helper to create BMP header for raw RGB data
const createBmpHeader = (width: number, height: number): Uint8Array => {
  const rowPadding = (4 - (width * 3) % 4) % 4;
  const fileSize = 54 + (width * 3 + rowPadding) * height;
  const header = new Uint8Array(54);
  const view = new DataView(header.buffer);

  // File Header
  header[0] = 0x42; // B
  header[1] = 0x4D; // M
  view.setUint32(2, fileSize, true); // File size
  view.setUint32(10, 54, true); // Offset

  // Info Header
  view.setUint32(14, 40, true); // Header size
  view.setInt32(18, width, true); // Width
  view.setInt32(22, -height, true); // Height (negative for top-down)
  view.setUint16(26, 1, true); // Planes
  view.setUint16(28, 24, true); // BPP
  
  return header;
};

export const LiveImagePanel: React.FC<Props> = ({ options, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // const [imageCount, setImageCount] = useState(0); // Not used in render for performance
  const [fpsMetrics, setFpsMetrics] = useState({ rxFps: 0, txFps: 0 });

  // Refs for FPS calculation
  const lastFpsUpdateRef = useRef<number>(Date.now());
  const rxFrameCountRef = useRef<number>(0);
  const txFrameCountRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  // Default dimensions for LZ4/Raw mode (should optimally be configurable or sent in initial handshake)
  // For now assuming 4K or matching container, but raw stream usually implies fixed size known by client
  // or we parse it from the first frame if we add a custom header. 
  // IMPORTANT: For LZ4 raw stream, we need to know dimensions to reconstruct BMP header.
  // We will assume 3840x2160 (4K) as requested, OR parse a custom header from server if implemented.
  // For simplicity in this iteration: We'll infer from the buffer size assuming 4K, 
  // or add a small metadata header in the protocol. 
  // A better approach for "Raw" without metadata is to assume the server sends standard resolutions.
  
  // Update: We'll try to guess 4K, 1080p, etc based on size, or default to 640x480.
  const guessDimensions = (byteLength: number): { w: number, h: number } | null => {
    // 3 bytes per pixel
    const pixels = byteLength / 3;
    if (pixels === 3840 * 2160) { return { w: 3840, h: 2160 }; } // 4K
    if (pixels === 1920 * 1080) { return { w: 1920, h: 1080 }; } // 1080p
    if (pixels === 1280 * 720) { return { w: 1280, h: 720 }; }   // 720p
    if (pixels === 640 * 480) { return { w: 640, h: 480 }; }     // VGA
    return null;
  };

  // FPS Calculation loop
  useEffect(() => {
    const updateFps = () => {
      const now = Date.now();
      const elapsed = now - lastFpsUpdateRef.current;

      // Update every ~1 second
      if (elapsed >= 1000) {
        const rxFps = Math.round((rxFrameCountRef.current * 1000) / elapsed);
        const txFps = Math.round((txFrameCountRef.current * 1000) / elapsed);

        setFpsMetrics({ rxFps, txFps });

        // Reset counters
        rxFrameCountRef.current = 0;
        txFrameCountRef.current = 0;
        lastFpsUpdateRef.current = now;
      }

      animationFrameRef.current = requestAnimationFrame(updateFps);
    };

    animationFrameRef.current = requestAnimationFrame(updateFps);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Draw Bitmap to Canvas
  const drawBitmap = useCallback((bitmap: ImageBitmap) => {
    const canvas = canvasRef.current;
    if (!canvas) {
        bitmap.close();
        return;
    }

    // Match canvas size to image size (or container size)
    // For performance, better to keep canvas size fixed or responsive
    if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
    }

    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true }); // Optimized context
    if (ctx) {
        ctx.drawImage(bitmap, 0, 0);
        txFrameCountRef.current += 1;
        
        // setImageCount(prev => {
        //     const newCount = prev + 1;
        //     // Only log every 100 frames to reduce noise at 60fps
        //     if (newCount % 100 === 0) {
        //         DEBUG.log(`Image displayed (total: ${newCount})`);
        //     }
        //     return newCount;
        // });
    }
    bitmap.close();
  }, []);

  // Determine image MIME type based on options
  const getImageMimeType = useCallback((data: ArrayBuffer): string => {
    if (options.imageFormat !== 'auto') {
      return options.imageFormat;
    }

    const bytes = new Uint8Array(data.slice(0, 4));
    
    // JPEG: FF D8 FF
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return 'image/jpeg';
    }
    
    // PNG: 89 50 4E 47
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return 'image/png';
    }
    
    // WebP: RIFF...WEBP
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
      const webpCheck = new Uint8Array(data.slice(8, 12));
      if (String.fromCharCode(...webpCheck) === 'WEBP') {
        return 'image/webp';
      }
    }
    
    // TIFF: II (Intel) or MM (Motorola)
    if ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2A && bytes[3] === 0x00) ||
        (bytes[0] === 0x4D && bytes[1] === 0x4D && bytes[2] === 0x00 && bytes[3] === 0x2A)) {
      return 'image/tiff';
    }
    
    // Default to JPEG if detection fails
    return 'image/jpeg';
  }, [options.imageFormat]);

  // Decode TIFF to ImageBitmap (Optimized)
  const decodeTiffToBitmap = useCallback((data: ArrayBuffer): Promise<ImageBitmap> => {
    return new Promise((resolve, reject) => {
      try {
        const ifds = UTIF.decode(data);
        if (!ifds || ifds.length === 0) {
          reject(new Error('Invalid TIFF data'));
          return;
        }

        const page = ifds[0];
        UTIF.decodeImage(data, page);
        const rgba = UTIF.toRGBA8(page);
        const imageData = new ImageData(new Uint8ClampedArray(rgba), page.width, page.height);
        
        createImageBitmap(imageData).then(resolve).catch(reject);
      } catch (e) {
        reject(e);
      }
    });
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (!options.wsUrl || options.wsUrl.trim() === '') {
      setConnectionStatus('error');
      setErrorMessage('WebSocket URL is required');
      return;
    }

    const validation = validateWebSocketUrl(options.wsUrl);
    if (!validation.valid) {
      setConnectionStatus('error');
      setErrorMessage(validation.error || 'Invalid WebSocket URL');
      return;
    }

    try {
      setConnectionStatus('connecting');
      setErrorMessage(null);
      DEBUG.log(`Connecting to ${options.wsUrl}...`);
      
      const ws = new WebSocket(options.wsUrl);
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        DEBUG.log("Connected to", options.wsUrl);
        setConnectionStatus('connected');
        setErrorMessage(null);
      };

      ws.onmessage = (event) => {
        try {
            if (!(event.data instanceof ArrayBuffer)) {
                return;
            }
            const data = event.data;
            // const dataSize = data.byteLength;
            rxFrameCountRef.current += 1;

            // Handle LZ4 Decompression
            if (options.imageFormat === 'image/lz4') {
                try {
                    // Decompress
                    // lz4js expects Uint8Array
                    const decompressed = lz4.decompress(new Uint8Array(data));
                    
                    // Reconstruct BMP
                    const dims = guessDimensions(decompressed.byteLength);
                    if (!dims) {
                         throw new Error(`Unknown raw image dimensions: ${decompressed.byteLength} bytes`);
                    }
                    
                    // Combine Header + Decompressed Data
                    const header = createBmpHeader(dims.w, dims.h);
                    const bmpData = new Uint8Array(header.byteLength + decompressed.byteLength);
                    bmpData.set(header);
                    bmpData.set(decompressed, header.byteLength);
                    
                    const blob = new Blob([bmpData], { type: 'image/bmp' });
                    createImageBitmap(blob).then(drawBitmap).catch(e => DEBUG.error("Bitmap creation failed", e));
                    
                } catch (e) {
                    DEBUG.error("LZ4 Decompression error", e);
                }
                return;
            }

            // Handle Raw BMP (Uncompressed) - Optimized
            if (options.imageFormat === 'image/bmp') {
                const blob = new Blob([data], { type: 'image/bmp' });
                createImageBitmap(blob).then(drawBitmap).catch(e => DEBUG.error("Bitmap creation failed", e));
                return;
            }

            // Handle Standard Formats (JPEG, PNG, WebP, TIFF)
            const mimeType = getImageMimeType(data);
            
            if (mimeType === 'image/tiff') {
                decodeTiffToBitmap(data).then(drawBitmap).catch(e => DEBUG.error("TIFF decode failed", e));
            } else {
                // Optimized path for JPEG/PNG using createImageBitmap directly from Blob
                const blob = new Blob([data], { type: mimeType });
                createImageBitmap(blob).then(drawBitmap).catch(e => DEBUG.error("Bitmap creation failed", e));
            }

        } catch (error) {
          DEBUG.error("Error processing image:", error);
        }
      };

      ws.onclose = (event) => {
        setConnectionStatus('disconnected');
        if (event.code !== 1000) {
          reconnectTimeoutRef.current = setTimeout(connect, options.reconnectDelay);
        }
      };

      ws.onerror = (error) => {
        setConnectionStatus('error');
        setErrorMessage(`Connection error: ${options.wsUrl}`);
        ws.close();
      };

      wsRef.current = ws;
    } catch (error) {
      setConnectionStatus('error');
      setErrorMessage(`Failed to connect: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [options.wsUrl, options.reconnectDelay, options.imageFormat, getImageMimeType, decodeTiffToBitmap, drawBitmap]);

  // Effect to handle connection lifecycle
  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  // Get status indicator color
  const getStatusColor = (status: ConnectionStatus): string => {
    switch (status) {
      case 'connected': return '#73bf69';
      case 'connecting': return '#f2cc0c';
      case 'error': return '#d44a3a';
      default: return '#808080';
    }
  };

  // Get status text
  const getStatusText = (status: ConnectionStatus): string => {
    switch (status) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      case 'error': return 'Error';
      default: return 'Disconnected';
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {/* Status Bar */}
        {options.showStatusIndicator && (
          <div style={{
            display: 'flex', flexDirection: 'column', padding: '8px',
            background: 'rgba(0, 0, 0, 0.7)', color: 'white', fontSize: '12px', zIndex: 10, gap: '4px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block',
                backgroundColor: getStatusColor(connectionStatus)
              }} />
              <span style={{ fontWeight: 500 }}>{getStatusText(connectionStatus)}</span>
              {connectionStatus === 'connected' && (
                <span style={{ opacity: 0.8, fontSize: '11px', marginLeft: '4px' }}>
                  RX: {fpsMetrics.rxFps} FPS | TX: {fpsMetrics.txFps} FPS
                </span>
              )}
            </div>
            {errorMessage && (
              <div style={{ color: '#ff6b6b', fontSize: '11px' }} title={errorMessage}>
                ⚠ {errorMessage}
              </div>
            )}
          </div>
        )}

        {/* Canvas for Rendering */}
        <div style={{
          flex: 1, width: '100%', height: '100%', overflow: 'hidden', background: '#000',
          display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
        }}>
          <canvas
            ref={canvasRef}
            style={{
              maxWidth: '100%', maxHeight: '100%', objectFit: options.objectFit,
              display: connectionStatus === 'connected' ? 'block' : 'none'
            }}
          />
          {connectionStatus !== 'connected' && (
            <div style={{ color: '#888', fontSize: '14px', position: 'absolute' }}>Waiting for stream...</div>
          )}
        </div>
    </div>
  );
};
