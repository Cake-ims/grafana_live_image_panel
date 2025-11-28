#!/usr/bin/env python3
"""
WebSocket Benchmark Receiver (Client).
Connects to a WebSocket server (like benchmark_ws_sender.py) and measures receive throughput.

Usage:
    python benchmark_ws_receiver.py [--url URL]
"""

import asyncio
import websockets
import argparse
import time
import sys

async def benchmark_receiver(uri):
    print(f"Connecting to {uri}...")
    
    try:
        async with websockets.connect(uri) as ws:
            print("Connected! Measuring receive throughput...")
            
            start_time = time.time()
            last_report_time = start_time
            messages = 0
            bytes_received = 0
            
            while True:
                try:
                    # Receive message
                    message = await ws.recv()
                    messages += 1
                    bytes_received += len(message)
                    
                    current_time = time.time()
                    
                    # Report every second
                    if current_time - last_report_time >= 1.0:
                        elapsed = current_time - last_report_time
                        msg_rate = (messages / elapsed) if elapsed > 0 else 0
                        data_rate_mbps = (bytes_received * 8) / (elapsed * 1_000_000)
                        
                        print(f"Receiving: {msg_rate:.0f} msg/sec | {data_rate_mbps:.2f} Mbps | Total: {bytes_received / (1024*1024):.2f} MB")
                        
                        # Reset counters for next interval
                        messages = 0
                        bytes_received = 0
                        last_report_time = current_time
                        
                except websockets.exceptions.ConnectionClosed:
                    print("\nConnection closed by server")
                    break
                except Exception as e:
                    print(f"\nError receiving: {e}")
                    break
            
    except Exception as e:
        print(f"Connection error: {e}")

def main():
    parser = argparse.ArgumentParser(description='WebSocket Benchmark Receiver (Client)')
    parser.add_argument('--url', type=str, default='ws://localhost:8765', help='WebSocket server URL (default: ws://localhost:8765)')
    
    args = parser.parse_args()
    
    try:
        asyncio.run(benchmark_receiver(args.url))
    except KeyboardInterrupt:
        print("\nReceiver stopped")

if __name__ == "__main__":
    main()
