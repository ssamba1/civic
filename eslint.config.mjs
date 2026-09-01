import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  //
  // Declaring globalIgnores at all REPLACES the config's defaults, so the four
  // defaults have to be restated here — dropping one silently un-ignores it.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // Cesium's prebuilt runtime. scripts/copy-cesium-assets.mjs writes 14 MB of
    // vendored, minified JS here on every install (postinstall) and every build
    // (prebuild), so it is present in any checkout anyone actually lints, and
    // gitignored so it is never reviewed. ESLint does not read .gitignore, so
    // without this entry it lints all of it: `pnpm exec eslint .` reports
    // 13,738 problems, of which 13,500 are Cesium's. That is a 98% noise floor
    // — the 238 findings in our own code are unreadable underneath it.
    "public/cesium/**",
  ]),
]);

export default eslintConfig;
