#!/usr/bin/env python3
"""
Simple WebSocket server for testing the Live Image Panel plugin.
Sends a test image repeatedly over WebSocket.

Usage:
    python test-server.py [--port PORT] [--image PATH] [--fps FPS]

Requirements:
    pip install websockets pillow
"""

import asyncio
import websockets
import argparse
import sys
from pathlib import Path

try:
    from PIL import Image
    import io
except ImportError:
    print("Error: PIL (Pillow) is required. Install with: pip install pillow")
    sys.exit(1)


async def create_test_image(width=640, height=480, frame_num=0):
    """Create a simple test image with frame number"""
    img = Image.new('RGB', (width, height), color=(frame_num % 255, (frame_num * 2) % 255, (frame_num * 3) % 255))
    
    # Add some text/pattern to make it interesting
    from PIL import ImageDraw, ImageFont
    draw = ImageDraw.Draw(img)
    
    # Draw a simple pattern
    for i in range(0, width, 50):
        draw.line([(i, 0), (i, height)], fill=(255, 255, 255), width=2)
    for i in range(0, height, 50):
        draw.line([(0, i), (width, i)], fill=(255, 255, 255), width=2)
    
    # Add frame number text
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 40)
    except:
        font = ImageFont.load_default()
    
    text = f"Frame {frame_num}"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    position = ((width - text_width) // 2, (height - text_height) // 2)
    draw.text(position, text, fill=(255, 255, 255), font=font)
    
    # Convert to JPEG bytes
    img_bytes = io.BytesIO()
    img.save(img_bytes, format='JPEG', quality=85)
    return img_bytes.getvalue()


async def image_server(websocket, path, image_path=None, fps=10):
    """Handle WebSocket connection and send images"""
    client_addr = websocket.remote_address
    print(f"Client connected from {client_addr}")
    
    frame_num = 0
    delay = 1.0 / fps
    
    try:
        # Load static image if provided
        static_image = None
        if image_path and Path(image_path).exists():
            with open(image_path, 'rb') as f:
                static_image = f.read()
            print(f"Using static image: {image_path}")
        else:
            print("Generating dynamic test images")
        
        while True:
            if static_image:
                image_data = static_image
            else:
                image_data = await create_test_image(frame_num=frame_num)
            
            await websocket.send(image_data)
            frame_num += 1
            
            if frame_num % 100 == 0:
                print(f"Sent {frame_num} frames to {client_addr}")
            
            await asyncio.sleep(delay)
            
    except websockets.exceptions.ConnectionClosed:
        print(f"Client {client_addr} disconnected (sent {frame_num} frames)")
    except Exception as e:
        print(f"Error: {e}")


async def main():
    parser = argparse.ArgumentParser(description='WebSocket image server for testing Grafana Live Image Panel')
    parser.add_argument('--port', type=int, default=8765, help='WebSocket server port (default: 8765)')
    parser.add_argument('--host', type=str, default='localhost', help='WebSocket server host (default: localhost)')
    parser.add_argument('--image', type=str, help='Path to image file to send (JPEG/PNG)')
    parser.add_argument('--fps', type=float, default=10, help='Frames per second (default: 10)')
    
    args = parser.parse_args()
    
    print(f"Starting WebSocket image server on ws://{args.host}:{args.port}")
    print(f"FPS: {args.fps}")
    if args.image:
        print(f"Image: {args.image}")
    else:
        print("Mode: Dynamic test image generation")
    print("\nConnect your Grafana panel to: ws://localhost:8765/")
    print("Press Ctrl+C to stop\n")
    
    async with websockets.serve(
        lambda ws, path: image_server(ws, path, args.image, args.fps),
        args.host,
        args.port
    ):
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServer stopped")

