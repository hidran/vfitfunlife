# Firebase Cloud Functions Best Practices

## Node.js Runtime Version

### Recommended Version
**Use Node.js 20** - This is the latest recommended and actively supported runtime for Cloud Functions for Firebase.

### Version Status

| Version | Status | Notes |
|---------|--------|-------|
| Node.js 20 | ✅ **Recommended** | Latest stable, full feature support |
| Node.js 18 | ⚠️ **Deprecated** | Still works but approaching end of support |
| Node.js 16 | ❌ **Avoid** | End of support |
| Node.js 14 | ❌ **Avoid** | End of support |

### package.json Configuration

```json
{
  "engines": {
    "node": "20"
  }
}
```

## Firebase Functions SDK

### Recommended Version
Always use the **latest stable version** of `firebase-functions` SDK.

### Key Version Milestones

| SDK Version | Feature Support |
|-------------|-----------------|
| 5.x | Latest stable - Recommended |
| 4.3.0+ | 2nd Generation Functions support |
| 4.x | Minimum for modern features |

### Installation

```bash
npm install firebase-functions@latest firebase-admin@latest
```

### package.json Example

```json
{
  "dependencies": {
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^5.0.0"
  }
}
```

## Function Generation

### 1st Generation vs 2nd Generation

| Feature | 1st Gen | 2nd Gen |
|---------|---------|---------|
| Import | `firebase-functions/v1` | `firebase-functions/v2` |
| Node.js 20 | Limited support | ✅ Full support |
| CPU/Memory control | Limited | Granular control |
| Cold starts | Higher | Lower |
| Concurrency | Single | Up to 1000 |

### Migration to 2nd Generation (Recommended)

```typescript
// Before (1st Gen)
import * as functions from "firebase-functions/v1";

export const myFunction = functions.https.onCall((data, context) => {
  // ...
});

// After (2nd Gen)
import * as functions from "firebase-functions/v2";

export const myFunction = functions.https.onCall(
  { region: "europe-west1" },
  (request) => {
    // ...
  }
);
```

## Deployment Checklist

Before deploying functions:

1. **Update Dependencies**
   ```bash
   npm update firebase-functions firebase-admin
   ```

2. **Check Node.js Version**
   ```bash
   node --version  # Should be 20.x
   ```

3. **Run Linting**
   ```bash
   npm run lint
   ```

4. **Build Successfully**
   ```bash
   npm run build
   ```

5. **Test Locally**
   ```bash
   firebase emulators:start
   ```

## Common Issues and Solutions

### Error: Cannot set CPU on gen 1 functions

**Solution**: Use 2nd generation functions for granular CPU/memory control.

### Error: Node.js version mismatch

**Solution**: Ensure your `engines.node` in package.json matches your local Node.js version:
```json
"engines": {
  "node": "20"
}
```

### Error: firebase-functions SDK outdated

**Solution**: Update to latest:
```bash
npm install firebase-functions@latest
```

## Performance Best Practices

1. **Use 2nd Generation Functions** for better cold start performance
2. **Set appropriate memory limits** based on function needs
3. **Use regional functions** close to your users (e.g., `europe-west1`)
4. **Implement proper error handling** with structured logging
5. **Use TypeScript** for type safety and better developer experience

## Example: Modern Function Setup

```typescript
// functions/src/index.ts
import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v2";

admin.initializeApp();

// 2nd Gen HTTP function with proper configuration
export const myApiFunction = functions.https.onCall(
  {
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 30,
    minInstances: 0,
    maxInstances: 100,
  },
  async (request) => {
    // Function implementation
    return { success: true };
  }
);
```

## Resources

- [Firebase Functions Documentation](https://firebase.google.com/docs/functions)
- [Migrate to 2nd Gen Functions](https://firebase.google.com/docs/functions/2nd-gen-upgrade)
- [Node.js Runtime Options](https://firebase.google.com/docs/functions/manage-functions#set_nodejs_version)
