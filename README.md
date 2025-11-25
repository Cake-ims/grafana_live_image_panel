# Grafana Live Image Panel

A Grafana panel plugin that displays real-time images from a WebSocket binary stream.

## Features

- **Real-time Image Streaming**: Receive and display images via WebSocket binary streams
- **Auto-reconnect**: Automatically reconnects on connection loss
- **Multiple Image Formats**: Supports JPEG, PNG, WebP with auto-detection
- **Connection Status**: Visual indicator showing connection state
- **Error Handling**: Clear error messages and status indicators
- **Configurable Options**: Customize WebSocket URL, reconnect delay, image format, and display options
- **Memory Safe**: Proper cleanup of object URLs to prevent memory leaks
- **Debug Mode**: Built-in debugging utilities for troubleshooting

## Installation

### Building the Plugin

1. Install dependencies:
   ```bash
   npm install
   # or
   bun install
   ```

2. Build the plugin:
   ```bash
   npm run build
   # or
   bun run build
   ```

   This will create a `dist/` folder with the compiled plugin.

### Installing in Grafana

#### Option 1: Development Mode (Recommended for Testing)

1. **Copy the plugin to Grafana's plugins directory:**
   
   **Linux/Docker:**
   ```bash
   cp -r dist /var/lib/grafana/plugins/yourorg-live-image-panel
   ```
   
   **Windows:**
   ```cmd
   xcopy /E /I dist "C:\Program Files\GrafanaLabs\grafana\data\plugins\yourorg-live-image-panel"
   ```
   
   **Mac:**
   ```bash
   cp -r dist /usr/local/var/lib/grafana/plugins/yourorg-live-image-panel
   ```

2. **Allow unsigned plugins:**
   
   Edit your Grafana configuration file (`grafana.ini`):
   ```ini
   [plugins]
   allow_loading_unsigned_plugins = yourorg-live-image-panel
   ```
   
   Or set the environment variable:
   ```bash
   export GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=yourorg-live-image-panel
   ```

3. **Restart Grafana:**
   ```bash
   # Linux (systemd)
   sudo systemctl restart grafana-server
   
   # Docker
   docker restart grafana
   ```

4. **Verify installation:**
   - Go to Grafana → Configuration → Plugins
   - Look for "Live Image Panel (WebSocket)" in the list

#### Option 2: Using Docker Compose (Easiest for Development)

1. **Build the plugin first:**
   ```bash
   bun run build
   ```

2. **Create a `docker-compose.yml` file:**
   ```yaml
   version: '3.0'
   
   services:
     grafana:
       image: grafana/grafana:latest
       container_name: grafana-live-image-dev
       ports:
         - "3000:3000"
       volumes:
         - ./dist:/var/lib/grafana/plugins/yourorg-live-image-panel
       environment:
         - GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=yourorg-live-image-panel
         - GF_SECURITY_ADMIN_USER=admin
         - GF_SECURITY_ADMIN_PASSWORD=admin
   ```

3. **Start Grafana:**
   ```bash
   docker-compose up -d
   ```

4. **Access Grafana:**
   - Open http://localhost:3000
   - Login with `admin` / `admin`

#### Option 3: Development Server (Hot Reload)

For active development with hot reload:
```bash
npm run dev
# or
bun run dev
```

This will start a Grafana instance with the plugin in development mode.

## Configuration

### Panel Options

- **WebSocket URL**: The WebSocket endpoint URL (e.g., `ws://localhost:8765/`)
- **Reconnect Delay (ms)**: Delay before attempting to reconnect (default: 2000ms)
- **Image Format**: 
  - `Auto-detect`: Automatically detect format from image data
  - `JPEG`: Force JPEG format
  - `PNG`: Force PNG format
  - `WebP`: Force WebP format
  - `Raw (BMP)`: Fastest performance. Bypasses detection and expects uncompressed BMP data.
- **Image Fit**: How the image should be resized:
  - `Contain`: Fit entire image within container
  - `Cover`: Fill container while maintaining aspect ratio
  - `Fill`: Stretch to fill container
  - `None`: Original size
  - `Scale Down`: Scale down if larger than container
- **Show Status Indicator**: Toggle visibility of connection status and error messages

## Usage

### Adding the Panel to a Dashboard

1. **Create or open a dashboard** in Grafana
2. **Add a new panel** (click "Add visualization" or the "+" icon)
3. **Select "Live Image Panel (WebSocket)"** from the visualization list
4. **Configure the panel:**
   - **WebSocket URL**: Enter your WebSocket server URL (e.g., `ws://localhost:8765/`)
   - **Reconnect Delay**: Set delay in milliseconds (default: 2000ms)
   - **Image Format**: Choose auto-detect or specific format
   - **Image Fit**: Choose how images should be displayed
   - **Show Status Indicator**: Toggle connection status display

5. **Save the panel** - it will automatically connect to your WebSocket server

### Testing with the Test Server

1. **Start the test WebSocket server:**
   ```bash
   python3 test-server.py
   # or with custom options:
   python3 test-server.py --port 8765 --fps 10
   ```

   **High-Performance Mode (Raw BMP):**
   To test the fastest possible display rate (uncompressed data):
   ```bash
   python3 test-server.py --format BMP_RAW --fps 30
   ```
   *Note: Requires `websockets` and `pillow` installed (`pip install websockets pillow`)*

2. **Configure the panel** with WebSocket URL: `ws://localhost:8765/`

3. **Watch the images stream** in real-time!

### Panel Behavior

- **Auto-connect**: The panel automatically connects when added or when the URL changes
- **Auto-reconnect**: Automatically reconnects if the connection is lost
- **Status Indicator**: Shows connection status (green = connected, yellow = connecting, red = error)
- **Image Counter**: Displays the number of images received
- **Error Messages**: Shows error messages in the status bar if something goes wrong

## Debugging

### Enable Debug Mode

Open your browser's developer console and run:

```javascript
window.__GRAFANA_LIVE_IMAGE_DEBUG__ = true;
```

Or use the debug utilities:

```javascript
// Enable debug mode
window.__GRAFANA_LIVE_IMAGE_DEBUG__ = true;

// Disable debug mode
window.__GRAFANA_LIVE_IMAGE_DEBUG__ = false;
```

### Debug Information

When debug mode is enabled, you'll see detailed logs for:
- WebSocket connection events
- Image data reception (size, format)
- Connection state changes
- Error messages
- Image display events

### Common Issues

#### Connection Fails

1. **Check WebSocket URL**: Ensure the URL is correct and uses `ws://` or `wss://` protocol
2. **Check Server**: Verify the WebSocket server is running and accessible
3. **Check Network**: Ensure there are no firewall or network issues
4. **Check Browser Console**: Look for error messages in the browser console

#### Images Not Displaying

1. **Check Image Format**: Verify the image format matches the configured option
2. **Check Data Format**: Ensure the server is sending binary data (ArrayBuffer)
3. **Enable Debug Mode**: Check debug logs for image processing errors
4. **Check Image Size**: Very large images may cause performance issues

#### Memory Issues

- The plugin automatically cleans up object URLs to prevent memory leaks
- If you notice memory issues, check that images are being properly cleaned up in debug logs

## Development

### Project Structure

```
grafana_live_image_panel/
├── src/
│   ├── LiveImagePanel.tsx    # Main panel component
│   ├── module.ts              # Plugin module definition
│   └── utils/
│       ├── debug.ts           # Debugging utilities
│       └── __tests__/
│           └── debug.test.ts  # Unit tests
├── plugin.json                # Plugin manifest
├── package.json               # Dependencies and scripts
└── tsconfig.json              # TypeScript configuration
```

### Building

```bash
npm run build
```

### Testing

Run tests (when test framework is configured):

```bash
npm test
```

## WebSocket Server Example

Here's a simple Python example for testing:

```python
import asyncio
import websockets
import base64
from PIL import Image
import io

async def image_server(websocket, path):
    print("Client connected")
    try:
        # Read and send an image file
        with open("test_image.jpg", "rb") as f:
            image_data = f.read()
        
        while True:
            await websocket.send(image_data)
            await asyncio.sleep(0.1)  # Send 10 images per second
    except websockets.exceptions.ConnectionClosed:
        print("Client disconnected")

start_server = websockets.serve(image_server, "localhost", 8765)
asyncio.get_event_loop().run_until_complete(start_server)
asyncio.get_event_loop().run_forever()
```

## Performance Considerations

- **Image Size**: Large images may cause performance issues. Consider compressing images on the server side
- **Frame Rate**: High frame rates (e.g., >30 FPS) may cause browser performance issues
- **Memory**: The plugin cleans up old image URLs, but very high frame rates may still cause memory pressure

## License

[Add your license here]

## Author

Cake

