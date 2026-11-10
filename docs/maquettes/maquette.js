// Lucide-style 24px paths (the shell's single icon set), inlined so a mockup opens from file://.
const P={grip:'<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>',
up:'<path d="m18 15-6-6-6 6"/>',down:'<path d="m6 9 6 6 6-6"/>',left:'<path d="m15 18-6-6 6-6"/>',right:'<path d="m9 18 6-6-6-6"/>',
set:'<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
plus:'<path d="M12 5v14M5 12h14"/>',trash:'<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5"/>',
search:'<circle cx="11" cy="11" r="7"/><path d="m21 21-4-4"/>',check:'<path d="M20 6 9 17l-5-5"/>',
flag:'<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>',warn:'<path d="M12 3 2 20h20L12 3zM12 10v4M12 17h0"/>',
cols:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',sect:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
chart:'<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h0M3 12h0M3 18h0"/>',
table:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
text:'<path d="M4 6h16M4 12h16M4 18h10"/>',img:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5L5 20"/>',
tl:'<path d="M3 6h10M7 12h12M5 18h8"/>',call:'<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h0"/>',
chev:'<path d="m9 18 6-6-6-6"/>',code:'<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',x:'<path d="M18 6 6 18M6 6l12 12"/>',
gauge:'<path d="M12 14l4-4"/><path d="M3.3 17a10 10 0 1 1 17.4 0"/>',users:'<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5M17 5a3 3 0 0 1 0 6M21 20c0-2-1.5-3.6-4-4.5"/>',
layout:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',pen:'<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'};
document.querySelectorAll('i[data-i]').forEach(e=>{e.innerHTML='<svg viewBox="0 0 24 24">'+(P[e.dataset.i]||'')+'</svg>'});
// <div class="show" data-tpl="id" data-sets="desk-light desk-dark phone-light phone-dark"> clones template#id into each theme x width.
document.querySelectorAll('.show').forEach(s=>{const t=document.getElementById(s.dataset.tpl);
 (s.dataset.sets||'desk-light desk-dark phone-light phone-dark').split(' ').forEach(k=>{const[w,th]=k.split('-');
  const d=document.createElement('div');d.className='theme '+w+' '+(th==='dark'?'dark':'');
  d.innerHTML='<div class="tag">'+(w==='desk'?'1440 · ':'390 · ')+(th==='dark'?'dark':'light')+'</div>';d.appendChild(t.content.cloneNode(true));s.appendChild(d)});
 s.querySelectorAll('i[data-i]').forEach(e=>{e.innerHTML='<svg viewBox="0 0 24 24">'+(P[e.dataset.i]||'')+'</svg>'})});
