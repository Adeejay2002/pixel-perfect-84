# Jnex POS — jnex.com.lk

Landing page for Jnex POS (TanStack Start + React + Tailwind).

## Images
Images are in `public/images/` (hero, laptop, pos–pos5, all .webp).

## Build
`npm install && npm run build`

## Downloads (free trial modal)
The "දවස් 3ක් free" buttons open a modal with two downloads, served from `public/downloads/`:
- `Jnex-POS-Setup.exe` — **upload this manually to `public/downloads/`** (filename must match exactly)
- `Jnex-POS-User-Guide-Sinhala.pdf` — already included

Modal component: `src/components/TrialDownloadDialog.tsx` (file paths are defined at the top of that file).
