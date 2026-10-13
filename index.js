
import http from "node:http";
import net from "node:net";
import { WebSocketServer, WebSocket } from "ws";

const PORT = Number(process.env.PORT || 3000);
const VLESS_PATH = "/proxy-vless";

const server = http.createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Adam is running");
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 1024 * 1024
});

server.on("upgrade", (req, socket, head) => {
  let pathname;

  try {
    pathname = new URL(req.url, "http://localhost").pathname;
  } catch {
    socket.destroy();
    return;
  }

  if (pathname !== VLESS_PATH) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

function parseVlessHeader(data) {
  if (data.length < 18) {
    throw new Error("Incomplete VLESS header");
  }

  const version = data[0];
  const uuid = data.subarray(1, 17);
  const addonLength = data[17];

  let offset = 18;

  if (data.length < offset + addonLength + 4) {
    throw new Error("Incomplete VLESS request");
  }

  offset += addonLength;

  const command = data[offset++];

  if (command !== 1) {
    throw new Error("Only TCP is supported");
  }

  const port = data.readUInt16BE(offset);
  offset += 2;

  const addressType = data[offset++];
  let address;

  if (addressType === 1) {
    if (data.length < offset + 4) {
      throw new Error("Incomplete IPv4 address");
    }

    address = Array.from(data.subarray(offset, offset + 4)).join(".");
    offset += 4;
  } else if (addressType === 2) {
    if (data.length < offset + 1) {
      throw new Error("Missing domain length");
    }

    const length = data[offset++];

    if (length === 0 || data.length < offset + length) {
      throw new Error("Invalid domain address");
    }

    address = data.subarray(offset, offset + length).toString("utf8");
    offset += length;

    if (!address || /[\s/\\]/.test(address)) {
      throw new Error("Invalid domain");
    }
  } else if (addressType === 3) {
    if (data.length < offset + 16) {
      throw new Error("Incomplete IPv6 address");
    }

    const parts = [];

    for (let i = 0; i < 16; i += 2) {
      parts.push(data.readUInt16BE(offset + i).toString(16));
    }

    address = parts.join(":");
    offset += 16;
  } else {
    throw new Error("Unknown address type");
  }

  if (port < 1 || port > 65535) {
    throw new Error("Invalid destination port");
  }

  return {
    version,
    uuid,
    address,
    port,
    payload: data.subarray(offset)
  };
}

wss.on("connection", (ws) => {
  let tcp = null;
  let initialized = false;
  let connected = false;
  let pending = [];

  function closeWebSocket(code, reason) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(code, reason);
    } else if (ws.readyState === WebSocket.CONNECTING) {
      ws.terminate();
    }
  }

  function cleanup() {
    pending = [];

    if (tcp && !tcp.destroyed) {
      tcp.destroy();
    }
  }

  ws.on("message", (message, isBinary) => {
    if (!isBinary) {
      closeWebSocket(1003, "Binary data required");
      return;
    }

    const data = Buffer.isBuffer(message)
      ? message
      : Buffer.from(message);

    if (initialized) {
      if (connected && tcp && !tcp.destroyed) {
        tcp.write(data);
      } else {
        pending.push(data);
      }
      return;
    }

    try {
      const uuidText = String(process.env.UUID || "")
        .replace(/-/g, "")
        .toLowerCase();

      if (!/^[0-9a-f]{32}$/.test(uuidText)) {
        console.error("UUID environment variable is missing or invalid");
        closeWebSocket(1011, "Server configuration error");
        return;
      }

      const request = parseVlessHeader(data);
      const expectedUUID = Buffer.from(uuidText, "hex");

      if (!request.uuid.equals(expectedUUID)) {
        closeWebSocket(1008, "Unauthorized");
        return;
      }

      initialized = true;

      if (request.payload.length > 0) {
        pending.push(request.payload);
      }

      tcp = net.createConnection({
        host: request.address,
        port: request.port
      });

      tcp.setTimeout(120000);

      tcp.on("connect", () => {
        if (ws.readyState !== WebSocket.OPEN) {
          tcp.destroy();
          return;
        }

        connected = true;

        ws.send(
          Buffer.from([request.version, 0]),
          { binary: true },
          (error) => {
            if (error) {
              cleanup();
              closeWebSocket(1011, "WebSocket send failed");
            }
          }
        );

        for (const chunk of pending) {
          if (tcp.destroyed) break;
          tcp.write(chunk);
        }

        pending = [];
      });

      tcp.on("data", (chunk) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(chunk, { binary: true }, (error) => {
            if (error) cleanup();
          });
        }
      });

      tcp.on("timeout", () => {
        tcp.destroy(new Error("TCP connection timed out"));
      });

      tcp.on("end", () => {
        closeWebSocket(1000, "Destination closed");
      });

      tcp.on("error", (error) => {
        console.error("TCP upstream error:", error.message);
        closeWebSocket(1011, "Upstream connection failed");
      });

      tcp.on("close", () => {
        connected = false;

        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      });
    } catch (error) {
      console.error("VLESS request error:", error.message);
      closeWebSocket(1002, "Invalid VLESS request");
    }
  });

  ws.on("close", cleanup);

  ws.on("error", (error) => {
    console.error("WebSocket error:", error.message);
    cleanup();
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Adam listening on port ${PORT}`);
});
