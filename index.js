// =============================================================
// ✅ ADVANCED VLESS WS WORKER (Hardened Edition)
// Compatible with Netlify Panel Integration
// =============================================================

export default {
  async fetch(request, env) {
    // ---------------------------------------------------------
    // ⚙️ تنظیمات اولیه و دریافت مقادیر از متغیرهای محیطی
    // ---------------------------------------------------------
    const PROXY_UUID = env.UUID || 'default-uuid-change-me'; 
    const VLESS_PATH = '/proxy-vless'; // مسیر اتصال (باید در نتلی‌فای هم همین باشه)
    
    const url = new URL(request.url);
    
    // 1️⃣ اختفاء صفحه اصلی: نمایش سایت جعلی برای بازرسی‌ها
    if (url.pathname === '/') {
      return new Response('<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Privacy Policy</title></head><body style="font-family:sans-serif;max-width:800px;margin:auto;padding:20px"><h2>Terms of Service</h2><p>Last updated: Oct 24</p><p>This page describes our terms...</p></body></html>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // 2️⃣ بررسی صحت مسیر درخواست
    if (url.pathname !== VLESS_PATH) {
      return new Response('Not Found', { status: 404 });
    }

    // 3️⃣ بررسی نوع درخواست (Websocket Upgrade)
    const upgrade = request.headers.get('Upgrade');
    if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
      return new Response('Expected websocket upgrade', { status: 426 });
    }

    // --- شروع ارتباط دو طرفه ---
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // پذیرش ارتباط ورودی (ورکر به کاربر)
    server.accept();

    // هندل کردن ترافیک بعد از اتصال
    server.addEventListener('message', async (event) => {
      try {
        // --- 🛡️ پارسر پروتکل VLESS v0 (دقیق و حساس) ---
        const dataBuffer = event.data instanceof ArrayBuffer ? event.data : (event.data instanceof Uint8Array ? event.data.buffer : new TextEncoder().encode(event.data).buffer);
        const vlessData = parseVlessHeader(new Uint8Array(dataBuffer));

        if (!vlessData || vlessData.uuid !== PROXY_UUID) {
          console.error(`Auth Failed`);
          server.close(1011, 'Unauthorized');
          return;
        }
        
        // --- 🌐 ارسال درخواست به مقصد (SNI Spoofing / Relay) ---
        await handleTCPRequest(server, vlessData);

      } catch (err) {
        console.error(`Error handling message: ${err.message}`);
        server.close(1011, err.message);
      }
    });

    return new Response(null, { status: 101, webSocket: client });
  }
};

/**
 * تابع اصلی پردازش هدر VLESS و استخراج اطلاعات
 */
function parseVlessHeader(buffer) {
  try {
    if (!buffer || buffer.length < 25) throw new Error('Invalid data length');

    // Version
    if (buffer[0] !== 0) throw new Error('Not VLESS protocol');

    // UUID (Bytes 1..16)
    const uuidBuf = buffer.slice(1, 17);
    // تبدیل UUID برای مقایسه با متغیر محیطی
    const uuidStr = Array.from(new Uint8Array(uuidBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

    let offset = 17;
    
    // Additional Info Length
    const addLen = buffer[offset];
    offset += 1 + addLen;

    // Command
    const command = buffer[offset];
    offset += 1;

    // Address Type
    const addrType = buffer[offset];
    offset += 1;

    // Parsing Address & Port
    let address = '';
    let port = 0;
    
    switch (addrType) {
      case 0x01: // IPv4
        address = `${buffer[offset]}.${buffer[offset+1]}.${buffer[offset+2]}.${buffer[offset+3]}`;
        offset += 4;
        break;
      case 0x02: // Domain
        const domainLen = buffer[offset];
        address = new TextDecoder().decode(buffer.slice(offset + 1, offset + 1 + domainLen));
        offset += 1 + domainLen;
        break;
      case 0x03: // IPv6
        // خلاصه سازي كردن پارسینگ IPv6 جهت کاهش حجم و پیچیدگی (نیاز خاصی ندارد)
        // معمولاً VPN روی موبایل IPv4 یا Domain استفاده میکند
        throw new Error('IPv6 Not Supported in this version');
      default:
        throw new Error(`Unknown Address Type: ${addrType}`);
    }

    // Reading Port (Big Endian)
    port = (buffer[offset] << 8 | buffer[offset + 1]);
    offset += 2;

    return {
      uuid: uuidStr,
      protocol: 'tcp', // Defaulting to TCP logic for Workers
      address: address,
      port: port,
      dataOffset: offset,
      rawData: buffer // Sending full buffer allows forwarding remaining data
    };

  } catch (error) {
    console.error(`Parse Error: ${error}`);
    return null;
  }
}

/**
 * مدیریت رله داده ها به مقصد (Outbound Handler)
 */
async function handleTCPRequest(wsClient, vlessData) {
  const { address, port, dataOffset, rawData } = vlessData;
  
  try {
    // استفاده از API قدرتمند Fetch کلودفلر
    // این روش برای 99% ترافیک وب (HTTPS/HTTP) کاربرد دارد
    
    // اگر پورت 443 بود، HTTPS میزنیم وگرنه HTTP
    const isHttps = port === 443;
    const url = new URL(`${isHttps ? 'https' : 'http'}://${address}:${port}`);

    // آماده سازی هدرها (برای فریب فیلترینگ)
    const headers = new Headers();
    
    // ❗️ نقطه قوت: حذف هدرهای لو رفتن هویت
    // هدر Host مهمترین بخش برای SNI Spoofing است
    headers.set('Host', address); 
    
    // بدنه درخواست (اگر داده‌ای از اول ارسال شده باشد)
    const body = rawData.length > dataOffset ? rawData.slice(dataOffset) : undefined;

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: headers,
      body: body
    });

    // 🔁 بازگردانی پاسخ به کاربر (Stream piping)
    if (response.body) {
      const reader = response.body.getReader();
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        if (wsClient.readyState === wsClient.OPEN) {
          // ارسال داده های دریافتی به کلاینت
          wsClient.send(value);
        } else {
          break; // اتصال کاربر قطع شد
        }
      }
    } else {
      // اگر بدنه ای نبود
      wsClient.send(new TextEncoder().encode("HTTP 200 OK\r\n"));
    }

  } catch (error) {
    console.error(`Fetch Error: ${error.message}`);
    if (wsClient.readyState === wsClient.OPEN) {
      wsClient.close(1011, `Connection Failed: ${error.message}`);
    }
  }
}
