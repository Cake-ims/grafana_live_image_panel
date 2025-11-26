#!/usr/bin/env python3
"""
WebSocket server for streaming a single JPEG compressed 8-bit grayscale image.
Generates one 250x250 pixel 8-bit grayscale image, compresses with JPEG (quality=50),
and streams it repeatedly over WebSocket.

Usage:
    python test-server-jpeg.py [--port PORT] [--fps FPS] [--quality QUALITY]

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


def generate_jpeg_image(width=250, height=250, quality=50):
    """Generate a single 8-bit grayscale JPEG compressed image"""
    # Create 8-bit grayscale image
    img = Image.new('L', (width, height), color=128)  # Medium gray background
    
    # Add some visual pattern
    from PIL import ImageDraw, ImageFont
    draw = ImageDraw.Draw(img)
    
    # Draw grid pattern
    for i in range(0, width, 25):
        draw.line([(i, 0), (i, height)], fill=255, width=1)
    for i in range(0, height, 25):
        draw.line([(0, i), (width, i)], fill=255, width=1)
    
    # Add text
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 30)
    except:
        font = ImageFont.load_default()
    
    text = "JPEG Test"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    position = ((width - text_width) // 2, (height - text_height) // 2)
    draw.text(position, text, fill=255, font=font)
    
    # Compress to JPEG grayscale with specified quality
    img_bytes = io.BytesIO()
    img.save(img_bytes, format='JPEG', quality=quality, optimize=False)
    return img_bytes.getvalue()


def load_bmp_and_convert_to_jpeg(image_path, quality=50):
    """Load BMP image from file, convert to 8-bit grayscale, and compress to JPEG"""
    try:
        # Load BMP image
        img = Image.open(image_path)
        
        # Get original dimensions
        original_width, original_height = img.size
        print(f"  Loaded BMP: {image_path.name} ({original_width}x{original_height})")
        
        # Convert to 8-bit grayscale (mode 'L')
        if img.mode != 'L':
            img = img.convert('L')
            print(f"  Converted to 8-bit grayscale")
        
        # Get raw 8-bit pixel data (for reference, not used in JPEG)
        raw_8bit = img.tobytes()
        print(f"  Raw 8-bit size: {len(raw_8bit)/1024:.2f} KB ({len(raw_8bit)} bytes)")
        
        # Compress to JPEG grayscale with specified quality
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='JPEG', quality=quality, optimize=False)
        jpeg_data = img_bytes.getvalue()
        
        print(f"  JPEG compressed size: {len(jpeg_data)/1024:.2f} KB (quality={quality})")
        
        return jpeg_data, img.size
        
    except Exception as e:
        print(f"Error loading/converting BMP image {image_path}: {e}")
        raise


def load_bmp_from_folder(folder_path, quality=50):
    """Load first BMP image from folder, convert to 8-bit grayscale JPEG"""
    folder = Path(folder_path)
    
    if not folder.exists() or not folder.is_dir():
        raise ValueError(f"Folder does not exist: {folder_path}")
    
    # Find BMP files
    bmp_files = list(folder.glob('*.bmp')) + list(folder.glob('*.BMP'))
    
    if not bmp_files:
        raise ValueError(f"No BMP files found in {folder_path}")
    
    # Use the first BMP file found
    bmp_file = sorted(bmp_files)[0]
    print(f"Loading BMP image from: {bmp_file}")
    
    jpeg_data, (width, height) = load_bmp_and_convert_to_jpeg(bmp_file, quality)
    
    return jpeg_data, (width, height)


async def image_server(websocket, image_data, fps=10):
    """Handle WebSocket connection and stream the JPEG image repeatedly"""
    client_addr = websocket.remote_address
    print(f"Client connected from {client_addr}")
    
    frame_num = 0
    delay = 1.0 / fps
    
    try:
        print(f"Streaming image at {fps} FPS (size: ~{len(image_data)/1024:.2f} KB)")
        
        while True:
            try:
                # Send the same image repeatedly
                try:
                    await websocket.send(image_data)
                except websockets.exceptions.ConnectionClosed:
                    break
                except Exception as send_error:
                    print(f"Error sending frame to {client_addr}: {send_error}")
                    break
                
                frame_num += 1
                
                if frame_num % 100 == 0:
                    print(f"Sent {frame_num} frames to {client_addr}")
                
                await asyncio.sleep(delay)
                
            except websockets.exceptions.ConnectionClosed:
                break
            except Exception as e:
                print(f"Error in send loop for {client_addr}: {e}")
                break
            
    except websockets.exceptions.ConnectionClosed as e:
        print(f"Client {client_addr} disconnected (sent {frame_num} frames) - Code: {e.code}, Reason: {e.reason}")
    except websockets.exceptions.ConnectionClosedError as e:
        print(f"Client {client_addr} connection error (sent {frame_num} frames) - {e}")
    except Exception as e:
        import traceback
        print(f"Error in image_server for {client_addr}: {e}")
        traceback.print_exc()
    finally:
        if frame_num > 0:
            print(f"Client {client_addr} finished (sent {frame_num} frames)")


async def main():
    parser = argparse.ArgumentParser(
        description='WebSocket server for streaming a single JPEG compressed 8-bit grayscale image'
    )
    parser.add_argument('--port', type=int, default=8765, help='WebSocket server port (default: 8765)')
    parser.add_argument('--host', type=str, default='localhost', help='WebSocket server host (default: localhost)')
    parser.add_argument('--fps', type=float, default=10, help='Frames per second (default: 10)')
    parser.add_argument('--quality', type=int, default=50, help='JPEG quality 1-100 (default: 50)')
    parser.add_argument('--image', type=str, help='Path to folder containing BMP images (default: generate test image)')
    
    args = parser.parse_args()
    
    print(f"Starting JPEG WebSocket image server on ws://{args.host}:{args.port}")
    print(f"JPEG quality: {args.quality}")
    print(f"FPS: {args.fps}")
    
    # Load BMP image from folder or generate test image
    if args.image:
        print(f"\nLoading BMP image from folder: {args.image}")
        try:
            image_data, (width, height) = load_bmp_from_folder(args.image, quality=args.quality)
            print(f"Image loaded: {width}x{height} pixels, 8-bit grayscale")
        except Exception as e:
            print(f"Error: {e}")
            print("Falling back to generated test image...")
            image_data = generate_jpeg_image(width=250, height=250, quality=args.quality)
            print(f"Image generated: {len(image_data)/1024:.2f} KB")
    else:
        print("\nGenerating JPEG test image...")
        image_data = generate_jpeg_image(width=250, height=250, quality=args.quality)
        print(f"Image generated: {len(image_data)/1024:.2f} KB")
    
    print("\nConnect your client to: ws://localhost:8765/")
    print("Press Ctrl+C to stop\n")
    
    async def handler(websocket):
        await image_server(websocket, image_data=image_data, fps=args.fps)
    
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

