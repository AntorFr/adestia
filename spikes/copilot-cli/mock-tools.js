const http = require('http');
http.createServer((req, res) => {
  let body=''; req.on('data',c=>body+=c); req.on('end',()=>{
    try { const j=JSON.parse(body); console.error(JSON.stringify((j.tools||[]).map(t=>t.function?.name||t.name))); } catch(e){ console.error('parse-fail'); }
    res.writeHead(200,{'Content-Type':'text/event-stream'});
    const c=(d,f)=>JSON.stringify({id:'x',object:'chat.completion.chunk',created:0,model:'mock-model',choices:[{index:0,delta:d,finish_reason:f}]});
    res.write(`data: ${c({role:'assistant',content:'ok'},null)}\n\ndata: ${c({},'stop')}\n\ndata: [DONE]\n\n`); res.end();
  });
}).listen(45124,'127.0.0.1',()=>console.error('up'));
