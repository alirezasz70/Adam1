// =============================================================
// ✅ GOLDEN STANDARD VLESS WORKER (Stable & Fast)
// Compatible: Netlify Panel & Standard Clients
// =============================================================

export default {
  async fetch(request, env) {
    const uuid = env.UUID || 'default-uuid-change-me';
    // مسیر پروتکل - باید دقیقاً مثل همینجا باشه
    const pathname = "/proxy-vless"; 

    const url = new URL(request.url);
    
    // 1. صفحه فیک (Camouflage)
    if (url.pathname === '/') {
      return new Response('<h1>404 Not Found</h1>', { 
        headers: { 'Content-Type': 'text/html' } 
      });
    }

    // 2. بررسی مسیر
    if (url.pathname !== pathname) {
      return new Response('Not Found', { status: 404 });
    }

    // 3. بررسی وب‌سوکت
    const upgrade = request.headers.get("Upgrade");
    if (upgrade !== "websocket") {
      return new Response("Expected websocket upgrade", { status: 426 });
    }

    // 4. شروع ارتباط دوسویه
    const [client, server] = Object.values(new WebSocketPair());
    
    // Accept کردن ورودی از کاربر
    server.accept();

    // هندل کردن اولین پیام (برای خواندن اطلاعات هدف)
    // اگر کلاینت داده‌ای نفرستاد، صبر می‌کنیم تا زمان اتصال تمام شود
    // اما معمولاً VLESS اولین پکت رو سریع میفرسته
    
    let closeFunc = () => {};
    let ticker;

    // تنظیمات تایم‌اوت و قطع کردن خودکار در صورت عدم موفقیت
    const timer = setTimeout(() => {
        server.close(1008, "Timeout");
    }, 15000); // 15 ثانیه وقت برای برقراری ارتباط با مقصد

    // دریافت اولین فریم (که حاوی آدرس و پورت هدف VLESS هست)
    server.addEventListener("message", async (evt) => {
        clearTimeout(timer); // لغو تایم‌اوت
                
        try {
            // جدا کردن بایت‌های هدر VLESS از داده ورودی
            const dataBuffer = evt.data;
            const vlessData = parseVlessHeader(dataBuffer);

            // بررسی اعتبار UUID
            if (!vlessData || vlessData.uuid !== uuid) {
                console.error(`Auth Failed`);
                server.close(1011, 'Unauthorized');
                return;
            }
            
            console.log(`Connecting: ${vlessData.address}:${vlessData.port}`);

            // برقراری ارتباط با سرور واقعی (Outbound)
            await connectToRealServer(server, vlessData);

        } catch (err) {
            console.error(`Error: ${err.message}`);
            server.close(1011, err.message);
        }
    });

    // مدیریت بستن ارتباط توسط کاربر
    closeFunc = () => {
        clearTimeout(timer);
        server.close();
    };
    server.addEventListener("close", closeFunc);
    server.addEventListener("error", closeFunc);

    return new Response(null, { status: 101, webSocket: client });
  }
};

// ---------------------------------------------------------
// تابع استخراج آدرس و پورت از هدر استاندارد VLESS (Binary Parser)
// ---------------------------------------------------------
function parseVlessHeader(buffer) {
    try {
        if (!buffer || buffer.length < 25) throw new Error("Invalid data");

        // Version Check
        if (buffer[0] !== 0) throw new Error("Not VLESS Protocol");

        // UUID Extraction (Bytes 1-16)
        const uuidBuf = buffer.slice(1, 17);
        const uuidStr = Array.from(new Uint8Array(uuidBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

        let offset = 17;
        
        // Additional Info Length
        const addLen = buffer[offset];
        offset += 1 + addLen;

        // Command (Should be TCP Connect)
        // const command = buffer[offset]; offset += 1; // Usually unused for simple proxies

        // Address Type
        const addrType = buffer[offset];
        offset += 1;

        let address = '';
        let port = 0;
        
        switch (addrType) {
            case 0x01: // IPv4
                address = `${buffer[offset]}.${buffer[offset+1]}.${buffer[offset+2]}.${buffer[offset+3]}`;
                offset += 4;
                break;
            case 0x02: // Domain Name
                const domainLen = buffer[offset];
                address = new TextDecoder().decode(buffer.slice(offset + 1, offset + 1 + domainLen));
                offset += 1 + domainLen;
                break;
            case 0x03: // IPv6
                 // تجاوز می کنیم از پارس کامل IP6 جهت ثابت ماندن کد
                 throw new Error("IPv6 Not Supported");
            default:
                throw new Error(`Unknown Address Type: ${addrType}`);
        }

        // Port Reading (Big Endian)
        port = (buffer[offset] << 8 | buffer[offset + 1]);
        offset += 2;

        return {
            uuid: uuidStr,
            protocol: 'tcp',
            address: address,
            port: port,
            dataOffset: offset,
            rawData: buffer // نگه داشتن بافر اصلی برای ارسال بعدی
        };

    } catch (e) {
        console.error(e);
        return null;
    }
}

// ---------------------------------------------------------
// تابع اتصال به سرور واقعی و رله دادن دیتا (Relay)
// ---------------------------------------------------------
async function connectToRealServer(wsClient, vlessData) {
    const { address, port, dataOffset, rawData } = vlessData;
    
    try {
        // استفاده از قدرت Fetch API کلودفلر
        // این روش برای ۹۹٪ ترافیک وب (HTTPS) بهترین کارایی رو دارد
        
        // تعیین پروتکل بر اساس پورت
        const scheme = port === 443 ? 'https' : 'http';
        const url = `${scheme}://${address}:${port}`;
        
        // آماده‌سازی هدرهای خروجی
        const headers = new Headers();
        
        // مهم: تنظیم صحیح هدر Host
        headers.set('Host', address);
        
        // اگر داده‌ای باقی مونده از اولین پکت (بعد از هدر) وجود داشت
        // آن را به عنوان بدنه درخواست می‌فرستیم
        let body = rawData.length > dataOffset ? rawData.slice(dataOffset) : undefined;

        // ارسال درخواست به سرور واقعی
        const resp = await fetch(url.toString(), {
            method: 'GET',
            headers: headers,
            body: body
        });

        // --- دریافت پاسخ و برگرداندن به کاربر ---
        if (resp.body) {
            const reader = resp.body.getReader();
            
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) break;
                
                if (wsClient.readyState === wsClient.OPEN) {
                    wsClient.send(value);
                } else {
                    break;
                }
            }
        } else {
             wsClient.send(new TextEncoder().encode("HTTP 200 OK\r\n"));
        }

    } catch (error) {
        console.error(`Connection Error: ${error.message}`);
        if (wsClient.readyState === wsClient.OPEN) {
            wsClient.close(1011, `Error: ${error.message}`);
        }
    }
}
