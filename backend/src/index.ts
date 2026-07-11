import app from "./app.js";
import { initDb } from "./lib/db.js";

const PORT = Number(process.env.PORT) || 3001;

// Create tables / run migrations / seed default content before accepting
// any requests, so the very first request never races an empty database.
await initDb();

app.listen(PORT, () => {
  console.log(`PIS API server running on http://localhost:${PORT}`);
});

// Turso is a remote database -- there's no local WAL file to checkpoint on
// shutdown anymore, the driver just closes its network connection.
function shutdown() {
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
