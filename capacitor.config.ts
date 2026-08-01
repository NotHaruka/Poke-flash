interface CapacitorConfig {
  appId: string;
  appName: string;
  webDir: string;
  [key: string]: any;
}

const config: CapacitorConfig = {
  appId: 'com.flashtrainer.pro',
  appName: 'FlashTrainer Pro',
  webDir: 'dist'
};

export default config;
