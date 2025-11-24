// Background service worker
importScripts('config.js');

console.log('Perspective Prism background service worker loaded');
const configManager = new ConfigManager();
configManager.load().then(config => {
    console.log('Configuration loaded:', config);
});
