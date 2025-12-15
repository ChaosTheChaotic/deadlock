import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./trpc";
import path from "path";
import { initDbs } from "./rlibs";

const app = express();
const port = process.env.PORT ?? 8888;

const cdp = path.join(__dirname, "../../web/dist");
app.use(express.static(cdp));

async function initializeServer() {
  try {
    console.log("Initializing database pools...");
    await initDbs();
    console.log("Database pools initialized successfully");

    app.use(
      "/trpc",
      createExpressMiddleware({
        router: appRouter,
      }),
    );

    app.get(/^\/(?!trpc).*/, (_, res) => {
      res.sendFile(path.join(cdp, "index.html"));
    });

    app.listen(port, () => {
      console.log(`Server listening on port ${port}`);
      console.log(`Frontend served from: ${cdp}`);
      console.log(`http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Failed to initialize database pools:", error);
    process.exit(1);
  }
}

void initializeServer();
