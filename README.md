# Grafana High-Performance JPEG Live Panel

A streamlined, minimalist Grafana panel plugin designed for ultra-low latency JPEG streaming via WebSocket.

## Features

- **Extreme Performance**: Optimized specifically for receiving and displaying JPEG blobs.
- **Minimal Overhead**: Uses `createImageBitmap` and Canvas rendering to bypass DOM layout thrashing.
- **Zero Dependencies**: Stripped down to the bare essentials for smallest bundle size.
- **FPS Tracking**: Built-in RX (Receive) and TX (Display) frame rate monitoring.

## Installation

1. **Build the plugin:**
   ```bash
   npm install
   npm run build
   ```

2. **Install in Grafana:**
   Copy the `dist` folder to your Grafana plugins directory:
   ```bash
   cp -r dist /var/lib/grafana/plugins/yourorg-live-image-panel
   ```

3. **Restart Grafana.**

## Configuration

### Panel Options

- **WebSocket URL**: The WebSocket endpoint URL (e.g., `ws://localhost:8765/`).
- **Reconnect Delay**: Time to wait before reconnecting (ms).
- **Image Fit**: How the image fits the container (Contain, Cover, etc.).
- **Show Status Indicator**: Toggle the FPS/Connection status overlay.

### Data Format

The plugin expects **binary JPEG data** over the WebSocket connection.
- No headers.
- No JSON wrapping.
- Just raw bytes of a valid JPEG image per message.
