// Shell boot: read the plugin manifest AT RUNTIME, inject its stylesheets,
// dynamically import its view, mount it with the shell's react-dom.
// Nothing here knows the plugin's file names at build time.
import * as React from 'react';
import { createRoot } from 'react-dom/client';

window.__REACT_SHELL = React;

const status = (msg) => { document.getElementById('status').textContent = msg; };

try {
  const pluginBase = new URL('/plugins/hello/', location.href);

  // 1. Manifest is data, fetched at runtime.
  const res = await fetch(new URL('manifest.json', pluginBase));
  if (!res.ok) throw new Error(`manifest fetch: ${res.status}`);
  const manifest = await res.json();

  // 2. CSS contract: the SHELL injects (and could remove) manifest-listed
  //    stylesheets. Plugins never `import './x.css'`.
  await Promise.all((manifest.styles ?? []).map((href) => new Promise((ok, ko) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL(href, pluginBase).href;
    link.dataset.plugin = 'hello';
    link.onload = ok;
    link.onerror = () => ko(new Error(`stylesheet failed: ${href}`));
    document.head.append(link);
  })));

  // 3. The view is a plain dynamic import of a URL — no bundler involved.
  const mod = await import(new URL(manifest.view, pluginBase).href);

  // 4. Mount with the shell's react-dom; the component came from the plugin.
  const root = createRoot(document.getElementById('plugin-slot'));
  root.render(React.createElement(mod.default));
  window.__PLUGIN_MOUNTED = true;
  status(`plugin "hello" mounted (view: ${manifest.view})`);
} catch (err) {
  status(`BOOT FAILED: ${err.message}`);
  window.__BOOT_ERROR = String(err.stack ?? err);
  throw err;
}
