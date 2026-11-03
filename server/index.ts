import "dotenv/config";
import { createServer, configFromEnv } from "./app.js";
const config = configFromEnv();
const app = createServer(config);
await app.listen({ host: config.host, port: Number(process.env.PORT || 8787) });
console.info(
  "WarmSip service ready. Credentials and request contents are not logged.",
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, () => {
    void app.close();
  });
