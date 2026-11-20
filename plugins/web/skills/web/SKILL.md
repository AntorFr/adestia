---
name: web
description: Read a web page with a real browser when the ordinary read fails — a 403, a challenge page, a page built in JavaScript, something to click. Not for pages a plain fetch already reads.
---

# Reading a page with the browser

Try the ordinary read first (`curl`, a fetch tool). Open the browser only when
that fails: a 403 or 429, a "checking your browser" page, a page whose text is
built by JavaScript and comes back empty, or something that must be clicked
before the content shows. Otherwise do not — a browser is slow and costs memory.

- Navigate with `browser_navigate`, then read the page with the snapshot tool.
  Each page is also saved as a file in `.adestia-web/` of the workspace: read
  that file with your file tools rather than asking for another snapshot.
- The browser keeps nothing between turns: no account, no cookie. Do not try to
  sign in.
- If the site still refuses you — a challenge, a block, a login wall — say so
  plainly, naming the page, and stop. Never try to get around a challenge, and
  do not retry the same page in other ways.
- Some browser tools are withheld by this instance. Do not look for a way
  round them; work with what the list offers.
