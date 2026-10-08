import { NODES } from './nodes.js';
import { SETTINGS } from './settings.js';

export function generateSubscription() {
  const activeNodes = NODES.filter(node => node.isActive);
  const configs = [];

  for (const node of activeNodes) {
    // تعیین سرور نهایی (آی‌پی تمیز، رله تونل، یا دامنه اصلی)
    let targetServers = [node.server];
    if (node.tunnel?.enabled) {
      targetServers = [node.tunnel.relayServer];
    } else if (SETTINGS.preferCleanIP && node.cleanIPs?.length > 0) {
      targetServers = node.cleanIPs.map(c => c.ip);
    }

    // حلقه پورت‌ها
    const ports = node.ports || [node.port];

    for (const server of targetServers) {
      for (const port of ports) {
        
        const cleanName = node.cleanIPs?.find(c => c.ip === server)?.name || 'Default';
        const displayName = `${node.name} [${cleanName}] :${port}`;

        let configStr = '';

        // ساخت کانفیگ VLESS وب‌سوکت
        if (node.type === 'vless') {
          configStr = `vless://${node.uuid}@${server}:${port}?encryption=none&security=tls&sni=${node.sni}&type=${node.network}&path=${node.path}`;
          
          if (SETTINGS.enableMux) configStr += `&mux=8`;
          if (SETTINGS.enablePadding) configStr += `&padding=true`; 
          
          configStr += `#${encodeURIComponent(displayName)}`;
        } 
        // ساخت کانفیگ VLESS Reality
        else if (node.type === 'vless-reality') {
          configStr = `vless://${node.uuid}@${server}:${port}?encryption=none&security=reality&sni=${node.sni}&flow=${node.flow}&fp=safari&pbk=${node.publicKey}&sid=${node.shortId}&type=tcp#${encodeURIComponent(displayName)}`;
        }

        if (configStr) configs.push(configStr);

        // ساخت نسخه Fragment دار کانفیگ
        if (SETTINGS.enableFragment && node.fragment?.enabled && node.type === 'vless') {
          const fragDisplayName = `${node.name} [${cleanName}-Fragment] :${port}`;
          let fragConfigStr = `vless://${node.uuid}@${server}:${port}?encryption=none&security=tls&sni=${node.sni}&type=${node.network}&path=${node.path}&fragment=${node.fragment.packets},${node.fragment.length},${node.fragment.interval}`;
          
          if (SETTINGS.enableMux) fragConfigStr += `&mux=8`;
          
          fragConfigStr += `#${encodeURIComponent(fragDisplayName)}`;
          configs.push(fragConfigStr);
        }
      }
    }
  }

  // تبدیل نهایی به Base64 (استاندارد سابسکریپشن)
  return Buffer.from(configs.join('\n')).toString('base64');
}
