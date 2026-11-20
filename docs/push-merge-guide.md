# Hosted push setup

Booking and shared chat notifications use the existing authenticated inbox, Socket.IO, and Web Push subscriptions. Admins and super admins now have chat access alongside guests and receptionists. Each subscribed device gets the recipient's alerts; the chat sender is excluded.

1. Configure the backend database, JWT_SECRET, and CLIENT_ORIGIN for your production domain.
2. Run `npm --prefix backend run setup:push` locally to generate or validate a VAPID pair. Copy VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT into your host environment secrets. Preserve the same pair between deploys. Never commit the private key.
3. Install dependencies, run `npm --prefix backend run migrate`, build with `npm --prefix frontend run build`, and start the backend with NODE_ENV=production. Serve the application over HTTPS.
4. Log in on each device, open Notifications, click Enable push notifications, and allow permission. On iOS/iPadOS 16.4+, add the app to the Home Screen and open it there first. [WebKit documentation](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
5. Click Send test notification and check the actual OS notification panel. Provider acceptance alone does not establish display. Background the app and have another account create/update a booking or send a chat message. Repeat for guest and admin on each device.

Logout disables push on that browser. Browser/OS background policies, Focus settings, connectivity, and notification permissions can prevent display. Unsupported devices cannot receive Web Push.

## Checks

- `npm --prefix frontend run build`
- `npm --prefix backend test` (requires local MySQL)
- `node scripts/verify-notifications.cjs`
- `node scripts/verify-push-client.cjs`
- `node scripts/verify-chat-notifications.cjs`

For this change, the build and standalone tests passed; database integration was blocked by unavailable MySQL at 127.0.0.1:3306. Hosted physical-device delivery must still be checked after host configuration. Merging or pushing branches does not deploy the app or transfer ignored environment keys.
