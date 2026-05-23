import { env } from './env';

// Sentry is wired in lazily so the app boots without DSN.
// To enable: install `@sentry/react-native`, set EXPO_PUBLIC_SENTRY_DSN, and uncomment below.
//
// import * as Sentry from '@sentry/react-native';
//
// export function initSentry() {
//   if (!env.sentryDsn) return;
//   Sentry.init({
//     dsn: env.sentryDsn,
//     environment: env.env,
//     enableAutoSessionTracking: true,
//     tracesSampleRate: env.env === 'production' ? 0.1 : 1.0,
//   });
// }

export function initSentry(): void {
  if (!env.sentryDsn) return;
  // No-op until @sentry/react-native is installed.
  // eslint-disable-next-line no-console
  console.warn('[sentry] DSN provided but @sentry/react-native is not installed yet.');
}
