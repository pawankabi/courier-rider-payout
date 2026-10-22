import type { CapacitorConfig } from '@capacitor/cli';

const isCompanion = 
  process.env.VITE_APP_TARGET === 'cod_companion' || 
  process.env.APP_TARGET === 'cod_companion' || 
  process.env.CAPACITOR_APP_ID === 'com.courierpayout.rider';

const config: CapacitorConfig = {
  appId: isCompanion ? 'com.courierpayout.rider' : 'com.courierpayout.app',
  appName: isCompanion ? 'COD Entry (Rider)' : 'Courier Payout Pro',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    hostname: isCompanion ? 'cod-entry-rider.firebaseapp.com' : 'courier-rider-payout.firebaseapp.com',
    cleartext: true,
    allowNavigation: [
      'ais-pre-2ld7nak662g7pg4ixrragv-515426382523.asia-east1.run.app',
      'ais-dev-2ld7nak662g7pg4ixrragv-515426382523.asia-east1.run.app',
      '*.run.app',
      '*.firebaseapp.com',
      '*.googleapis.com'
    ]
  }
};

export default config;
