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

function isValidVideoId(id) {
    // YouTube video IDs are exactly 11 characters
    // Valid characters: A-Z, a-z, 0-9, underscore, hyphen
    return /^[a-zA-Z0-9_-]{11}$/.test(id);
}

function extractVideoId() {
    // Strategy 1: Standard watch URL parameter (?v=VIDEO_ID)
    const urlParams = new URLSearchParams(window.location.search);
    const watchParam = urlParams.get('v');
    if (watchParam && isValidVideoId(watchParam)) {
        console.debug('[Perspective Prism] Extracted Video ID via watch param:', watchParam);
        return watchParam;
    }

    const pathname = window.location.pathname;

    // Strategy 2: Shorts format: /shorts/VIDEO_ID
    const shortsMatch = pathname.match(/\/shorts\/([A-Za-z0-9_-]+)/);
    if (shortsMatch && isValidVideoId(shortsMatch[1])) {
        console.debug('[Perspective Prism] Extracted Video ID via shorts path:', shortsMatch[1]);
        return shortsMatch[1];
    }

    // Strategy 3: Embed format: /embed/VIDEO_ID
    const embedMatch = pathname.match(/\/embed\/([A-Za-z0-9_-]+)/);
    if (embedMatch && isValidVideoId(embedMatch[1])) {
        console.debug('[Perspective Prism] Extracted Video ID via embed path:', embedMatch[1]);
        return embedMatch[1];
    }

    // Strategy 4: Legacy format: /v/VIDEO_ID
    const legacyMatch = pathname.match(/\/v\/([A-Za-z0-9_-]+)/);
    if (legacyMatch && isValidVideoId(legacyMatch[1])) {
        console.debug('[Perspective Prism] Extracted Video ID via legacy path:', legacyMatch[1]);
        return legacyMatch[1];
    }

    // Strategy 5: Hash fragment (e.g. #v=VIDEO_ID)
    const hashMatch = window.location.hash.match(/[?&]v=([A-Za-z0-9_-]+)/);
    if (hashMatch && isValidVideoId(hashMatch[1])) {
        console.debug('[Perspective Prism] Extracted Video ID via hash fragment:', hashMatch[1]);
        return hashMatch[1];
    }

    return null;
}

// --- UI Injection ---

function createAnalysisButton() {
    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.className = 'pp-ext-button';
    btn.setAttribute('data-pp-analysis-button', 'true'); // Duplication prevention

    // Accessibility attributes
    btn.setAttribute('aria-label', 'Analyze video claims');
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');

    btn.innerHTML = `
        <span class="pp-icon">🔍</span>
        <span>Analyze Claims</span>
    `;
    btn.onclick = handleAnalysisClick;
    return btn;
}

// ... (injectButton remains unchanged)

function setButtonState(state) {
    if (!analysisButton) return;

    const textSpan = analysisButton.querySelector('span:last-child');
    const iconSpan = analysisButton.querySelector('.pp-icon');

    if (!textSpan || !iconSpan) return;

    // Reset ARIA busy state
    analysisButton.setAttribute('aria-busy', 'false');
    analysisButton.classList.remove('pp-state-error', 'pp-state-success');

    switch (state) {
        case 'loading':
            textSpan.textContent = 'Analyzing...';
            iconSpan.textContent = '⏳';
            analysisButton.disabled = true;
            analysisButton.setAttribute('aria-label', 'Analysis in progress');
            analysisButton.setAttribute('aria-busy', 'true');
            break;
        case 'success':
            textSpan.textContent = 'Analyzed';
            iconSpan.textContent = '✅';
            analysisButton.disabled = false;
            analysisButton.setAttribute('aria-label', 'Analysis complete. Click to view results.');
            analysisButton.classList.add('pp-state-success');
            break;
        case 'error':
            textSpan.textContent = 'Retry Analysis';
            iconSpan.textContent = '⚠️';
            analysisButton.disabled = false;
            analysisButton.setAttribute('aria-label', 'Analysis failed. Click to retry.');
            analysisButton.classList.add('pp-state-error');
            break;
        default: // idle
            textSpan.textContent = 'Analyze Claims';
            iconSpan.textContent = '🔍';
            analysisButton.disabled = false;
            analysisButton.setAttribute('aria-label', 'Analyze video claims');
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

            const claimTextDiv = document.createElement('div');
            claimTextDiv.className = 'claim-text';
            claimTextDiv.textContent = claim.claim_text;

            const assessmentDiv = document.createElement('div');
            assessmentDiv.className = `assessment ${assessClass}`;
            assessmentDiv.textContent = assessment;

            const perspectivesDiv = document.createElement('div');
            perspectivesDiv.className = 'perspectives';
            Object.entries(claim.truth_profile?.perspectives || {}).forEach(([key, val]) => {
                const perDiv = document.createElement('div');
                const strong = document.createElement('strong');
                strong.textContent = key + ':';
                perDiv.appendChild(strong);
                perDiv.appendChild(document.createTextNode(' ' + val.assessment));
                perspectivesDiv.appendChild(perDiv);
            });

            card.appendChild(claimTextDiv);
            card.appendChild(assessmentDiv);
            card.appendChild(perspectivesDiv);
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

// --- Lifecycle ---

let observer = null;
let debounceTimer = null;

function handleMutations(mutations) {
    if (debounceTimer) clearTimeout(debounceTimer);

    debounceTimer = setTimeout(() => {
        if (currentVideoId && !document.getElementById(BUTTON_ID)) {
            console.log('[Perspective Prism] Mutation detected, re-injecting button...');
            injectButton();
        }
    }, 500); // 500ms debounce
}

function setupObservers() {
    if (observer) {
        observer.disconnect();
    }

    // Try to observe specific container first
    const specificContainer = document.querySelector('#top-level-buttons-computed') ||
        document.querySelector('#menu-container');

    if (specificContainer) {
        console.log('[Perspective Prism] Observing specific container');
        observer = new MutationObserver(handleMutations);
        observer.observe(specificContainer, {
            childList: true,
            subtree: false // Performance optimization
        });
    } else {
        console.log('[Perspective Prism] Observing document body (fallback)');
        observer = new MutationObserver(handleMutations);
        observer.observe(document.body, {
            childList: true,
            subtree: true // Necessary for fallback
        });
    }
}

function handleNavigation() {
    const vid = extractVideoId();

    // Always re-setup observers on navigation as DOM might have changed significantly
    setupObservers();

    if (vid !== currentVideoId) {
        currentVideoId = vid;
        // Re-inject if needed or reset state
        if (currentVideoId) {
            injectButton();
            setButtonState('idle');
            removePanel();
        }
    } else if (currentVideoId && !document.getElementById(BUTTON_ID)) {
        // Ensure button stays injected
        injectButton();
    }
}

function init() {
    // Initial check
    const newVideoId = extractVideoId();
    if (newVideoId) {
        currentVideoId = newVideoId;
        injectButton();
    }

    // Setup initial observers
    setupObservers();

    // URL-change detection for YouTube SPA navigation
    // Track last URL to detect changes
    let lastUrl = location.href;

    // Debounced handler with 150ms delay
    let navDebounceTimer = null;
    const debouncedNavigation = () => {
        clearTimeout(navDebounceTimer);
        navDebounceTimer = setTimeout(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                handleNavigation();
            }
        }, 150);
    };

    // Intercept pushState/replaceState (YouTube uses History API)
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
        originalPushState.apply(this, args);
        debouncedNavigation();
    };

    history.replaceState = function (...args) {
        originalReplaceState.apply(this, args);
        debouncedNavigation();
    };

    // Listen for back/forward navigation
    window.addEventListener('popstate', debouncedNavigation);
}

// Run
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
