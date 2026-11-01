/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';
import { isSensitivePath } from './pwa/sensitivePaths';

declare let self: ServiceWorkerGlobalScope;

// New shell takes over as soon as it is installed. Sensitive documents are
// never precached, so claiming clients does not serve a stored payment page.
self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();

precacheAndRoute(self.__WB_MANIFEST);

const OFFLINE_URL = '/offline.html';

async function offlineResponse(): Promise<Response> {
  const cached = await caches.match(OFFLINE_URL, { ignoreSearch: true });
  if (!cached) return Response.error();
  const headers = new Headers(cached.headers);
  // Do not let the browser store this body under the page URL the user asked for.
  headers.set('Cache-Control', 'no-store');
  return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers });
}

// Public navigations stay network-fresh. Only a failed fetch (offline) is
// answered, and then with the static offline page — never with a stored copy
// of another route. Auth, dashboard, receipt, offer, and booth are not matched,
// so the browser talks to the network directly.
registerRoute(
  ({ request, url }) =>
    request.mode === 'navigate'
    && url.origin === self.location.origin
    && !isSensitivePath(url.pathname),
  async ({ request }) => {
    try {
      return await fetch(request);
    } catch {
      return offlineResponse();
    }
  },
);

setCatchHandler(async ({ request }) => {
  if (request.mode === 'navigate' || request.destination === 'document') return offlineResponse();
  return Response.error();
});
