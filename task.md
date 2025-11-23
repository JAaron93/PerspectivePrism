# Updating ConfigValidator for Security

- [x] Read `.kiro/specs/youtube-chrome-extension/design.md` (ConfigValidator section)
- [x] Update `ConfigValidator.validate` method
    - [x] Validate `allowInsecureUrls` type (boolean)
    - [x] Add production safeguard (error if true in production)
    - [x] Add warning if enabled in development
- [ ] Verify changes
