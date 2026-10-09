export const NODES = [
  // ================= نودهای رایگان فعلی =================
  {
    id: "free-deno-1",
    name: "🇩🇪 Free - Deno Edge",
    type: "vless",
    server: "edgetunnel.a.rsadeghzadeh91.workers.dev", // دامنه نود دنو که بعداً می‌سازی
    uuid: process.env.MY_UUID, 
    tls: true,
    sni: "your-app.deno.dev",
    network: "ws",
    
    // تکنیک اختفای وب‌سایت (پث مخفی)
    path: "/my-secret-path-12345", 
    
    // آرایه پورت‌ها
    ports: [443, 8443, 2053, 2083], 
    
    // آرایه آی‌پی‌های تمیز
    cleanIPs: [
      { ip: "104.16.0.1", name: "IR-Telecom" },
      { ip: "141.101.64.10", name: "IR-Mokhaberat" }
    ],

    // تنظیمات فرگمنت مخصوص این نود
    fragment: { enabled: true, packets: "tlshello", length: "100-200", interval: "10-20" },
    
    isActive: true
  },

  // ================= نودهای آینده (سرور شخصی) =================
  /*
  {
    id: "vps-reality-1",
    name: "🇫🇮 VIP - Hetzner Reality",
    type: "vless-reality",
    server: "195.x.x.x", // آی‌پی سرور آینده
    port: 443,
    uuid: process.env.MY_UUID,
    flow: "xtls-rprx-vision",
    sni: "www.microsoft.com",
    publicKey: "xxxxxx",
    shortId: "xxxx",
    
    // اگر آی‌پی فیلتر شد، تونل رو فعال کن
    tunnel: {
      enabled: true,
      type: "argo", 
      relayServer: "clean-relay-domain.com",
      relayPort: 443
    },
    
    isActive: false // وقتی سرور خریدی این رو true کن
  }
  */
];
