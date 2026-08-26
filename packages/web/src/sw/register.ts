/**
 * Registering the worker — and, in development, making sure none is left.
 *
 * The second half is not politeness. A worker registered once from a built
 * bundle keeps controlling that origin, and `localhost:8730` is the same
 * origin whether Golem or Vite answers on it: without this, an afternoon of
 * "my change does not show up" is waiting for whoever built the image first.
 */
export function registerServiceWorker(): void {
  // Absent on an insecure origin that is not localhost, and in a few
  // privacy-hardened browsers. The app works without one; it just stops
  // opening offline, so there is nothing to announce.
  if (!('serviceWorker' in navigator)) return

  if (!import.meta.env.PROD) {
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) void registration.unregister()
    })
    return
  }

  /*
   * After `load`, deliberately: registration competes for the same connections
   * as the first paint, and precaching the shell is worth nothing to somebody
   * still waiting to see it.
   */
  window.addEventListener('load', () => {
    // Failures are swallowed on purpose. Every one of them — an offline first
    // visit, a browser with storage disabled, an operator serving over plain
    // HTTP — costs the offline boot and nothing else.
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}
