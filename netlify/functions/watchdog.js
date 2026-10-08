import { NODES } from '../../core/nodes.js';

export const handler = async (event) => {
  if (event.queryStringParameters.auth !== process.env.WATCHDOG_AUTH) {
    return { statusCode: 403, body: 'Forbidden' };
  }

  const nodesToWatch = NODES.filter(node => node.isActive);
  const results = [];

  for (const node of nodesToWatch) {
    try {
      const urlToFetch = node.type === 'vless' 
        ? `https://${node.server}:${node.ports[0]}` 
        : `https://${node.server}:${node.port}`;
      await fetch(urlToFetch, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
      results.push({ node: node.id, status: 'Online/Keep-alive sent' });
    } catch (error) {
      results.push({ node: node.id, status: 'Offline/Timeout' });
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ watchdog: 'executed', results })
  };
};
