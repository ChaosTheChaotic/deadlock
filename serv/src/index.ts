import express, { Request } from "express";
import {
  createExpressMiddleware,
  CreateExpressContextOptions,
} from "@trpc/server/adapters/express";
import { appRouter } from "./trpc";
import path from "path";
import { initDbs } from "./rlibs";

const app = express();
const port = process.env.PORT ?? 8888;

const cdp = path.join(__dirname, "../../web/dist");
app.use(express.static(cdp));
app.use(express.json());

interface CtxRequest extends Request {
  ctx?: { token?: string };
}

app.use((req, _, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined;

  (req as CtxRequest).ctx = { token };
  next();
});

async function initializeServer() {
  try {
    console.log("Initializing database pools...");
    await initDbs();
    console.log("Database pools initialized successfully");

    app.use(
      "/trpc",
      createExpressMiddleware({
        router: appRouter,
        createContext: (opts: CreateExpressContextOptions) => {
          const req = opts.req as CtxRequest;

          return {
            token: req.ctx?.token,
          };
        },
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
