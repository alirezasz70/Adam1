import { NODES } from "./nodes.js";

function makeVlessWsUri(node) {
  const scheme = new URLSearchParams();

  scheme.set("encryption", "none");
  scheme.set("security", node.tls ? "tls" : "none");
  scheme.set("type", "ws");
  scheme.set("host", node.server);
  scheme.set("path", node.path);

  if (node.tls && node.sni) {
    scheme.set("sni", node.sni);
  }

  const label = `${node.name} (${node.server})`;
  const fragment = encodeURIComponent(label);

  return `vless://${node.uuid}@${node.server}:${node.port}?${scheme.toString()}#${fragment}`;
}

export function generateSubscription() {
  const activeNodes = NODES.filter((node) => node.active);

  if (activeNodes.length === 0) {
    throw new Error("No active nodes are configured");
  }

  const links = activeNodes.map(makeVlessWsUri);

  return Buffer.from(links.join("\n"), "utf8").toString("base64");
}
