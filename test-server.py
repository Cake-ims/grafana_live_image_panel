#!/usr/bin/env python3
"""
Simple WebSocket server for testing the Live Image Panel plugin.
Sends a test image repeatedly over WebSocket.

Usage:
    python test-server.py [--port PORT] [--image PATH] [--fps FPS] [--mode MODE]

Requirements:
    pip install websockets pillow
"""

import asyncio
import websockets
import argparse
import sys
import struct
from pathlib import Path

try:
    from PIL import Image
    import io
except ImportError:
    print("Error: PIL (Pillow) is required. Install with: pip install pillow")
    sys.exit(1)

try:
    import lz4.frame
except ImportError:
    print("Warning: lz4 module not found. LZ4 compression will not be available.")
    print("Install with: pip install lz4")


def create_bmp_header(width, height):
    """
    Create a standard 54-byte BMP header for a 24-bit RGB image.
    """
    # File Header (14 bytes)
    # 0-1: 'BM'
    # 2-5: File size (header + data)
    # 6-9: Reserved (0)
    # 10-13: Pixel data offset (54)
    
    # Info Header (40 bytes)
    # 14-17: Header size (40)
    # 18-21: Width
    # 22-25: Height (negative for top-down)
    # 26-27: Planes (1)
    # 28-29: Bits per pixel (24)
    # 30-33: Compression (0 = BI_RGB)
    # 34-37: Image size (can be 0 for BI_RGB)
    # 38-41: X pixels per meter
    # 42-45: Y pixels per meter
    # 46-49: Colors in palette (0)
    # 50-53: Important colors (0)
    
    row_padding = (4 - (width * 3) % 4) % 4
    file_size = 54 + (width * 3 + row_padding) * height
    
    header = bytearray(54)
    
    # Signature
    header[0:2] = b'BM'
    # File size
    header[2:6] = struct.pack('<I', file_size)
    # Offset
    header[10:14] = struct.pack('<I', 54)
    
    # Info header size
    header[14:18] = struct.pack('<I', 40)
    # Width
    header[18:22] = struct.pack('<i', width)
    # Height (negative for top-down, typical for modern rendering)
    header[22:26] = struct.pack('<i', -height)
    # Planes
    header[26:28] = struct.pack('<H', 1)
    # Bits per pixel
    header[28:30] = struct.pack('<H', 24)
    
    return header

async def create_test_image(width=640, height=480, frame_num=0, output_format='JPEG'):
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
    
    text = f"Frame {frame_num} ({output_format})"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    position = ((width - text_width) // 2, (height - text_height) // 2)
    draw.text(position, text, fill=(255, 255, 255), font=font)
    
    if output_format == 'BMP_RAW':
        # Generate raw BMP (Header + RGB bytes)
        # Note: PIL's tobytes() returns raw RGB. BMP expects BGR usually, but let's see. 
        # Actually BMP 24-bit is typically BGR. PIL 'raw' encoder can do 'BGR'.
        
        # We handle header manually for maximum control/simulation, or just use PIL's BMP save.
        # But to simulate "raw pixel streaming", we'll do manual header + raw bytes to avoid PIL compression overhead if any.
        
        # Get raw BGR data (fastest for BMP)
        # padding: each row must be multiple of 4 bytes
        
        # Using PIL's save('BMP') is effectively uncompressed RLE usually disabled for 24bit.
        # But the user asked to "convert the image to a raw format to binary value for each pixel"
        # So let's construct it manually to prove "no calculation" on client side logic.
        
        header = create_bmp_header(width, height)
        # Convert to BGR for BMP standard
        r, g, b = img.split()
        img_bgr = Image.merge("RGB", (b, g, r))
        
        # BMP rows are padded to 4 bytes. 
        # For simplicity in this demo, if width*3 is not div by 4, this manual concatenation might need padding logic.
        # PIL's tobytes() doesn't add BMP padding by default.
        
        # Easiest correct way: Use PIL to save as BMP to memory
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='BMP')
        return img_bytes.getvalue()
        
    elif output_format == 'LZ4_RAW':
        # Generate Raw RGB/BGR data and compress with LZ4
        # This simulates 4K 60fps optimized streaming
        
        # Convert to BGR (standard for bitmaps) or RGB. 
        # Since we reconstruct a BMP header in client which expects BGR usually for 24-bit, let's do BGR.
        r, g, b = img.split()
        img_bgr = Image.merge("RGB", (b, g, r))
        
        # Get raw bytes
        raw_bytes = img_bgr.tobytes()
        
        # Compress with LZ4
        if 'lz4.frame' in sys.modules:
            return lz4.frame.compress(raw_bytes)
        else:
            raise ImportError("LZ4 module not available")
            
    else:
        # Convert to JPEG bytes
        img_bytes = io.BytesIO()
        img.save(img_bytes, format=output_format, quality=85)
        return img_bytes.getvalue()


async def image_server(websocket, path, image_path=None, fps=10, output_format='JPEG'):
    """Handle WebSocket connection and send images"""
    client_addr = websocket.remote_address
    print(f"Client connected from {client_addr}")
    
    frame_num = 0
    delay = 1.0 / fps
    
    try:
        # Load images based on configuration
        images = []
        mode = "dynamic"
        
        if image_path:
            p = Path(image_path)
            if p.is_dir():
                # Load all images from directory
                extensions = ['*.jpg', '*.jpeg', '*.png', '*.webp', '*.tif', '*.tiff']
                unique_images = set()
                for ext in extensions:
                    unique_images.update(p.glob(ext))
                    unique_images.update(p.glob(ext.upper()))
                
                images = sorted(list(unique_images))
                
                if images:
                    mode = "directory"
                    print(f"Found {len(images)} images in {image_path}")
                else:
                    print(f"Warning: No images found in {image_path}, falling back to dynamic generation")
            
            elif p.exists():
                # Single static image
                with open(image_path, 'rb') as f:
                    images = [f.read()]
                mode = "static"
                print(f"Using static image: {image_path}")
            else:
                print(f"Warning: Path {image_path} not found, falling back to dynamic generation")
        else:
            print(f"Generating dynamic test images ({output_format})")
        
        while True:
            if mode == "static":
                image_data = images[0]
            elif mode == "directory":
                # Cycle through images in directory
                current_image_path = images[frame_num % len(images)]
                with open(current_image_path, 'rb') as f:
                    image_data = f.read()
            else:
                image_data = await create_test_image(frame_num=frame_num, output_format=output_format)
            
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
    parser.add_argument('--format', type=str, default='JPEG', choices=['JPEG', 'PNG', 'BMP_RAW', 'LZ4_RAW'], 
                        help='Output format for dynamic images (default: JPEG). Use BMP_RAW for uncompressed, LZ4_RAW for compressed raw.')
    
    args = parser.parse_args()
    
    print(f"Starting WebSocket image server on ws://{args.host}:{args.port}")
    print(f"FPS: {args.fps}")
    print(f"Format: {args.format}")
    if args.image:
        print(f"Image: {args.image}")
    else:
        print("Mode: Dynamic test image generation")
    print("\nConnect your Grafana panel to: ws://localhost:8765/")
    print("Press Ctrl+C to stop\n")
    
    async def handler(websocket):
        # In newer websockets versions, path is available as websocket.path
        await image_server(websocket, getattr(websocket, 'path', '/'), args.image, args.fps, args.format)
    
    async with websockets.serve(
        handler,
        args.host,
        args.port
    ):
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServer stopped")
