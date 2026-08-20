// Mock provider: first call returns a bash tool call, second returns final text
const http = require('http');
let n = 0;
http.createServer((req, res) => {
  let body=''; req.on('data',c=>body+=c); req.on('end',()=>{
    n++;
    res.writeHead(200,{'Content-Type':'text/event-stream'});
    const c=(d,f)=>`data: ${JSON.stringify({id:'call'+n,object:'chat.completion.chunk',created:0,model:'mock-model',choices:[{index:0,delta:d,finish_reason:f}]})}\n\n`;
    if (n === 1) {
      res.write(c({role:'assistant',tool_calls:[{index:0,id:'tc_1',type:'function',function:{name:'bash',arguments:JSON.stringify({command:'echo tool-was-run', description:'echo test', mode:'sync', initial_wait:5})}}]},null));
      res.write(c({},'tool_calls'));
    } else {
      res.write(c({role:'assistant',content:'done after tool'},null));
      res.write(c({},'stop'));
    }
    res.write('data: [DONE]\n\n'); res.end();
  });
}).listen(45125,'127.0.0.1',()=>console.error('up'));
