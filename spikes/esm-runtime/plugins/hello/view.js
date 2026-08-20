// Plugin view — HAND-WRITTEN ESM, zero build step, zero bundler.
// The bare specifier "react" below is resolved by the PAGE's import map,
// not by anything in this folder. If the import map is missing, this module
// fails to load with "Failed to resolve module specifier".
import * as React from 'react';

// Exposed so the test can prove instance identity with the shell's React.
window.__REACT_PLUGIN = React;

export default function HelloView() {
  // Hooks are the real singleton detector: with two React copies, the first
  // useState call inside a tree rendered by the shell's react-dom throws
  // "Invalid hook call".
  const [Heavy, setHeavy] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  return React.createElement(
    'div',
    { className: 'hello-plugin', id: 'hello-root' },
    React.createElement('h2', null, 'Hello from plugin'),
    React.createElement('p', { id: 'react-version' }, `plugin sees React ${React.version}`),
    Heavy
      ? React.createElement(Heavy)
      : React.createElement(
          'button',
          {
            id: 'load-heavy',
            disabled: loading,
            onClick: async () => {
              setLoading(true);
              // Lazy chunk, addressed relative to THIS module — the exact
              // pattern DESIGN.md mandates for heavy optional chunks.
              const m = await import(new URL('./heavy.js', import.meta.url));
              setHeavy(() => m.default);
            },
          },
          'Load heavy chunk',
        ),
  );
}
