import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { createRuntimeHandler } from "./runtime.js";

const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? "0.0.0.0";
const handler = await createRuntimeHandler({ loadDotEnv: true });

const server = createServer(handler);
function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((iface) => iface && iface.family === "IPv4" && !iface.internal)
    .map((iface) => iface.address);
}

server.listen(port, host, () => {
  console.log(`Kalpi Alpha → http://127.0.0.1:${port}`);
  for (const address of lanAddresses()) {
    console.log(`Kalpi Alpha (phone) → http://${address}:${port}`);
  }
});
