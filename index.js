export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const PROXY_PATH = '/proxy-vless';
    const UUID = (env.UUID || '').replace(/-/g, '');

    // اگر مسیر اصلی خواست، یه صفحه فیک نشون بده
    if (url.pathname === '/') {
      return new Response('<h1>My Blog</h1>', { headers: { 'Content-Type': 'text/html' }});
    }

    // اگر مسیر درست بود، پروکسی رو فعال کن
    if (url.pathname === PROXY_PATH) {
      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader !== 'websocket') return new Response('Expected websocket', { status: 426 });

      const [client, server] = Object.values(new WebSocketPair());
      server.accept();

      // اتصال به اینترنت آزاد (بخش اصلی)
      const remoteIP = env.REMOTE_ADDR || '104.16.132.229'; 
      const remotePort = 443;
      
      try {
        const remoteWs = new WebSocket(`wss://${remoteIP}:${remotePort}`, { headers: { 'Host': 'speed.cloudflare.com' } });

        remoteWs.addEventListener('message', e => { try{server.send(e.data)}catch(e){} });
        remoteWs.addEventListener('close', () => server.close());
        remoteWs.addEventListener('error', () => server.close());
        
        server.addEventListener('message', e => { try{remoteWs.send(e.data)}catch(e){} });
        server.addEventListener('close', () => remoteWs.close());
        server.addEventListener('error', () => remoteWs.close());

        return new Response(null, { status: 101, webSocket: client });
      } catch (e) {
         console.log("Connection Error");
         return new Response("Error", { status: 500 });
      }
    }
    return new Response('Not Found', { status: 404 });
  }
};
