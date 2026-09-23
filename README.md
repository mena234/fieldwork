# Fieldwork

An offline-first field collection app for carbon and agroforestry projects. Fieldwork helps surveyors register farmers, record visits, capture photos and boundaries, and track work through review.

**[Open the live demo](https://fieldwork.ramzy.tech/)** · [Developer guide](DEVELOPMENT.md)

## What you can explore

- Farmer records and visit timelines for consent, baseline, boundary, implementation, and monitoring.
- English/Hindi forms, conditional questions, drafts, photos, and GPS capture.
- Local storage and a visible sync queue, with CSV and GeoJSON exports.
- A guided introduction and an optional Supabase connection for shared projects and supervisor review.

## Try the demo

1. Open the demo and choose **Open local demo** to explore synthetic records.
2. Use **Take a tour**, then inspect a farmer and start a sample visit.
3. Switch language, inspect the map or boundary editor, and review the sync queue.

## Technology

Next.js, React, TypeScript, Tailwind CSS, Radix UI, Dexie/IndexedDB, MapLibre, and an optional Supabase backend.

## Run locally

Use Node.js 24 and npm. Leave Supabase variables unset for the local demo. Use a production build to try offline behavior:

```sh
git clone https://github.com/mena234/fieldwork.git
cd fieldwork
npm ci
npm run build
npm start
```

Open **http://localhost:3100/** online first and wait for offline readiness before disconnecting. `npm run dev` is available for editing, but its service worker is intentionally disabled. For a connected workspace, follow the [Supabase setup guide](DEVELOPMENT.md#configure-real-supabase) and configure `.env.local` before rebuilding.

## Checks

```sh
npm run typecheck
npm test
npm run build
```

## Scope and limitations

The local demo stores data on the current device; it does not sync to a server or complete supervisor review. Those flows require a configured Supabase project. Basemap imagery is online-only, browser storage can be evicted, and camera/GPS require permission and HTTPS outside localhost. Keep the app open when syncing.

## More detail

The [developer guide](DEVELOPMENT.md) covers connected setup, offline behavior, maps, and deployment. See [methodology templates](docs/methodology-templates.md) and [verification notes](docs/verification.md).
