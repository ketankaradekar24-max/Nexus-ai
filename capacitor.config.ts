// Capacitor configuration for packaging SUB AI's Vite build (`dist/`) into an Android WebView shell.
// See docs/ANDROID_AND_DEPLOYMENT.md for build and signing instructions.

export interface CapacitorConfig {
  appId: string;
  appName: string;
  webDir: string;
  bundledWebRuntime?: boolean;
  server: {
    androidScheme: 'https' | 'http';
    allowNavigation?: string[];
  };
  android: {
    allowMixedContent: boolean;
    captureInput: boolean;
    webContentsDebuggingEnabled: boolean;
  };
}

const config: CapacitorConfig = {
  appId: 'ai.subai.workspace',
  appName: 'SUB AI',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
