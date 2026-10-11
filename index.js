// =============================================================
// ✅ FINAL STABLE VLESS WORKER (Optimized for Browsing)
// =============================================================

export default {
  async fetch(request, env) {
    // دریافت تنظیمات از متغیرهای محیطی
    const PROXY_UUID = env.UUID; 
    const VLESS_PATH = '/proxy-vless'; // مسیر اتصال
    
    const url = new URL(request.url);

    // 1. اختفاء: نمایش صفحه ساختگی برای بازرسی ربات‌ها
    if (url.pathname === '/') {
      return new Response('<h1>404 Not Found</h1>', { headers: { 'Content-Type': 'text/html' } });
    }

    // 2. بررسی مسیر درخواست
    if (url.pathname !== VLESS_PATH) {
      return new Response('Not Found', { status: 404 });
    }

    // 3. بررسی نوع اتصال (باید وب‌سوکت باشد)
    const upgrade = request.headers.get('Upgrade');
    if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
      return new Response('Expected websocket upgrade', { status: 426 });
    }

    // --- شروع پروتکل ---
    const [client, server] = Object.values(new WebSocketPair());
    
    server.accept();

    // دریافت اولین پیام کاربر برای خواندن آدرس هدف
    // ما از یک Promise استفاده میکنیم تا صبر کنیم اولین دیتا بیاد
    const {
        value: firstMsg,
        done
    } = await server.messageIterator().next();

    if (!done && firstMsg) {
        try {
            // پرداز هدر VLESS
            const vlessInfo = parseVLESS(firstMsg.data);

            // چک کردن رمز عبور (UUID)
            if (!vlessInfo || vlessInfo.uuid !== PROXY_UUID) {
                console.error(`Auth Failed`);
                server.close(1011, 'Unauthorized');
                return new Response(null, { status: 101, webSocket: client });
            }
            
            console.log(`Target: ${vlessInfo.address}:${vlessInfo.port}`);

            // تلاش برای اتصال به مقصد و ارسال دیتا
            await handleUpstream(server, vlessInfo);

        } catch (err) {
            console.error(`Error: ${err.message}`);
            server.close(1011, err.message);
        }
    } else {
        server.close();
    }

    return new Response(null, { status: 101, webSocket: client });
  }
};

/**
 * استخراج اطلاعات آدرس و پورت از فرمت باینری VLESS
 */
function parseVLESS(buffer) {
    try {
        if (!buffer || buffer.length < 26) throw new Error("Invalid VLESS");
        
        // Byte 0: Version (must be 0)
        if (buffer[0] !== 0) throw new Error("Invalid Version");

        // Bytes 1-16: UUID
        const uuidArr = buffer.slice(1, 17);
        const uuidStr = Array.from(new Uint8Array(uuidArr)).map(b => b.toString(16).padStart(2, '0')).join('');

        let offset = 17;
        
        // Additional Info Length & Skip
        const addLen = buffer[offset];
        offset += 1 + addLen;

        // Command (TCP Connect)
        // const command = buffer[offset]; offset += 1;

        // Address Type
        const addrType = buffer[offset];
        offset += 1;

        let address = '';
        let port = 0;
        
        // Parsing Address based on type
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
            case 0x03: // IPv6 (Not supported simply here)
                 throw new Error("IPv6 Not Supported");
            default:
                throw new Error(`Unknown AddrType: ${addrType}`);
        }

        // Port (Big Endian)
        port = (buffer[offset] << 8 | buffer[offset + 1]);
        offset += 2;

        return {
            uuid: uuidStr,
            address: address,
            port: port,
            dataOffset: offset,
            rawData: buffer
        };
    } catch (e) {
        return null;
    }
}

/**
 * مدیریت ارتباط با سرور واقعی و رله داده‌ها
 * از Fetch API کلودفلر برای برقراری ارتباط HTTPS خروجی استفاده میکند
 */
async function handleUpstream(wsClient, vlessInfo) {
    const { address, port, dataOffset, rawData } = vlessInfo;
    
    try {
        // تعیین پروتکل بر اساس پورت
        const scheme = port === 443 ? 'https' : 'http';
        const url = `${scheme}://${address}:${port}`;

        // آماده سازی بدنه درخواست (داده های اضافه بعد از هدر)
        let body = rawData.byteLength > dataOffset ? rawData.slice(dataOffset) : undefined;

        // ارسال درخواست به مقصد
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Host': address // مهم برای SNI
            },
            body: body
        });

        // اگر پاسخی برگشت، آن را به سمت کاربر برگردان
        if (response.body) {
            const reader = response.body.getReader();
            
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) break;
                
                // ارسال دیتای دریافتی به کاربر
                if (wsClient.readyState === wsClient.OPEN) {
                    wsClient.send(value);
                } else {
                    break; // کاربر قطع کرده
                }
            }
        }
        
        // بستن آرام connection پس از تمام شدن
        if (wsClient.readyState === wsClient.OPEN) wsClient.close();

    } catch (error) {
        console.error(`Upstream Error: ${error}`);
        if (wsClient.readyState === wsClient.OPEN) {
            wsClient.close(1011, error.message);
        }
    }
}
