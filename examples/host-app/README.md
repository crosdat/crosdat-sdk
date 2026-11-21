# crosdat SDK External Host Demo

Runnable host application demonstrating how an external hospital portal or EHR embeds **crosdat** clinical tools without touching crosdat internals:

- **Vanilla HTML & Plain CSS (`/vanilla.html`)** — zero React or Tailwind; uses `<crosdat-clinical-embed>`, `mountClinicalEmbed()`, and plain `fetch()` calls against HQ Console `/api/v1/*`.
- **React + Full SDK Suite (`/`)** — mounts all 7 embed modules (`ClerkingEmbed`, `GrowthChartEmbed`, `ClinicalCalculatorsEmbed`, `DosePrescriberEmbed`, `NeonatalTpnEmbed`, `ClinicalGuideEmbed`, `ClinicalLearningStationEmbed`) alongside the `<crosdat-clinical-embed>` Web Component and an interactive headless HTTP explorer.

## Running locally

Build `crosdat-sdk` packages first:

```sh
cd ../.. && pnpm build
```

Then start the host demo dev server with your commercial licensee key (kept server-side in Vite middleware, never bundled into browser code):

```sh
CROSDAT_DEMO_API_KEY="ck_test_..." \
CROSDAT_HQ_API_BASE="http://127.0.0.1:18080/api" \
npx --yes vite --config vite.config.ts
```

Or open the vanilla HTML surface directly at `http://127.0.0.1:18083/vanilla.html`.
