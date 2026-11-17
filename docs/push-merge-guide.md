# Browser push: setup, verification, merge, and push

The new fix is currently uncommitted on `feature/guest/notifications`. It keeps the push Service Worker across development reloads, shows per-device subscription status, provides a real server-to-push-provider test button, handles subscription timeout/expiry, and opens the inbox when a device notification is clicked.

## 1. Configure and run on each deployment

From the repository root:

```powershell
npm --prefix backend run setup:push
```

This validates and preserves an existing VAPID pair or generates one in the ignored `backend/.env`. It never prints the private key. If the file is newly created, also configure its database connection and a strong JWT_SECRET before starting the server. Set VAPID_SUBJECT to the deployment's contact mailto address or HTTPS URL.

Stop the existing backend with Ctrl+C in its terminal, then restart:

```powershell
npm --prefix backend start
```

In another terminal:

```powershell
npm --prefix frontend run dev
```

Use localhost locally; use HTTPS on a deployed site. A plain HTTP LAN address on a phone is not an equivalent secure origin. Browser push requires the user's permission and a working browser push provider. A closed app tab can receive supported background push, but the operating system and browser must permit background delivery.

## 2. Verify an actual device notification

1. Sign in. Admin/staff: open the bell dropdown. Guest: open Notifications.
2. Click **Enable push notifications** and grant the browser permission.
3. Wait until **Push is enabled on this device** appears.
4. Click **Send test notification**. This sends an authenticated POST to `/api/push/test` for the current user's device endpoint. It does not fake delivery by calling showNotification from the page.
5. Check the operating-system notification panel. Provider acceptance is reported separately and does not itself prove a displayed notification.
6. Click the alert: an existing app window should focus and open its inbox. If no app window exists, it should open with an inbox target; sign in if requested.
7. Repeat with a second session creating or confirming a booking while the intended recipient's application is backgrounded. Do not log out for this test: logout intentionally unsubscribes that device.

If permission is blocked, change this site's notification permission in browser settings. Check operating-system notifications and Do Not Disturb/Focus settings. If the browser cannot create a subscription, check network access to its push service. If the server cannot accept the test, verify its keys and restart it. An expired endpoint should prompt re-enabling push.

Automated evidence: 202 integration checks passed; the notification logic tests cover per-device test authorization, rate limiting, provider acceptance responses, expiry cleanup, Service Worker display/click behavior, and development cache bypass. A separate headless Chrome provider attempt was denied during subscription creation, so a real device alert still requires the manual steps above.

## 3. Commit only the updated source and documentation

Run these commands one step at a time. Stop on any error or merge conflict.

```powershell
git switch feature/guest/notifications
git add backend frontend scripts docs/notifications.md docs/push-merge-guide.md
git commit -m "Improve browser push setup testing and background delivery"
git stash push -m "Local push verification artifacts" -- test-results
git fetch origin
git push origin feature/guest/notifications
```

The stash keeps generated test artifacts out of the source commit. `No local changes to save` is harmless. Never add backend/.env or share the VAPID private key. If the push is rejected because somebody updated the remote, stop and review the new commits; do not force-push.

## 4. Merge into main, verify, then push

```powershell
git switch main
git pull --ff-only origin main
git merge feature/guest/notifications
npm --prefix frontend run build
npm --prefix backend test
node scripts/verify-notifications.cjs
node scripts/verify-push-client.cjs
```

Only after all checks pass:

```powershell
git stash push -m "Main push verification artifacts" -- test-results
git push origin main
```

If main is protected, create a GitHub pull request from `feature/guest/notifications` to `main` instead of pushing directly. Merge it after review, then update local main using `git pull --ff-only origin main` before continuing.

## 5. Update the other branches from main

For each branch below, run the merge block, repeat the four verification commands from step 4, then run its push block. Stash only generated test-results files before switching branches.

### Ef-branch

```powershell
git switch Ef-branch
git pull --ff-only origin Ef-branch
git merge main
```

After verification:

```powershell
git stash push -m "Ef push verification artifacts" -- test-results
git push origin Ef-branch
```

### feature/admin/reports

```powershell
git switch feature/admin/reports
git pull --ff-only origin feature/admin/reports
git merge main
```

After verification:

```powershell
git stash push -m "Reports push verification artifacts" -- test-results
git push origin feature/admin/reports
```

### daculo-branch

If the branch is not local yet:

```powershell
git switch --track origin/daculo-branch
```

If it already exists locally, use `git switch daculo-branch`. Then:

```powershell
git pull --ff-only origin daculo-branch
git merge main
```

After verification:

```powershell
git stash push -m "Daculo push verification artifacts" -- test-results
git push origin daculo-branch
```

Return to the notification branch and incorporate main's merge:

```powershell
git switch feature/guest/notifications
git merge main
git push origin feature/guest/notifications
```

## 6. Conflicts and final audit

If a merge reports conflicts, stop before pushing. Open Source Control → Merge Changes → Resolve in Merge Editor. Preserve the required changes from both branches; do not blindly accept all incoming files. Stage each resolved file, then run `git merge --continue` and repeat verification. To cancel an unresolved merge, use `git merge --abort`.

Final audit:

```powershell
git fetch origin
git status
git branch -avv
git branch -r --contains feature/guest/notifications
```

All intended remote branches should contain the current notification branch tip. A different latest commit can be valid if a branch has its own additional commits; ancestry, successful tests, and synchronization with its remote are what matter. Pushing Git branches does not deploy/restart an application or transfer ignored environment keys.

Reference: [MDN PushManager.subscribe](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe) and [Service Worker notificationclick](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/notificationclick_event).
