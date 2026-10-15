function required(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function validPort(name, fallback) {
  const value = Number(process.env[name] || fallback);

  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`Invalid port in ${name}`);
  }

  return value;
}

const uuid = required("VLESS_UUID");

export const NODES = [
  {
    id: "primary",
    name: process.env.NODE_NAME || "My first node",
    type: "vless-ws",
    active: process.env.NODE_ACTIVE !== "false",

    // دامنه‌ای که واقعاً به سرور WebSocket وصل شده باشد؛
    // این مقدار را با workers.dev یا IP تصادفی جایگزین نکن.
    server: required("PUBLIC_HOST"),
    port: validPort("PUBLIC_PORT", 443),

    uuid,
    tls: process.env.PUBLIC_TLS !== "false",
    sni: process.env.PUBLIC_SNI || required("PUBLIC_HOST"),
    path: process.env.VLESS_PATH || "/proxy-vless",
  },
];
