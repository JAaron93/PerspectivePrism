/**
 * ClaimNavigator handles keyboard navigation and accessibility for the analysis panel.
 * It implements the WAI-ARIA "roving tabindex" pattern for the list of claims.
 */
class ClaimNavigator {
  /**
   * @param {ShadowRoot} shadowRoot - The shadow root of the panel
   * @param {HTMLElement} announcerElement - Hidden element for live announcements
   */
  constructor(shadowRoot, announcerElement) {
    this.shadowRoot = shadowRoot;
    this.announcer = announcerElement;
    this.claims = [];
    this.activeIndex = -1;
    this._listeners = new Map(); // Store bound listeners for cleanup
  }

  /**
   * Initialize with a list of claim elements
   * @param {NodeList|Array} claimElements - The claim header elements
   */
  init(claimElements) {
    // Clean up any existing listeners/state first
    this._cleanup();

    this.claims = Array.from(claimElements);
    this.activeIndex = 0;

    // Set initial tabindex
    this.claims.forEach((claim, index) => {
      claim.setAttribute('tabindex', index === 0 ? '0' : '-1');
      
      // Create bound handlers
      const onKeyDown = (e) => this.handleKeyDown(e, index);
      const onFocus = () => {
        this.activeIndex = index;
        this.updateTabIndexes();
      };

      // Store handlers
      this._listeners.set(claim, { onKeyDown, onFocus });
      
      // Add event listeners
      claim.addEventListener('keydown', onKeyDown);
      claim.addEventListener('focus', onFocus);
    });
  }



  _cleanup() {
    if (this._announceTimer) {
      clearTimeout(this._announceTimer);
      this._announceTimer = null;
    }

    // Remove all event listeners
    if (this._listeners) {
      this._listeners.forEach((handlers, element) => {
        if (element && handlers) {
            element.removeEventListener('keydown', handlers.onKeyDown);
            element.removeEventListener('focus', handlers.onFocus);
        }
      });
      this._listeners.clear();
    }

    this.claims = [];
  }

  /**
   * Clean up event listeners and references
   */
  dispose() {
    this._cleanup();
    this.shadowRoot = null;
    this.announcer = null;
  }

  /**
   * Handle keyboard events on a claim
   * @param {KeyboardEvent} e 
   * @param {number} index 
   */
  handleKeyDown(e, index) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.moveFocus(index + 1);
        break;
      
      case 'ArrowUp':
        e.preventDefault();
        this.moveFocus(index - 1);
        break;
      
      case 'Home':
        e.preventDefault();
        this.moveFocus(0);
        break;
      
      case 'End':
        e.preventDefault();
        this.moveFocus(this.claims.length - 1);
        break;
        
      case 'ArrowRight':
        e.preventDefault();
        this.expandClaim(index);
        break;
        
      case 'ArrowLeft':
        e.preventDefault();
        this.collapseClaim(index);
        break;
    }
  }

  /**
   * Move focus to a target index
   * @param {number} targetIndex 
   */
  moveFocus(targetIndex) {
    if (this.claims.length === 0) return;
    
    // Bounds check
    if (targetIndex < 0) {
      targetIndex = this.claims.length - 1; // Wrap to end
    } else if (targetIndex >= this.claims.length) {
      targetIndex = 0; // Wrap to start
    }

    this.activeIndex = targetIndex;
    this.updateTabIndexes();
    
    // Focus the new target
    this.claims[this.activeIndex].focus();
    
    // Announce position
    // this.announce(`Claim ${this.activeIndex + 1} of ${this.claims.length}`);
  }

  /**
   * Update all tabindexes based on activeIndex
   */
  updateTabIndexes() {
    this.claims.forEach((claim, index) => {
      claim.setAttribute('tabindex', index === this.activeIndex ? '0' : '-1');
    });
  }

  /**
   * Expand the claim at the given index
   * @param {number} index 
   */
  expandClaim(index) {
    const header = this.claims[index];
    const isExpanded = header.getAttribute('aria-expanded') === 'true';
    
    if (!isExpanded) {
      // Logic for expansion (usually triggered by click handler on header)
      header.click(); 
      this.announce('Expanded');
    }
  }

  /**
   * Collapse the claim at the given index
   * @param {number} index 
   */
  collapseClaim(index) {
    const header = this.claims[index];
    const isExpanded = header.getAttribute('aria-expanded') === 'true';
    
    if (isExpanded) {
      header.click();
      this.announce('Collapsed');
    }
  }

  /**
   * Make a screen reader announcement
   * @param {string} message 
   */
  announce(message) {
    if (!this.announcer) return;
    
    // Clear first to ensure repeat messages are announced
    this.announcer.textContent = '';
    
    // Clear any existing timer
    if (this._announceTimer) {
      clearTimeout(this._announceTimer);
    }
    
    // Small timeout to ensure clearing is registered
    this._announceTimer = setTimeout(() => {
        if (this.announcer) {
            this.announcer.textContent = message;
        }
        this._announceTimer = null;
    }, 50);
  }

  /**
   * Clean up event listeners
   * (Note: Browsers handle this automatically when elements are removed, 
   * but good practice if we were reusing elements)
   */
}

// Export for module usage (if using modules) or global
// For Chrome Extension content scripts without modules, we attach to window
if (typeof window !== 'undefined') {
  window.ClaimNavigator = ClaimNavigator;
}
