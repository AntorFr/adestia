// Minimal OpenAI-compatible mock provider for BYOK probing (no external deps)
const http = require('http');
let nreq = 0;
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    nreq++;
    console.error(`[mock] #${nreq} ${req.method} ${req.url}`);
    try { const j = JSON.parse(body); console.error(`[mock]   stream=${j.stream} model=${j.model} messages=${(j.messages||[]).length} tools=${(j.tools||[]).length}`); } catch {}
    let stream = false;
    try { stream = JSON.parse(body).stream === true; } catch {}
    const msg = { role: 'assistant', content: 'hello from mock' };
    if (stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const chunk = (delta, finish) => JSON.stringify({ id: 'chatcmpl-mock', object: 'chat.completion.chunk', created: 0, model: 'mock-model', choices: [{ index: 0, delta, finish_reason: finish }] });
      res.write(`data: ${chunk({ role: 'assistant', content: 'hello from mock' }, null)}\n\n`);
      res.write(`data: ${chunk({}, 'stop')}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'chatcmpl-mock', object: 'chat.completion', created: 0, model: 'mock-model', choices: [{ index: 0, message: msg, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }));
    }
  });
});
server.listen(45123, '127.0.0.1', () => console.error('[mock] listening on 45123'));
