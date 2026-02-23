### Error Handling

- Use explicit error messages with context
- Validate inputs at function boundaries
- Use TypeScript's strict null checks to prevent null reference errors
- Log errors through the Logger utility before throwing

### JSFL Compatibility Notes

- Target ES5 for Adobe Animate JSFL environment
- Avoid modern JavaScript features (arrow functions in some contexts, spread operator, etc.)
- Be aware that JSFL runs in an older JavaScript engine
