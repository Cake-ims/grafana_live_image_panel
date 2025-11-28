#!/usr/bin/env python3
"""
WebSocket Benchmark Server (Sender).
Listens for WebSocket connections and streams messages/images to connected clients.

Usage:
    python benchmark_ws_sender.py [--port PORT] [--size BYTES] [--fps FPS]
"""

import asyncio
import websockets
import argparse
import time
from PIL import Image
from pathlib import Path
import cv2
import numpy as np
import io
import os
import sys

def load_bmp_and_convert_to_jpeg_bytes(image_path, quality=50):
    """Load BMP image from file, convert to 8-bit grayscale, compress to JPEG, return bytes"""
    try:
        # Load BMP image
        img = Image.open(image_path)
        
        # Get original dimensions
        original_width, original_height = img.size
        print(f"  Loaded BMP: {Path(image_path).name} ({original_width}x{original_height})")
        
        # Convert to 8-bit grayscale (mode 'L')
        if img.mode != 'L':
            img = img.convert('L')
            print(f"  Converted to 8-bit grayscale")
        
        # Compress to JPEG grayscale with specified quality
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='JPEG', quality=quality, optimize=False)
        jpeg_data = img_bytes.getvalue()
        
        print(f"  JPEG compressed size: {len(jpeg_data)/1024:.2f} KB (quality={quality})")
        
        return jpeg_data

    except Exception as e:
        print(f"Error loading/converting BMP image {image_path}: {e}")
        raise

async def handle_client(websocket, payload, fps):
    client_addr = websocket.remote_address
    print(f"Client connected from {client_addr}")
    
    target_interval = 1.0 / fps if fps > 0 else 0
    messages = 0
    bytes_sent = 0
    start_time = time.time()
    last_report_time = start_time
    
    try:
        while True:
            loop_start = time.time()
            
            await websocket.send(payload)
            messages += 1
            bytes_sent += len(payload)
            
            current_time = time.time()
            
            # Report every second
            if current_time - last_report_time >= 1.0:
                elapsed = current_time - last_report_time
                msg_rate = (messages / elapsed) if elapsed > 0 else 0
                data_rate_mbps = (bytes_sent * 8) / (elapsed * 1_000_000)
                
                print(f"Sending to {client_addr}: {msg_rate:.0f} msg/sec | {data_rate_mbps:.2f} Mbps")
                
                messages = 0
                bytes_sent = 0
                last_report_time = current_time
            
            # FPS limiting
            if target_interval > 0:
                elapsed_loop = time.time() - loop_start
                sleep_time = target_interval - elapsed_loop
                if sleep_time > 0:
                    await asyncio.sleep(sleep_time)
            else:
                # Yield control to event loop if unlimited
                await asyncio.sleep(0)
                
    except websockets.exceptions.ConnectionClosed as e:
        print(f"Client {client_addr} disconnected - Code: {e.code}, Reason: {e.reason}")
    except Exception as e:
        import traceback
        print(f"Error handling client {client_addr}: {e}")
        traceback.print_exc()

async def start_server(host, port, payload, fps):
    print(f"Starting WebSocket Benchmark Server on ws://{host}:{port}")
    if fps > 0:
        print(f"Target FPS: {fps}")
    else:
        print("Target FPS: Unlimited")
        
    async with websockets.serve(lambda ws: handle_client(ws, payload, fps), host, port):
        await asyncio.Future()  # run forever

def main():
    parser = argparse.ArgumentParser(description='WebSocket Benchmark Server (Sender)')
    parser.add_argument('--port', type=int, default=8765, help='Port to listen on (default: 8765)')
    parser.add_argument('--host', type=str, default='localhost', help='Host interface (default: localhost)')
    parser.add_argument('--size', type=int, default=1024, help='Message size in bytes (default: 1024)')
    parser.add_argument('--fps', type=float, default=0, help='Target FPS (0 for unlimited)')
    
    args = parser.parse_args()
    
    # Pre-generate payload
    try:
        payload = load_bmp_and_convert_to_jpeg_bytes(image_path=".\images\RRR_beforeCell_hAOD76_2025-08-05.bmp", quality=50)
        print(f"Loaded image payload size: {len(payload)} bytes")
    except Exception:
        print("Failed to load specific image, falling back to random bytes")
        payload = os.urandom(args.size)
        print(f"Generated random payload size: {len(payload)} bytes")
    
    try:
        asyncio.run(start_server(args.host, args.port, payload, args.fps))
    except KeyboardInterrupt:
        print("\nServer stopped")

if __name__ == "__main__":
    main()

