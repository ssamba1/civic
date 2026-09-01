/**
 * The whole Tailwind wiring, and the only file that says so.
 *
 * Tailwind v4 has no `tailwind.config.js` — there is no config file to find,
 * and looking for one and coming up empty is the first thing that happens to
 * anyone new to this repo. Everything that used to live there is now CSS:
 *
 *   src/app/globals.css   `@import "tailwindcss"`, the `@theme inline` token
 *                         block that registers the semantic utilities
 *                         (bg-surface, text-subtle, border-hairline, …), and
 *                         `@custom-variant dark` — which replaces v3's
 *                         `darkMode: 'class'` and is why `.dark` on <html>
 *                         themes the entire app.
 *
 * This file is the bridge that makes that CSS mean anything: without the
 * plugin, `@import "tailwindcss"` is an unresolved import and every utility
 * class in the app renders as nothing. Next reads it automatically; it is not
 * referenced from next.config.ts, which is the other place people look.
 *
 * No autoprefixer entry, and none is needed — v4 does its own vendor
 * prefixing and browser targeting.
 *
 * @type {import('postcss-load-config').Config}
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
