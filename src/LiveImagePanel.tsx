import React, { useEffect, useRef, useState, useCallback } from 'react';
import { PanelProps } from '@grafana/data';
import { DEBUG, validateWebSocketUrl } from './utils/debug';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface LiveImagePanelOptions {
  wsUrl: string;
  reconnectDelay: number;
  showStatusIndicator: boolean;
  objectFit: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
}

interface Props extends PanelProps<LiveImagePanelOptions> {}

export const LiveImagePanel: React.FC<Props> = ({ options }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fpsMetrics, setFpsMetrics] = useState({ rxFps: 0, txFps: 0 });

  // High-performance mutable refs for FPS tracking
  const lastFpsUpdateRef = useRef<number>(Date.now());
  const rxFrameCountRef = useRef<number>(0);
  const txFrameCountRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  // 1. FPS Tracking Loop (Runs on animation frame to update UI occasionally)
  useEffect(() => {
    const updateFps = () => {
      const now = Date.now();
      const elapsed = now - lastFpsUpdateRef.current;

      // Update UI metrics every 1 second
      if (elapsed >= 1000) {
        setFpsMetrics({
          rxFps: Math.round((rxFrameCountRef.current * 1000) / elapsed),
          txFps: Math.round((txFrameCountRef.current * 1000) / elapsed)
        });

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

  // 2. High-Speed Bitmap Drawing
  const drawBitmap = useCallback((bitmap: ImageBitmap) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      bitmap.close();
      return;
    }

    // Resize canvas if needed (expensive, only happens on dimension change)
    if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
    }

    // Optimized 2D context
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (ctx) {
      ctx.drawImage(bitmap, 0, 0);
      txFrameCountRef.current++;
    }
    bitmap.close();
  }, []);

  // 3. WebSocket Connection & Data Handling
  const connect = useCallback(() => {
    // Cleanup existing
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (!options.wsUrl) {
      setConnectionStatus('error');
      setErrorMessage('WebSocket URL required');
      return;
    }

    const validation = validateWebSocketUrl(options.wsUrl);
    if (!validation.valid) {
      setConnectionStatus('error');
      setErrorMessage(validation.error || 'Invalid URL');
      return;
    }

    try {
      setConnectionStatus('connecting');
      setErrorMessage(null);
      
      const ws = new WebSocket(options.wsUrl);
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        DEBUG.log("Connected to", options.wsUrl);
        setConnectionStatus('connected');
        setErrorMessage(null);
      };

      // FAST PATH: Receive -> Blob -> Bitmap -> Draw
      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          rxFrameCountRef.current++;
          
          // Assume JPEG for maximum speed (no detection overhead)
          const blob = new Blob([event.data], { type: 'image/jpeg' });
          
          // createImageBitmap decodes off main thread
          createImageBitmap(blob)
            .then(drawBitmap)
            .catch(e => {
              // Only log occasional errors to avoid console flood
              if (rxFrameCountRef.current % 100 === 0) {
                DEBUG.error("Frame drop:", e);
              }
            });
        }
      };

      ws.onclose = (event) => {
        setConnectionStatus('disconnected');
        if (event.code !== 1000) {
          reconnectTimeoutRef.current = setTimeout(connect, options.reconnectDelay);
        }
      };

      ws.onerror = () => {
        setConnectionStatus('error');
        ws.close();
      };

      wsRef.current = ws;
    } catch (error) {
      setConnectionStatus('error');
      setErrorMessage('Connection failed');
    }
  }, [options.wsUrl, options.reconnectDelay, drawBitmap]);

  // 4. Lifecycle Management
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

  // Helpers for UI
  const getStatusColor = (status: ConnectionStatus) => {
    switch (status) {
      case 'connected': return '#73bf69';
      case 'connecting': return '#f2cc0c';
      case 'error': return '#d44a3a';
      default: return '#808080';
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#000', position: 'relative' }}>
      
      {/* Optional Status Overlay */}
      {options.showStatusIndicator && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          padding: '4px 8px', background: 'rgba(0,0,0,0.6)', 
          color: '#fff', fontSize: '11px', zIndex: 10,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%',
              backgroundColor: getStatusColor(connectionStatus)
            }} />
            <span>{connectionStatus}</span>
            {connectionStatus === 'connected' && (
              <span style={{ opacity: 0.8, marginLeft: '8px' }}>
                RX: {fpsMetrics.rxFps} / TX: {fpsMetrics.txFps} fps
              </span>
            )}
          </div>
          {errorMessage && <div style={{ color: '#ff6b6b' }}>{errorMessage}</div>}
        </div>
      )}

      {/* High Performance Canvas */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <canvas
          ref={canvasRef}
          style={{
            maxWidth: '100%', maxHeight: '100%',
            objectFit: options.objectFit
          }}
        />
        {connectionStatus !== 'connected' && (
          <div style={{ position: 'absolute', color: '#666' }}>Waiting for stream...</div>
        )}
      </div>
    </div>
  );
};
