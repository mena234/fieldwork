# Verification record — 11 September 2026

## Verified

The implementation passed its production build and TypeScript checks. The original fieldwork implementation passed **22 unit/database tests**. With the onboarding addition, **8 browser end-to-end tests** cover the existing field workflow and the product tour.

| Acceptance check | Result and evidence |
| --- | --- |
| Reopen after initial setup while offline | Passed in Chrome with the production service worker. The browser tab was closed and reopened without network access. OS-level installed-app reopening on Android/iOS remains a device check. |
| Farmer, draft, submitted form, photo, boundary survive reload | Passed using real IndexedDB. The browser journey created an offline farmer with emulated GPS, submitted a complete conditional baseline with a compressed photo, saved a boundary submission, created a monitoring draft, then closed/reopened the tab. |
| Reconnecting uploads pending data | Queue order, confirmation handling, and upload metadata behavior passed controlled transport tests. Actual Supabase HTTP transfer is not verified without a configured account. |
| Repeated/interrupted sync has no duplicates | Passed with real PostgreSQL RPC mutation receipts and a controlled lost-response sync test. Pulling the already-committed record does not incorrectly stop receipt replay. Repeated Sync now calls are coalesced. |
| Failed uploads remain visible/retryable | Passed. Failed record writes retain the local record and queue. A successfully uploaded photo is not uploaded again when its metadata write is retried. Empty/unconfirmed server responses cannot mark records synced. |
| Supervisor can review synchronized submission | Database-level approval passed as a separate supervisor identity; surveyor/outsider review attempts failed. Review waits for photo metadata. Live Supabase/browser review remains a configuration check. |
| Surveyor receives review result | Supervisor changes were read as the surveyor under PostgreSQL RLS. Download merging updates clean local submissions; pending local edits are preserved. Full hosted-service roundtrip remains unverified. |
| RLS prevents other-project access | Passed in PostgreSQL with authenticated role switching: unassigned users cannot select projects, farmers, templates, or private Storage objects. Direct writes, self-promotion, and unassigned mutation RPCs are rejected. |
| CSV/GeoJSON contain captured data | Passed both pure export tests and actual browser downloads after the offline journey. Verified captured farmer name/village, answers, template version fields, and point/polygon features. |
| English/Hindi sample forms | Passed. All five JSON templates validate with bilingual labels. The browser switched the baseline renderer to Hindi, displayed Hindi labels and required-field errors, and switched back. |
| First-visit onboarding and replay | Passed. The guide automatically opens after local data loads, walks through six actual screens, remembers completion/dismissal, replays offline, and restores the original profile and trigger focus on Escape. Full records/queue snapshots are identical before and after the guide. |
| Accessible, responsive tour | Passed with keyboard Next/Back, a trapped Tab cycle, and Escape. Tour controls stay in the viewport at 320/375/414/768 px; Hindi steps also passed at 320 × 640. Desktop and mobile welcome/timeline screenshots were inspected. |
| Empty workspace and unfinished work | Passed. Empty projects explain how to add a first farmer; accounts without downloads get a setup guide. Automatic onboarding defers during an unfinished visit; a manually launched guide keeps the form mounted and preserves answers. |

Additional checks cover conditional required fields, numerical/date validation, declined consent (`false` is a valid answer), polygon crossing/range validation, CSV formula escaping, template immutability, preserved conflict archives, and edits made while an older record is uploading.

## Test boundaries

- Database tests run the exact SQL migration in PGlite, which executes PostgreSQL, with minimal local Auth/Storage schemas and an `auth.uid()` helper. They are meaningful SQL/RLS tests, not hosted Supabase Auth or Storage endpoint tests.
- Sync protocol tests use a controlled transport to inject committed-but-lost responses, failed uploads, and concurrent changes. The application itself never uses this transport.
- Browser tests used locally installed Chrome in headless mode, production HTML/JS/CSS, actual service-worker cache, actual IndexedDB, a real compressed fixture image, and **emulated** GPS coordinates/accuracy.
- At 320, 375, 414, and 768 CSS pixels, the browser checked page width and captured screenshots. Desktop registry and farmer timeline screenshots were inspected separately. Small-screen navigation uses a collapsible menu and farmer table rows become stacked records.
- Real phone camera capture, low-accuracy GPS outdoors, browser storage eviction behavior, installed Android/iOS app restart, and the final hosting origin's offline operation require device checks.
- No Supabase or Vercel credentials were supplied. Hosted authentication, project download, real media transfer, two-device sync/review, and Vercel deployment are not claimed as completed.

## Run again

```sh
npm ci
npm test
npm run build
npm run typecheck
npx playwright install chromium
npm run test:e2e
```

If Chrome is already installed, set `PW_CHANNEL=chrome` before the browser suite. The browser suite starts or reuses the production preview on port 3100. Screenshots are in `docs/screenshots/`; temporary failure traces are ignored under `test-results/`.
