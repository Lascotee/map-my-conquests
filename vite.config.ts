// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // Generate Vercel's Build Output API layout instead of the Lovable default
  // Cloudflare Worker bundle.
  nitro: {
    preset: "vercel",
    // Nitro v3 beta can create circular SSR chunks for this dependency graph.
    // A single server bundle avoids invalid cross-chunk exports on Vercel.
    inlineDynamicImports: true,
  } as { preset: string },
});
