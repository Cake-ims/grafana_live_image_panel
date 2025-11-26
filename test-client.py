#!/usr/bin/env python3
"""
WebSocket client for testing the image server.
Receives images and measures the receive rate (frames per second).

Usage:
    python test-client.py [--url URL] [--duration SECONDS] [--verbose]
    
Requirements:
    pip install websockets
"""

import asyncio
import websockets
import argparse
import sys
import time
from datetime import datetime


async def test_receive_rate(url, duration=None, verbose=False):
    """Connect to WebSocket server and measure receive rate"""
    print(f"Connecting to {url}...")
    
    start_time = None
    frame_count = 0
    total_bytes = 0
    frame_sizes = []
    
    try:
        async with websockets.connect(url) as websocket:
            print("Connected! Receiving frames...\n")
            
            if duration:
                end_time = time.time() + duration
                print(f"Will receive for {duration} seconds...")
            else:
                print("Receiving frames (press Ctrl+C to stop)...")
            
            print("-" * 60)
            
            # Start timing
            start_time = time.time()
            last_report_time = start_time
            
            try:
                async for message in websocket:
                    frame_count += 1
                    frame_size = len(message)
                    total_bytes += frame_size
                    frame_sizes.append(frame_size)
                    
                    current_time = time.time()
                    elapsed = current_time - start_time
                    
                    # Report every second
                    if current_time - last_report_time >= 1.0:
                        fps = frame_count / elapsed if elapsed > 0 else 0
                        avg_size = total_bytes / frame_count if frame_count > 0 else 0
                        mbps = (total_bytes * 8) / (elapsed * 1_000_000) if elapsed > 0 else 0
                        
                        if verbose:
                            print(f"[{datetime.now().strftime('%H:%M:%S')}] "
                                  f"Frames: {frame_count:6d} | "
                                  f"FPS: {fps:7.2f} | "
                                  f"Avg Size: {avg_size/1024:7.2f} KB | "
                                  f"Total: {total_bytes/1024/1024:7.2f} MB | "
                                  f"Rate: {mbps:6.2f} Mbps")
                        else:
                            print(f"Frames: {frame_count:6d} | FPS: {fps:7.2f} | "
                                  f"Avg: {avg_size/1024:7.2f} KB | "
                                  f"Total: {total_bytes/1024/1024:7.2f} MB | "
                                  f"Rate: {mbps:6.2f} Mbps")
                        
                        last_report_time = current_time
                    
                    # Check if duration limit reached
                    if duration and current_time >= end_time:
                        break
                        
            except KeyboardInterrupt:
                print("\n\nInterrupted by user")
            
    except websockets.exceptions.ConnectionClosed as e:
        print(f"\nConnection closed: Code {e.code}, Reason: {e.reason}")
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        return
    
    # Final statistics
    if start_time and frame_count > 0:
        elapsed = time.time() - start_time
        avg_fps = frame_count / elapsed
        avg_size = total_bytes / frame_count
        min_size = min(frame_sizes) if frame_sizes else 0
        max_size = max(frame_sizes) if frame_sizes else 0
        mbps = (total_bytes * 8) / (elapsed * 1_000_000)
        
        print("\n" + "=" * 60)
        print("FINAL STATISTICS")
        print("=" * 60)
        print(f"Total Frames Received: {frame_count:,}")
        print(f"Total Duration:       {elapsed:.2f} seconds")
        print(f"Average FPS:           {avg_fps:.2f} frames/second")
        print(f"Total Data:            {total_bytes / 1024 / 1024:.2f} MB")
        print(f"Average Frame Size:    {avg_size / 1024:.2f} KB")
        print(f"Min Frame Size:        {min_size / 1024:.2f} KB")
        print(f"Max Frame Size:        {max_size / 1024:.2f} KB")
        print(f"Data Rate:             {mbps:.2f} Mbps")
        print("=" * 60)


async def main():
    parser = argparse.ArgumentParser(
        description='WebSocket client for testing image server performance'
    )
    parser.add_argument(
        '--url',
        type=str,
        default='ws://localhost:8765',
        help='WebSocket server URL (default: ws://localhost:8765)'
    )
    parser.add_argument(
        '--duration',
        type=float,
        default=None,
        help='Duration to receive frames in seconds (default: run until Ctrl+C)'
    )
    parser.add_argument(
        '--verbose',
        action='store_true',
        help='Show timestamps in output'
    )
    
    args = parser.parse_args()
    
    try:
        await test_receive_rate(args.url, args.duration, args.verbose)
    except KeyboardInterrupt:
        print("\nTest stopped by user")


if __name__ == "__main__":
    asyncio.run(main())

