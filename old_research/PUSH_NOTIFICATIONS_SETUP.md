# Push Notifications Setup Guide: Convex + SvelteKit + Netlify

This guide documents how to set up web push notifications with Convex (backend), SvelteKit (frontend), and Netlify (hosting). It includes all edge cases and debugging steps discovered during implementation.

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Browser       │     │   Netlify       │     │   Convex        │
│                 │     │   (Frontend)    │     │   (Backend)     │
│ Service Worker  │◄────│   SvelteKit     │     │   Node Runtime  │
│ Push Manager    │     │                 │     │   web-push lib  │
└────────┬────────┘     └─────────────────┘     └────────┬────────┘
         │                                               │
         │              ┌─────────────────┐              │
         └──────────────│   FCM/APNs      │◄─────────────┘
                        │   Push Service  │
                        └─────────────────┘
```

## Prerequisites

- Node.js 18+
- Convex project with Node.js runtime enabled
- SvelteKit project
- Netlify account and CLI

## Step 1: Generate VAPID Keys

VAPID (Voluntary Application Server Identification) keys are used to identify your server to push services.

```bash
npx web-push generate-vapid-keys
```

This outputs:
```
Public Key: BAMUxEus...  (87 characters, URL-safe base64)
Private Key: 95EfFLD...  (43 characters, URL-safe base64)
```

**CRITICAL**: Save these keys immediately. You'll need to use the SAME keys everywhere.

## Step 2: Install Dependencies

### Convex (Backend)
```bash
npm install web-push
```

### Create type definitions for web-push (convex/web-push.d.ts):
```typescript
declare module 'web-push' {
  export interface PushSubscription {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  }

  export interface SendResult {
    statusCode: number;
    body: string;
    headers: Record<string, string>;
  }

  export function setVapidDetails(
    subject: string,
    publicKey: string,
    privateKey: string
  ): void;

  export function sendNotification(
    subscription: PushSubscription,
    payload?: string | Buffer,
    options?: object
  ): Promise<SendResult>;
}
```

## Step 3: Environment Variables Setup

### ⚠️ CRITICAL EDGE CASE: Multiple Deployments

Convex may have multiple deployments (dev, prod, preview). You MUST verify which deployment your app is actually using.

Check your `.env` or `.env.local`:
```bash
cat .env.local | grep CONVEX
```

The `VITE_CONVEX_URL` tells you which deployment is being used (e.g., `disciplined-spider-126.convex.cloud`).

### Set Environment Variables

#### A. Netlify (Build-time variables for frontend)

```bash
# VITE_ prefix makes it available to the frontend at build time
netlify env:set VITE_VAPID_PUBLIC_KEY "BAMUxEus..."
```

Or via Netlify Dashboard: Site settings → Environment variables

#### B. Convex (Runtime variables for backend)

**⚠️ EDGE CASE**: Use the correct deployment name!

```bash
# List deployments to find the right one
npx convex env list

# If wrong deployment, specify explicitly:
npx convex env set VITE_VAPID_PUBLIC_KEY "BAMUxEus..." --deployment-name your-deployment-name
npx convex env set VAPID_PRIVATE_KEY "95EfFLD..." --deployment-name your-deployment-name
npx convex env set SITE_URL "https://your-app.netlify.app" --deployment-name your-deployment-name
```

**Verify the variables are set on the CORRECT deployment:**
```bash
npx convex env list --deployment-name your-deployment-name
```

### Required Variables Summary

| Variable | Where | Purpose |
|----------|-------|---------|
| `VITE_VAPID_PUBLIC_KEY` | Netlify + Convex | Public key for subscription |
| `VAPID_PRIVATE_KEY` | Convex only | Private key for signing |
| `SITE_URL` | Convex only | Used in VAPID mailto: subject |

## Step 4: Service Worker (static/sw.js)

Place in `/static/sw.js` for SvelteKit:

```javascript
self.addEventListener('push', function (event) {
  if (!event.data) return;

  const data = event.data.json();
  const title = data.title || 'Notification';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    tag: data.tag || 'default',
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windowClients) {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
```

## Step 5: Client-Side Notification Library (src/lib/notifications.ts)

```typescript
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function requestNotificationPermission(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push notifications not supported');
    return null;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    console.warn('Notification permission denied');
    return null;
  }

  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  // IMPORTANT: Unsubscribe from existing subscription (may have old VAPID key)
  const existingSubscription = await registration.pushManager.getSubscription();
  if (existingSubscription) {
    await existingSubscription.unsubscribe();
  }

  // Pass Uint8Array directly, NOT .buffer
  const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey  // NOT applicationServerKey.buffer
  });

  return subscription;
}
```

**⚠️ EDGE CASE**: `applicationServerKey` format

Some examples show `applicationServerKey.buffer as ArrayBuffer`. This can cause `Registration failed - push service error` in some browsers. Pass the `Uint8Array` directly instead.

## Step 6: Backend Notification Sender (convex/notificationsNode.ts)

```typescript
'use node';

import { action } from './_generated/server';
import * as webpush from 'web-push';

export const sendTest = action({
  args: {},
  handler: async (ctx) => {
    // Get user's push subscription from database
    const prefs = await ctx.runQuery(internal.notifications.getPreferencesByUserId, {
      userId: currentUserId
    });

    if (!prefs?.pushSubscription) {
      throw new Error('Push notifications not enabled');
    }

    const vapidPublicKey = process.env.VITE_VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const siteUrl = process.env.SITE_URL || 'http://localhost:5173';

    if (!vapidPublicKey || !vapidPrivateKey) {
      throw new Error('VAPID keys not configured on server');
    }

    webpush.setVapidDetails(
      `mailto:noreply@${new URL(siteUrl).hostname}`,
      vapidPublicKey,
      vapidPrivateKey
    );

    const subscription = JSON.parse(prefs.pushSubscription);

    const payload = JSON.stringify({
      title: 'Test Notification',
      body: 'Push notifications are working!',
      url: '/settings',
      tag: 'test-notification'
    });

    await webpush.sendNotification(subscription, payload);

    return { success: true };
  }
});
```

## Step 7: Database Schema

Store push subscriptions in user preferences:

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  userPreferences: defineTable({
    userId: v.string(),
    pushSubscription: v.optional(v.string()), // JSON stringified PushSubscription
    // ... other fields
  }).index('by_user', ['userId']),
});
```

## Step 8: Deploy

### Deploy Convex:
```bash
npx convex deploy --yes
```

### Deploy to Netlify:
```bash
netlify deploy --build --prod
```

**⚠️ CRITICAL**: After setting Netlify env vars, you MUST redeploy. The `VITE_` variables are embedded at build time.

## Debugging Guide

### Error: "VAPID credentials do not correspond to the subscription"

**Cause**: The subscription was created with a different VAPID public key than the server is using.

**Fix**:
1. Verify VAPID keys match in Netlify and Convex:
   ```bash
   netlify env:get VITE_VAPID_PUBLIC_KEY
   npx convex env get VITE_VAPID_PUBLIC_KEY
   ```
2. If different, update them to match
3. Redeploy Netlify (to bake in the new key)
4. Have user click "Refresh Subscription" to create new subscription with correct key

### Error: "Registration failed - push service error"

**Cause**: Invalid VAPID key format or incorrect `applicationServerKey` parameter.

**Fix**:
1. Verify VAPID key is valid (87 chars, starts with 'B'):
   ```javascript
   // Key should decode to 65 bytes
   const decoded = Buffer.from(key.replace(/-/g, '+').replace(/_/g, '/') + '==', 'base64');
   console.log(decoded.length); // Should be 65
   console.log(decoded[0]); // Should be 4 (uncompressed point marker)
   ```
2. Pass `Uint8Array` directly to `subscribe()`, not `.buffer`

### Error: "push subscription has unsubscribed or expired" (410 Gone)

**Cause**: The subscription endpoint stored in database is stale.

**Fix**: User needs to refresh their subscription (re-run the permission/subscribe flow).

### Notifications not appearing

1. Check browser permission: Click lock icon → Site settings → Notifications
2. Check macOS permissions: System Preferences → Notifications → [Browser]
3. Check Do Not Disturb / Focus mode
4. Verify service worker is registered: DevTools → Application → Service Workers

### "Notifications enabled" but subscription is stale

**Cause**: UI checks if `pushSubscription` exists in database, but doesn't verify it's valid.

**Fix**: Add validation or always show "Refresh Subscription" button.

## Edge Cases Checklist

- [ ] VAPID keys are identical in Netlify AND Convex
- [ ] Convex env vars are on the CORRECT deployment (dev vs prod)
- [ ] Netlify was redeployed AFTER setting env vars
- [ ] User refreshed subscription AFTER any VAPID key changes
- [ ] Service worker is at root scope (`/sw.js`, not `/src/sw.js`)
- [ ] `applicationServerKey` passed as `Uint8Array`, not `ArrayBuffer`
- [ ] Browser notifications are enabled at OS level
- [ ] Site is served over HTTPS (required for service workers)

## Testing Checklist

1. Generate fresh VAPID keys
2. Set in both Netlify and Convex (verify correct deployment!)
3. Redeploy Netlify
4. Clear browser site data (DevTools → Application → Storage → Clear site data)
5. Unregister any existing service workers
6. Click "Enable Notifications" - should prompt for permission
7. Grant permission
8. Click "Test Notification" - should receive push notification

## Useful Commands

```bash
# Generate new VAPID keys
npx web-push generate-vapid-keys

# Check Netlify env vars
netlify env:list

# Check Convex env vars (default deployment)
npx convex env list

# Check Convex env vars (specific deployment)
npx convex env list --deployment-name your-deployment

# Set Convex env var
npx convex env set VAR_NAME "value"

# Deploy Convex
npx convex deploy --yes

# Deploy Netlify with rebuild
netlify deploy --build --prod

# Check if service worker is accessible
curl -I https://your-site.netlify.app/sw.js
```
