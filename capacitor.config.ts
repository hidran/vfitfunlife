import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vfit.app',
  appName: 'V Fitness & Wellness',
  webDir: 'out',
  
  // Server configuration
  server: {
    androidScheme: 'https',
    // Enable for live reload during development:
    // url: 'http://YOUR_IP:3000',
    // cleartext: true,
  },
  
  // iOS configuration
  ios: {
    contentInset: 'always',
    scheme: 'VFit',
  },
  
  // Android configuration
  android: {
    backgroundColor: '#1A1D29',
  },
  
  // Plugin configurations
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: false,
      backgroundColor: '#1A1D29',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1A1D29',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['google.com', 'apple.com'],
    },
  },
};

export default config;
