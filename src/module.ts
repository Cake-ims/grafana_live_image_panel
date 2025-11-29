import { PanelPlugin } from '@grafana/data';
import { LiveImagePanel, LiveImagePanelOptions } from './LiveImagePanel';

export const plugin = new PanelPlugin<LiveImagePanelOptions>(LiveImagePanel).setPanelOptions((builder) => {
  return builder
    .addTextInput({
      path: 'wsUrl',
      name: 'WebSocket URL',
      description: 'WebSocket URL for the image stream (e.g., ws://localhost:8765/)',
      defaultValue: 'ws://localhost:8765/',
      settings: {
        placeholder: 'ws://server:port/path',
      },
    })
    .addNumberInput({
      path: 'reconnectDelay',
      name: 'Reconnect Delay (ms)',
      description: 'Delay in milliseconds before attempting to reconnect after disconnection',
      defaultValue: 2000,
      settings: {
        min: 100,
        max: 60000,
        step: 100,
      },
    })
    .addSelect({
      path: 'objectFit',
      name: 'Image Fit',
      description: 'How the image should be resized to fit the container',
      defaultValue: 'contain',
      settings: {
        options: [
          { value: 'contain', label: 'Contain (fit entire image)' },
          { value: 'cover', label: 'Cover (fill container)' },
          { value: 'fill', label: 'Fill (stretch)' },
          { value: 'none', label: 'None (original size)' },
          { value: 'scale-down', label: 'Scale Down' },
        ],
      },
    })
    .addBooleanSwitch({
      path: 'showStatusIndicator',
      name: 'Show Status Indicator',
      description: 'Display connection status and error messages',
      defaultValue: true,
    });
});
