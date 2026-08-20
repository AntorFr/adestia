// "Heavy" lazy chunk (scan-decoder stand-in). Loaded ONLY on user action.
// Exercises two things on purpose:
//   1. a bare specifier ("react/jsx-runtime" + "react") inside a lazily
//      loaded sub-chunk — the import map must still apply;
//   2. a RELATIVE static import of a sibling module (./heavy-data.js,
//      ~450 kB, generated) — resolved against this module's own URL.
import * as React from 'react';
import { jsx, jsxs } from 'react/jsx-runtime';
import { PAYLOAD_BYTES, SAMPLE } from './heavy-data.js';

window.__HEAVY_REACT = React;
window.__HEAVY_LOADED = true;

export default function HeavyPanel() {
  return jsxs('div', {
    className: 'heavy-box',
    id: 'heavy-content',
    children: [
      jsx('h3', { children: 'Heavy chunk decoded' }),
      jsx('p', { id: 'heavy-meta', children: `payload: ${PAYLOAD_BYTES} bytes, sample: ${SAMPLE.slice(0, 16)}` }),
    ],
  });
}
