// Content script for Perspective Prism

console.log('Perspective Prism content script loaded');

// State
let currentVideoId = null;
let analysisPanel = null;
let analysisButton = null;

// Constants
const BUTTON_ID = 'pp-analysis-button';
const PANEL_ID = 'pp-analysis-panel';

// --- Video ID Extraction ---

function extractVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    const watchParam = urlParams.get('v');
    if (watchParam && /^[a-zA-Z0-9_-]{11}$/.test(watchParam)) {
        return watchParam;
    }

    const pathname = window.location.pathname;
    const shortsMatch = pathname.match(/\/shorts\/([A-Za-z0-9_-]+)/);
    if (shortsMatch) return shortsMatch[1];

    return null;
}

// --- UI Injection ---

function createAnalysisButton() {
    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.className = 'pp-ext-button';
    btn.innerHTML = `
        <span class="pp-icon">🔍</span>
        <span>Analyze Claims</span>
    `;
    btn.onclick = handleAnalysisClick;
    return btn;
}

function injectButton() {
    if (document.getElementById(BUTTON_ID)) return; // Already injected

    // Selectors from design doc
    const selectors = [
        '#top-level-buttons-computed', // Primary
        '#menu-container',             // Fallback 1
        '#info-contents'               // Fallback 2
    ];

    let container = null;
    for (const selector of selectors) {
        container = document.querySelector(selector);
        if (container) break;
    }

    if (container) {
        analysisButton = createAnalysisButton();
        // Insert as first child or append depending on layout? 
        // YouTube buttons are usually right-aligned or flex. Appending is usually safe.
        container.appendChild(analysisButton);
        console.log('Perspective Prism button injected');
    } else {
        console.log('Perspective Prism: No suitable container found for button');
    }
}

// --- Interaction Handling ---

async function handleAnalysisClick() {
    if (!currentVideoId) return;

    setButtonState('loading');

    try {
        // Check cache first (handled by client.js in background, but we send message)
        chrome.runtime.sendMessage({
            type: 'ANALYZE_VIDEO',
            videoId: currentVideoId
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Message failed:', chrome.runtime.lastError);
                setButtonState('error');
                showError('Extension connection failed. Please reload.');
                return;
            }

            if (response && response.success) {
                setButtonState('success');
                showResults(response.data);
            } else {
                setButtonState('error');
                showError(response?.error || 'Analysis failed');
            }
        });
    } catch (e) {
        console.error('Click handler error:', e);
        setButtonState('error');
    }
}

function setButtonState(state) {
    if (!analysisButton) return;

    const textSpan = analysisButton.querySelector('span:last-child');
    const iconSpan = analysisButton.querySelector('.pp-icon');

    switch (state) {
        case 'loading':
            textSpan.textContent = 'Analyzing...';
            iconSpan.textContent = '⏳';
            analysisButton.disabled = true;
            break;
        case 'success':
            textSpan.textContent = 'Analyzed';
            iconSpan.textContent = '✅';
            analysisButton.disabled = false;
            break;
        case 'error':
            textSpan.textContent = 'Retry Analysis';
            iconSpan.textContent = '⚠️';
            analysisButton.disabled = false;
            break;
        default: // idle
            textSpan.textContent = 'Analyze Claims';
            iconSpan.textContent = '🔍';
            analysisButton.disabled = false;
    }
}

// --- Results Display ---

function showResults(data) {
    removePanel(); // Remove existing

    const panel = document.createElement('div');
    panel.id = PANEL_ID;

    // Shadow DOM for style isolation
    const shadow = panel.attachShadow({ mode: 'open' });

    // Styles
    const style = document.createElement('style');
    style.textContent = `
        :host {
            position: fixed;
            top: 60px;
            right: 20px;
            width: 400px;
            max-height: 80vh;
            background: white;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            border-radius: 12px;
            z-index: 9999;
            overflow-y: auto;
            font-family: Roboto, Arial, sans-serif;
            color: #0f0f0f;
        }
        .header {
            padding: 16px;
            border-bottom: 1px solid #e5e5e5;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #f9f9f9;
        }
        .title { font-weight: 600; font-size: 16px; }
        .close-btn {
            cursor: pointer;
            border: none;
            background: none;
            font-size: 20px;
            color: #606060;
        }
        .content { padding: 16px; }
        .claim-card {
            border: 1px solid #e5e5e5;
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 12px;
            background: #fff;
        }
        .claim-text { font-weight: 500; margin-bottom: 8px; }
        .assessment { 
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        }
        .assessment.high { background: #e6f4ea; color: #137333; }
        .assessment.medium { background: #fce8e6; color: #c5221f; }
        .assessment.low { background: #fef7e0; color: #b06000; }
        
        .perspectives { margin-top: 8px; font-size: 13px; color: #606060; }
    `;

    // Content
    const container = document.createElement('div');

    // Header
    const header = document.createElement('div');
    header.className = 'header';
    header.innerHTML = `
        <span class="title">Analysis Results</span>
        <button class="close-btn">×</button>
    `;
    header.querySelector('.close-btn').onclick = removePanel;

    // Claims
    const content = document.createElement('div');
    content.className = 'content';

    if (data.claims && data.claims.length > 0) {
        data.claims.forEach(claim => {
            const card = document.createElement('div');
            card.className = 'claim-card';

            const assessment = claim.truth_profile?.overall_assessment || 'Unknown';
            // Simple heuristic for color class
            let assessClass = 'low';
            if (assessment.toLowerCase().includes('true') || assessment.toLowerCase().includes('accurate')) assessClass = 'high';
            else if (assessment.toLowerCase().includes('false') || assessment.toLowerCase().includes('misleading')) assessClass = 'medium';

            card.innerHTML = `
                <div class="claim-text">${claim.claim_text}</div>
                <div class="assessment ${assessClass}">${assessment}</div>
                <div class="perspectives">
                    ${Object.entries(claim.truth_profile?.perspectives || {}).map(([key, val]) =>
                `<div><strong>${key}:</strong> ${val.assessment}</div>`
            ).join('')}
                </div>
            `;
            content.appendChild(card);
        });
    } else {
        content.innerHTML = '<p>No claims extracted.</p>';
    }

    container.appendChild(header);
    container.appendChild(content);

    shadow.appendChild(style);
    shadow.appendChild(container);

    document.body.appendChild(panel);
    analysisPanel = panel;
}

function showError(msg) {
    alert(`Perspective Prism Error: ${msg}`);
}

function removePanel() {
    if (analysisPanel) {
        analysisPanel.remove();
        analysisPanel = null;
    }
}

// --- Lifecycle ---

function init() {
    // Initial check
    const newVideoId = extractVideoId();
    if (newVideoId) {
        currentVideoId = newVideoId;
        injectButton();
    }

    // Observer for navigation (SPA)
    const observer = new MutationObserver(() => {
        const vid = extractVideoId();
        if (vid !== currentVideoId) {
            currentVideoId = vid;
            // Re-inject if needed or reset state
            if (currentVideoId) {
                injectButton();
                setButtonState('idle');
                removePanel();
            }
        }

        // Ensure button stays injected
        if (currentVideoId && !document.getElementById(BUTTON_ID)) {
            injectButton();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

// Run
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
