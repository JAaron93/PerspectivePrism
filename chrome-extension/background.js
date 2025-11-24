// Background service worker
importScripts('config.js', 'client.js');

console.log('Perspective Prism background service worker loaded');

let client;
const configManager = new ConfigManager();

// Initialize client with config
configManager.load().then(config => {
    console.log('Configuration loaded:', config);
    client = new PerspectivePrismClient(config.backendUrl);
}).catch(error => {
    console.error('Failed to load configuration:', error);
    // Fallback or error state? For now, we need a client to handle messages even if config fails (maybe with default?)
    // ConfigManager returns defaults on failure, so we should be good.
});

// Message handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'ANALYZE_VIDEO') {
        handleAnalysisRequest(message, sendResponse);
        return true; // Indicates async response
    }
});

async function handleAnalysisRequest(message, sendResponse) {
    if (!client) {
        // Should rarely happen if config loads fast, but handle it
        const config = await configManager.load();
        client = new PerspectivePrismClient(config.backendUrl);
    }

    try {
        const result = await client.analyzeVideo(message.videoId);
        sendResponse(result);
    } catch (error) {
        console.error('Analysis request failed:', error);
        sendResponse({ success: false, error: error.message });
    }
}
