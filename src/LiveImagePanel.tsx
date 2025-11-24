import React, { useEffect, useRef, useState, useCallback } from 'react';
import { PanelProps } from '@grafana/data';
import { DEBUG, validateWebSocketUrl, formatBytes, getWebSocketState } from './utils/debug';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface LiveImagePanelOptions {
  wsUrl: string;
  reconnectDelay: number;
  imageFormat: 'auto' | 'image/jpeg' | 'image/png' | 'image/webp';
  showStatusIndicator: boolean;
  objectFit: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
}

interface Props extends PanelProps<LiveImagePanelOptions> {}

export const LiveImagePanel: React.FC<Props> = ({ options, width, height }) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const currentImageUrlRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [imageCount, setImageCount] = useState(0);

  // Cleanup function to revoke object URLs and prevent memory leaks
  const cleanupImageUrl = useCallback(() => {
    if (currentImageUrlRef.current) {
      URL.revokeObjectURL(currentImageUrlRef.current);
      currentImageUrlRef.current = null;
    }
  }, []);

  // Determine image MIME type based on options
  const getImageMimeType = useCallback((data: ArrayBuffer): string => {
    if (options.imageFormat !== 'auto') {
      return options.imageFormat;
    }

    // Try to detect format from magic bytes
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
    
    // Default to JPEG if detection fails
    return 'image/jpeg';
  }, [options.imageFormat]);

  const connect = useCallback(() => {
    // Clean up any existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (!options.wsUrl || options.wsUrl.trim() === '') {
      setConnectionStatus('error');
      setErrorMessage('WebSocket URL is required');
      DEBUG.error("WebSocket URL is empty");
      return;
    }

    // Validate URL format
    const validation = validateWebSocketUrl(options.wsUrl);
    if (!validation.valid) {
      setConnectionStatus('error');
      setErrorMessage(validation.error || 'Invalid WebSocket URL');
      DEBUG.error("Invalid WebSocket URL:", validation.error);
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
            DEBUG.warn("Received non-binary data");
            return;
          }

          const dataSize = event.data.byteLength;
          DEBUG.log(`Received image data: ${formatBytes(dataSize)}`);
          
          const mimeType = getImageMimeType(event.data);
          DEBUG.log(`Detected image format: ${mimeType}`);
          
          const blob = new Blob([event.data], { type: mimeType });
          
          // Clean up previous image URL to prevent memory leaks
          cleanupImageUrl();
          
          const url = URL.createObjectURL(blob);
          currentImageUrlRef.current = url;
          
          if (imgRef.current) {
            imgRef.current.src = url;
            setImageCount(prev => {
              const newCount = prev + 1;
              DEBUG.log(`Image displayed (total: ${newCount})`);
              return newCount;
            });
          }
        } catch (error) {
          DEBUG.error("Error processing image:", error);
          setErrorMessage(`Error processing image: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      };

      ws.onclose = (event) => {
        DEBUG.log(`Disconnected - Code: ${event.code}, Reason: ${event.reason || 'none'}`);
        setConnectionStatus('disconnected');
        
        // Only auto-reconnect if it wasn't a manual close (code 1000)
        if (event.code !== 1000) {
          DEBUG.log(`Retrying in ${options.reconnectDelay}ms...`);
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, options.reconnectDelay);
        } else {
          DEBUG.log("Manual close, not reconnecting");
        }
      };

      ws.onerror = (error) => {
        DEBUG.error("WebSocket error:", error);
        DEBUG.error(`WebSocket state: ${getWebSocketState(ws)}`);
        setConnectionStatus('error');
        setErrorMessage(`Connection error: ${options.wsUrl}`);
        ws.close();
      };

      wsRef.current = ws;
    } catch (error) {
      DEBUG.error("Failed to create WebSocket:", error);
      setConnectionStatus('error');
      setErrorMessage(`Failed to connect: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [options.wsUrl, options.reconnectDelay, getImageMimeType, cleanupImageUrl]);

  // Effect to handle connection lifecycle
  useEffect(() => {
    connect();
    
    return () => {
      // Cleanup on unmount or when dependencies change
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      
      cleanupImageUrl();
    };
  }, [connect, cleanupImageUrl]);

  // Get status indicator color
  const getStatusColor = (status: ConnectionStatus): string => {
    switch (status) {
      case 'connected':
        return '#73bf69'; // Green
      case 'connecting':
        return '#f2cc0c'; // Yellow
      case 'error':
        return '#d44a3a'; // Red
      default:
        return '#808080'; // Gray
    }
  };

  // Get status text
  const getStatusText = (status: ConnectionStatus): string => {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'error':
        return 'Error';
      default:
        return 'Disconnected';
    }
  };

  // Status dot animation style
  const statusDotStyle: React.CSSProperties = {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    display: 'inline-block',
    backgroundColor: getStatusColor(connectionStatus),
    animation: 'pulse 2s infinite',
  };

  return (
    <>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {options.showStatusIndicator && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '8px',
            background: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            fontSize: '12px',
            zIndex: 10,
            gap: '4px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={statusDotStyle} />
              <span style={{ fontWeight: 500 }}>{getStatusText(connectionStatus)}</span>
              {imageCount > 0 && (
                <span style={{ marginLeft: 'auto', opacity: 0.8 }}>Images: {imageCount}</span>
              )}
            </div>
            {errorMessage && (
              <div
                style={{
                  color: '#ff6b6b',
                  fontSize: '11px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={errorMessage}
              >
                ⚠ {errorMessage}
              </div>
            )}
          </div>
        )}
        <div style={{
          flex: 1,
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          background: '#000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}>
          <img
            ref={imgRef}
            style={{
              width: '100%',
              height: '100%',
              objectFit: options.objectFit,
              background: '#000',
            }}
            alt="Live stream"
            onError={() => {
              DEBUG.error("Image load error");
              setErrorMessage('Failed to load image');
              setConnectionStatus('error');
            }}
          />
          {!imgRef.current?.src && connectionStatus === 'connected' && (
            <div style={{
              position: 'absolute',
              color: '#888',
              fontSize: '14px',
              textAlign: 'center',
            }}>
              Waiting for image data...
            </div>
          )}
        </div>
      </div>
    </>
  );
};
