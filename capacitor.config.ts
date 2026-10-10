import type { CapacitorConfig } from '@capacitor/cli';

const isCompanion = 
  process.env.VITE_APP_TARGET === 'cod_companion' || 
  process.env.APP_TARGET === 'cod_companion' || 
  process.env.CAPACITOR_APP_ID === 'com.courierpayout.codentry';

const config: CapacitorConfig = {
  appId: isCompanion ? 'com.courierpayout.codentry' : 'com.courierpayout.app',
  appName: isCompanion ? 'COD Entry (हिसाब किताब)' : 'Courier Rider Payout',
  // Ensure local assets strictly reflect the freshly compiled build from dist without loading stale assets
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    hostname: isCompanion ? 'cod-entry-rider.firebaseapp.com' : 'courier-rider-payout.firebaseapp.com'
  }
};

export default config;
