// Safe, optional access to @shopify/react-native-skia.
//
// Skia is a third-party native module. It is present in a custom dev/release
// build but NOT in Expo Go, and a remote/low-end device could in theory fail to
// initialise it. Every editorial Skia effect treats Skia as best-effort: the
// require is wrapped so a missing module degrades to `null` instead of crashing
// the JS bundle, and render-time native failures are caught by SkiaErrorBoundary.
//
// Consumers must always provide a non-Skia fallback. Skia is decorative only and
// must never gate primary content (e.g. the album cover) from rendering.

type SkiaModule = typeof import('@shopify/react-native-skia');

let skiaModule: SkiaModule | null = null;

try {
  // Guarded require: throws at bundle-eval time only if the JS package itself is
  // absent. Native-view registration failures surface later, at mount, and are
  // handled by SkiaErrorBoundary.
  skiaModule = require('@shopify/react-native-skia') as SkiaModule;
} catch {
  skiaModule = null;
}

/** True when the Skia JS package resolved. Still pair every use with SkiaErrorBoundary. */
export const skiaAvailable = !!skiaModule?.Canvas;

/** The Skia module, or null when unavailable. Consumers must null-check. */
export const Skia: SkiaModule | null = skiaModule;
