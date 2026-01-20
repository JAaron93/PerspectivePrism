import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Import the file to register ClaimNavigator on window
import '../../claim-navigator.js';

describe('ClaimNavigator', () => {
  let shadowRoot;
  let announcer;
  let navigator;
  let claims;

  beforeEach(() => {
    // Setup DOM environment
    document.body.innerHTML = '';
    shadowRoot = document.createElement('div').attachShadow({ mode: 'open' });
    
    // Create announcer
    announcer = document.createElement('div');
    announcer.id = 'pp-announcer';
    shadowRoot.appendChild(announcer);

    // Create claim headers
    claims = [];
    for (let i = 0; i < 3; i++) {
      const claim = document.createElement('div');
      claim.className = 'claim-header';
      claim.setAttribute('role', 'button');
      claim.setAttribute('aria-expanded', 'false');
      shadowRoot.appendChild(claim);
      claims.push(claim);
    }

    // Initialize navigator
    navigator = new window.ClaimNavigator(shadowRoot, announcer);
    navigator.init(claims);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (navigator) {
        navigator.dispose();
    }
  });

  it('should initialize correctly', () => {
    expect(navigator.activeIndex).toBe(0);
    expect(claims[0].getAttribute('tabindex')).toBe('0');
    expect(claims[1].getAttribute('tabindex')).toBe('-1');
    expect(claims[2].getAttribute('tabindex')).toBe('-1');
  });

  it('should handle ArrowDown navigation', () => {
    const focusSpy = vi.spyOn(claims[1], 'focus');
    
    // Simulate ArrowDown on first item
    navigator.handleKeyDown({ key: 'ArrowDown', preventDefault: vi.fn() }, 0);
    
    expect(navigator.activeIndex).toBe(1);
    expect(claims[0].getAttribute('tabindex')).toBe('-1');
    expect(claims[1].getAttribute('tabindex')).toBe('0');
    expect(focusSpy).toHaveBeenCalled();
  });

  it('should handle ArrowUp navigation', () => {
    // Move to second item first
    navigator.activeIndex = 1;
    navigator.updateTabIndexes();
    
    const focusSpy = vi.spyOn(claims[0], 'focus');
    
    // Simulate ArrowUp on second item
    navigator.handleKeyDown({ key: 'ArrowUp', preventDefault: vi.fn() }, 1);
    
    expect(navigator.activeIndex).toBe(0);
    expect(claims[0].getAttribute('tabindex')).toBe('0');
    expect(claims[1].getAttribute('tabindex')).toBe('-1');
    expect(focusSpy).toHaveBeenCalled();
  });

  it('should handle Home and End keys', () => {
    const focusFirst = vi.spyOn(claims[0], 'focus');
    const focusLast = vi.spyOn(claims[2], 'focus');

    // Test End
    navigator.handleKeyDown({ key: 'End', preventDefault: vi.fn() }, 0);
    expect(navigator.activeIndex).toBe(2);
    expect(focusLast).toHaveBeenCalled();

    // Test Home
    navigator.handleKeyDown({ key: 'Home', preventDefault: vi.fn() }, 2);
    expect(navigator.activeIndex).toBe(0);
    expect(focusFirst).toHaveBeenCalled();
  });

  it('should wrap around navigation', () => {
    const focusFirst = vi.spyOn(claims[0], 'focus');
    const focusLast = vi.spyOn(claims[2], 'focus');

    // Down from last item -> First
    navigator.activeIndex = 2;
    navigator.handleKeyDown({ key: 'ArrowDown', preventDefault: vi.fn() }, 2);
    expect(navigator.activeIndex).toBe(0);
    expect(focusFirst).toHaveBeenCalled();

    // Up from first item -> Last
    navigator.activeIndex = 0;
    navigator.handleKeyDown({ key: 'ArrowUp', preventDefault: vi.fn() }, 0);
    expect(navigator.activeIndex).toBe(2);
    expect(focusLast).toHaveBeenCalled();
  });

  it('should expand claim on ArrowRight', () => {
    const claim = claims[0];
    claim.setAttribute('aria-expanded', 'false');
    const clickSpy = vi.spyOn(claim, 'click');
    const announceSpy = vi.spyOn(navigator, 'announce');

    navigator.handleKeyDown({ key: 'ArrowRight', preventDefault: vi.fn() }, 0);
    
    expect(clickSpy).toHaveBeenCalled();
    expect(announceSpy).toHaveBeenCalledWith('Expanded');
  });

  it('should not expand (click) if already expanded on ArrowRight', () => {
    const claim = claims[0];
    claim.setAttribute('aria-expanded', 'true');
    const clickSpy = vi.spyOn(claim, 'click');

    navigator.handleKeyDown({ key: 'ArrowRight', preventDefault: vi.fn() }, 0);
    
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('should collapse claim on ArrowLeft', () => {
    const claim = claims[0];
    claim.setAttribute('aria-expanded', 'true');
    const clickSpy = vi.spyOn(claim, 'click');
    const announceSpy = vi.spyOn(navigator, 'announce');

    navigator.handleKeyDown({ key: 'ArrowLeft', preventDefault: vi.fn() }, 0);
    
    expect(clickSpy).toHaveBeenCalled();
    expect(announceSpy).toHaveBeenCalledWith('Collapsed');
  });

  it('should make announcements via ARIA live region', () => {
    vi.useFakeTimers();
    
    navigator.announce('Test Message');
    
    expect(announcer.textContent).toBe(''); // Cleared first
    
    vi.advanceTimersByTime(50);
    
    expect(announcer.textContent).toBe('Test Message');
    
    vi.useRealTimers();
  });
});
