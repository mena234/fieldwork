# Fieldwork: developer guide

[Back to the project overview](README.md) · [Live demo](https://fieldwork.ramzy.tech/)

These notes retain implementation details and earlier verification records. Deployment identifiers and hosted configuration refer to the original deployment; configure your own project, resources, and secrets when deploying a fork. Historical test results are not a claim that a fresh installation was tested during this documentation update.

An offline-first carbon project field collection MVP built with Next.js App Router, TypeScript, Tailwind CSS, shadcn-style Radix primitives, Dexie, MapLibre, and Supabase.

The app contains a working local demonstration and a real Supabase client implementation. **No server is simulated in the app.** Without Supabase configuration, the demo stores records and photo blobs in IndexedDB, displays an explicit local-demo banner, and refuses to report cloud synchronization or review as successful.

## Start locally

Requires Node.js 22.14+ (tested with Node 24) and npm.

```sh
npm ci
cp .env.example .env.local
# Add the Supabase project URL and publishable/anon key for a connected workspace.
npm run build
npm start
```

Open **http://localhost:3100**. Choose **Open local demo** to explore the included synthetic records. To verify offline behavior, use the production build above, not the development server. `npm run dev` is available for editing; its placeholder service worker deliberately unregisters itself.

New workspace visitors see a guided introduction automatically. **Take a tour** in the top bar replays it at any time. The guide spotlights the farmer registry, visit timeline, form library, map, sync queue and supervisor review, explaining what each screen means and what to do next. It supports English/Hindi, phones, keyboard navigation (arrow keys, Tab and Escape), and offline use. Completion or dismissal is remembered per account on this browser. Accounts without a downloaded project receive a preparation guide first. Tours launched inside an unfinished visit keep that form mounted; closing a tour returns to the original screen without modifying field records.

`npm run build` exports Next.js to `out/` and generates an atomic, content-versioned precache of the HTML, JavaScript, CSS, fonts, icons, and manifest. All workflow screens use hash navigation inside one cached App Router shell. Supabase data and map imagery are never cached in the service worker.

## Configure real Supabase

1. Create a dedicated Supabase project. In **SQL Editor**, run [`supabase/migrations/202609110001_fieldwork.sql`](supabase/migrations/202609110001_fieldwork.sql) once. Alternatively, link the Supabase CLI and run `supabase db push`.
2. The migration creates projects, memberships, immutable form templates, farmers, submissions, media metadata, mutation receipts, review RPCs, and the private `field-photos` Storage bucket with project-scoped policies.
3. In Authentication, enable email/password. Disable public user signup if appropriate for the deployment. The app has no sign-up or self-assigned role flow. Email-confirmed demo accounts are created only by the trusted seed script.
4. Set `.env.local`:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY=YOUR_SECRET_SERVICE_ROLE_KEY
   DEMO_USER_PASSWORD=YOUR_UNIQUE_DEMO_PASSWORD_AT_LEAST_12_CHARACTERS
   ```

5. Run `npm run seed`. The script creates four synthetic accounts: `surveyor@fieldwork.example`, `supervisor@fieldwork.example`, `admin@fieldwork.example`, and `outsider@fieldwork.example`. The first three belong to Narmada Agroforestry; the outsider belongs only to a separate project. All newly created accounts use `DEMO_USER_PASSWORD`. Existing account passwords are not changed. Never run this seed against an unrelated production project.
6. The seed adds 8 synthetic farmers, 18 submissions across five stages (including two monitoring visits for Ramesh Patel), and five bilingual templates. Farmer Kamla Devi has explicitly declined consent. Reruns retain existing records and template versions.
7. Rebuild and start. Sign in as the surveyor, select Narmada Agroforestry, and **Download for offline use**. Wait for **Ready for offline use** before disconnecting. The download includes templates, records, review history, and private photo blobs.
8. Use a second browser profile or device for the supervisor to demonstrate separate local storage. Download the project, review synchronized submissions, then sync the surveyor to receive the result.

Service-role credentials are used by `scripts/seed.ts` only. Never configure them with a `NEXT_PUBLIC_` prefix or put them in the deployment's browser environment. Initial project/admin membership provisioning is a trusted server operation.

## Demonstrate the core journey

1. Sign in online and download the assigned project.
2. Disable networking or use browser offline mode.
3. Register a farmer, capture GPS if the device permits it, and start a baseline visit. Required fields and conditional questions validate locally.
4. Change language using **EN / हिन्दी**. Drafts save on each edit into an IndexedDB transaction that also updates the durable queue.
5. Take/upload a photo. The app resizes to a maximum 1,600-pixel dimension and reduces JPEG quality toward 300 KB, keeping a quality floor. The resulting size is displayed. Up to three photos are retained per submission.
6. Submit the visit. Create consent, boundary, implementation, and repeated monitoring visits from the same farmer timeline.
7. Close the tab/app, reopen it offline, and check your farmer, draft, photo, and boundary.
8. Reconnect and keep the app open. Sync runs on reconnect; **Sync now** also triggers it. Farmers precede submissions, which precede photo uploads and metadata. Failed items remain visible and retryable.
9. A signed-in supervisor opens **Review queue**, inspects the submission, and approves or returns it with a comment. Review requires online access and uploaded photo metadata. The surveyor receives the reviewed version on the next sync.
10. Export CSV and GeoJSON. Exports describe the records downloaded on the current device, including unsynced data. CSV includes IDs, stage, version, timestamps, answers, media IDs, review history, and workflow/sync states; formula-like cells are escaped. GeoJSON includes points and all recorded boundary visits, retaining identifiers and timestamps.

## Data integrity and access

- Farmer IDs, submission IDs, media IDs, and mutation IDs are client-generated UUIDs. Human-readable references are labels; UUIDs are the identity.
- Tables are protected with membership RLS. Authenticated browser roles receive SELECT only; no direct data mutations are granted. Checked database RPCs enforce membership, collector ownership, allowed workflow transitions, server-side field validation, and template version pinning. Storage uses equivalent project/submission restrictions with immutable object paths.
- `fieldwork_write` serializes writes per entity, atomically stores mutation receipts, and compares the expected revision. Retrying a committed mutation after a lost response returns its receipt instead of inserting again.
- The sync queue is durable. An edit made during a request gets a new mutation ID and is retained after the older response. The next sync uses the confirmed base revision. Successful photo blobs are not re-uploaded after a metadata failure.
- Submitted and approved visits cannot be edited in place. Returned visits can become a corrected draft; review comments remain in their history. New visits get new IDs and preserve older submissions.
- Concurrent changes produce a conflict. **Use server copy** archives the local version first; **Retry local changes** rebases an editable local version against the downloaded server revision. Submitted/approved records cannot be overwritten through conflict resolution. Archived copies can be exported.
- Local databases are separate for each signed-in user and for the synthetic demo. Signing out preserves local work for that same account; signing in as a different account does not open it.
- Browser/device possession is trusted for offline access. The cache is not separately encrypted or PIN-locked; clear browser data only after confirmed sync/export. Use managed devices for actual field use.

## Maps and GPS

MapLibre uses OpenStreetMap raster tiles with attribution for development. Configure `NEXT_PUBLIC_SATELLITE_TILE_URL` with a browser-safe, domain-restricted token and the matching `NEXT_PUBLIC_SATELLITE_ATTRIBUTION` for a licensed satellite provider. Check the provider's usage terms and quotas before field deployment. Satellite and other basemaps are **online-only**.

GPS capture watches for up to 18 seconds, keeping the best fix. The default accuracy target is 20 metres, configurable per project in the database. A less accurate fix requires an explicit override reason. Coordinate, accuracy, and timestamp data are retained. Real location and camera access require HTTPS (localhost is allowed for development).

Boundary entry supports one simple polygon per visit: tap an online map, drag vertices, capture ordered GPS fixes offline, or enter/edit a coordinate list. It validates closure, unique vertices, coordinate ranges, nonzero area, and crossing edges on the client. The database checks basic polygon structure and coordinate ranges. A standalone geometry preview remains available without WebGL or a basemap. Area is an approximate spherical calculation in hectares; professional GIS verification is deferred.

## Add/update methodology templates

See [`docs/methodology-templates.md`](docs/methodology-templates.md) and the five files in [`templates/`](templates/). An admin uploads JSON under Project settings, reviews the validated field count, then publishes a new version online. Duplicate project/stage versions are rejected; published versions cannot be replaced. Surveyors download new versions on their next sync. Drafts and submitted visits keep their original template ID/version.

## Deploy to Vercel

1. Push this folder as its own Git repository and import it in Vercel.
2. Choose **Other** as the framework preset for this explicit static-export deployment. Set **Build Command** to `npm run build`, **Output Directory** to `out`, and **Install Command** to `npm ci`. Use Node.js 22 or 24.
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as build environment variables. Add the optional satellite tile URL/attribution if used. **Do not add the service-role key or seed password.**
4. Deploy. Set Supabase Auth's Site URL to your HTTPS deployment origin. Password sign-in does not rely on a callback route; add the origin to allowed redirect URLs if enabling future auth flows.
5. Open the HTTPS site, sign in, download the project, wait for offline readiness, install via the browser menu, and perform the acceptance checks on the actual field devices. Public environment values are baked into the static build; rebuild after any change.
6. `vercel.json` sets the service worker to revalidate and keeps same-origin isolation off so standard raster maps work normally.

Without Supabase variables, a hosted build remains a local-data demonstration. Verify offline installation and reopening on the final HTTPS origin and intended devices.

## Tests and actual verification

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

For an installed Chrome browser, use `PW_CHANNEL=chrome npm run test:e2e` (PowerShell: `$env:PW_CHANNEL='chrome'; npm run test:e2e`).

- Unit/integration tests exercise IndexedDB persistence and the queue protocol with a controlled transport.
- The database suite runs the exact migration in PGlite (real PostgreSQL compiled to WebAssembly), bootstrapping Supabase-compatible Auth and Storage schemas. It executes RLS and RPCs as separate authenticated users. This validates database logic; it does not test Supabase's hosted Auth/Storage HTTP services.
- Browser tests use a production build, real IndexedDB/service-worker caching, offline networking, photo blobs, and an emulated GPS fix. See [`docs/verification.md`](docs/verification.md) for results and remaining live-service/device checks.

## Known limits and production work

- No live Supabase or Vercel credentials were supplied during implementation. Hosted sign-in, real Storage transfer, and cloud review roundtrips need a configured account before production acceptance. No success is simulated.
- Offline background sync is intentionally unsupported; keep the app open. The PWA must finish its first online cache/download, and browser storage can still be evicted. Persistent-storage permission is requested during download, but the browser may decline it.
- Download and pull scan assigned project records in pages of 500. Large projects, many photos, delta sync, deletions/tombstones, and revoked-membership cache erasure need a production design. A user whose membership is removed cannot access/sync server data; already-downloaded data remains physically on that device.
- Submission/queue record writes are transactionally durable. Switching accounts, editing the same draft in multiple tabs, and administrative revocation during a sync should receive additional real-device testing. One sync per account/origin is serialized using the Web Locks API where available.
- Photo compression is a size target, not a guarantee; JPEG quality bottoms out to preserve legibility. Maximum upload size is 5 MB. HEIC support depends on the browser's decoder. There is no media deletion UI, so captured evidence remains immutable.
- Browser camera/GPS permissions and actual installation/reopening on Android/iOS require device validation. GPS was emulated in browser tests.
- The consent statement is configurable and explicitly a workflow demonstration, not a legal-compliance guarantee. Field deployment requires project/community review of the statement.
- No offline imagery packs, KML, advanced GIS, automatic conflict merging, MRV calculations, enterprise provisioning, production scale guarantee, audit-log retention policy, or advanced reporting.
- Add monitored backups, device security, export governance, accessibility auditing, error telemetry, schema version migration rehearsal, storage quotas, stable reference allocation, template change review, and a live Supabase integration test environment before production use.

## Technical references

[Next.js PWA guidance](https://nextjs.org/docs/app/guides/progressive-web-apps), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), and [private Storage access control](https://supabase.com/docs/guides/storage/security/access-control).
