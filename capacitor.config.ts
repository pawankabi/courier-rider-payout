import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.courierpayout.app',
  appName: 'Courier Rider Payout',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    hostname: 'courier-rider-payout.firebaseapp.com'
  }
};

export default config;
