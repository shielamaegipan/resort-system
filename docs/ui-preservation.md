# UI preservation contract

Current implementation: [Advanced admin — original UI](advanced-admin.md). The latest requested upgrade keeps the original App/pages/CSS and appends the explicitly requested feature pages using the same sidebar buttons. The older four-item-only navigation and alternate-workspace entry-point notes below describe the earlier UI-preservation increment; they are superseded by the latest requirements. No More menu or replacement template is used.

The existing screenshots and current default Rooms, Bookings, Users and Reports views are the visual reference. Preserve the dark teal sidebar (`#093e44`), beige background (`#f4f0ea`), white cards, Fraunces headings, Figtree body text, spacing, borders and button styles. Keep Rooms as the initial employee view. The sidebar remains Rooms, Bookings, Users and Reports, filtered by server-provided permissions. Do not restore a More menu or replace the layout with a dashboard template.

Reuse `frontend/src/styles.css` and `frontend/src/admin/classic.css`. New components must inherit those tokens and controls. Only new feature panels and necessary responsive behavior should need additional styles. Existing server services, database tables, permission checks, Socket.IO cache invalidation and validation remain in use.

## Feature entry points

| Feature | Existing entry point |
|---|---|
| Live dashboard | Bookings → Booking options → Dashboard; Reports → Charts and detailed reports → Open dashboard |
| Room filters, dates, prices and capacities | Rooms → Search and filters |
| Room photos and amenities | Room card → Details & photos; Edit |
| Calendar and booking creation | Bookings → Booking options → Calendar / Create reservation |
| Check-in / check-out | Booking row actions, with server-enforced lifecycle, readiness and payment policy |
| Notifications | Existing header bell; persistent inbox, unread filter and related records |
| Payments, verification, refunds and receipts | Bookings → Booking options → Payments; Reports → Charts and detailed reports → Payments |
| Staff permissions and account management | Users → Roles, permissions and advanced staff management |
| Housekeeping | Rooms → Search and filters → Housekeeping; housekeeping employees use Room options → Housekeeping |
| Guest communication | Receptionist Room options → Chat |
| Resort receipt settings | Super Admin: Reports → Charts and detailed reports → Resort settings |

Employee menus show only authorized operations. Header option menus close after a selection and support Escape, so they cannot obscure booking actions. The four original sidebar entries are unchanged.

## Verification

Run `npm --prefix frontend run build` and `npm --prefix backend test`. The latter uses a uniquely named isolated MySQL database, verifies the existing permission/lifecycle/payment contracts, and exercises the current entry points. It also asserts the original sidebar items, colors and room-photo dimensions, and checks all feature pages at desktop, tablet and mobile widths. Existing application rows are compared before and after the run.

Before implementing these entry-point fixes, baseline screenshots and layout/style measurements were captured for Rooms, Bookings, Users and Reports. Afterward, all four desktop screenshots had identical dimensions and zero changed pixels. Measurements of card positions, typography, colors, spacing, borders and buttons also matched exactly. The comparison artifacts are under ignored `test-results/ui-preservation/`; they use an existing isolated verification database, not production data.

Manual electronic-payment verification, browser Print / Save as PDF, explicit first-Super-Admin provisioning and the deployment limitations documented in [platform-upgrade.md](platform-upgrade.md) still apply.

Latest verification (2026-11-11): production build passed; 129 integrated API/browser checks passed against isolated database `resort_platform_verify_1794402428542`; the Postman collection passed 22 assertions across ten requests. Original-page PNG files were byte-for-byte identical before and after the changes. The suite also exercised advanced staff role assignment, housekeeping access and the notification unread empty state. All pre-existing application rows matched their snapshots. No backend source changes or new schema migrations were needed for this increment.
