import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rule1.app',
  appName: 'Rule #1',
  webDir: 'out',
  // ── Server mode ────────────────────────────────────────────────
  // Points the Android WebView to your running Next.js app.
  // Change the IP to your PC's local network address (ipconfig).
  // The backend (port 8000) must also be running.
  server: {
    url: 'http://10.0.0.10:3000',         // <-- change to your PC IP
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: '#09090B',
      showSpinner: false,
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#09090B',
    },
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#09090B',
  },
};

export default config;
