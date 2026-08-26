/// <reference types="vite/client" />

/*
 * Pulled in for `import.meta.env` alone, which is how the shell tells a built
 * bundle from one Vite is serving. The distinction matters in exactly one
 * place — the service worker registers in production only, because a worker
 * caching a dev server's modules fights the very reloading it exists for.
 */
