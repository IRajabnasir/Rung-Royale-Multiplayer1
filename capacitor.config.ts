import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rungroyale.app',
  appName: 'Rung Royale',
  webDir: 'dist',
  ios: {
    contentInset: 'always',
    backgroundColor: '#020617',
  },
  android: {
    backgroundColor: '#020617',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#020617',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ['google.com'],
    },
  },
};

export default config;
