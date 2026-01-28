import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter, Ctx } from "./trpc";
import path from "path";
import { initDbs, initRedis } from "./rlibs";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { cleanupExpiredTokens, cleanupRateLimitKeys } from "./rlibs/index";

const app = express();
const port = process.env.PORT ?? 8888;

const cdp = path.join(__dirname, "../../web/dist");
app.use(express.static(cdp));
app.use(express.json());
app.use(helmet());

const SECRET = process.env.COOKIE_SECRET ?? "stupid";
app.use(cookieParser(SECRET));

app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext: ({ req, res }): Ctx => {
      const signedCookies = req.signedCookies as Record<
        string,
        string | undefined
      >;

      const ip = req.headers["x-forwarded-for"]
        ? (req.headers["x-forwarded-for"] as string).split(",")[0].trim()
        : req.socket.remoteAddress;

      const token = signedCookies["__Host-accessToken"];
      const refreshToken = signedCookies["__Host-refreshToken"];

      return {
        token,
        refreshToken,
        req,
        res,
        ip,
      };
    },
  }),
);

app.use((_, res, next) => {
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  next();
});

app.get(/^\/(?!trpc).*/, (_, res) => {
  res.sendFile(path.join(cdp, "index.html"));
});

async function initializeScheduledCleanups() {
  const CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

  async function runCleanup() {
    try {
      console.log("Running scheduled cleanup...");

      // Clean up expired rate limit keys
      const rateLimitCleaned = await cleanupRateLimitKeys();
      console.log(`Cleaned up ${rateLimitCleaned} rate limit keys`);

      const tokenCleaned = await cleanupExpiredTokens();
      console.log(`Cleaned up ${tokenCleaned} expired refresh tokens`);
    } catch (error) {
      console.error("Cleanup failed:", error);
    }
  }

  await runCleanup();

  // Schedule periodic cleanup
  setInterval(() => {
    runCleanup().catch((error) => {
      console.error("Cleanup failed:", error);
    });
  }, CLEANUP_INTERVAL_MS);
  console.log(`Scheduled cleanup every ${CLEANUP_INTERVAL_MS / 60000} minutes`);
}

async function initializeServer() {
  try {
    console.log("Initializing database pools...");
    await initDbs();
    console.log("Database pools initialized successfully");
    await initRedis();
    console.log("Redis initialized successfully");

    app.listen(port, () => {
      console.log(`Server listening on port ${port}`);
      console.log(`Frontend served from: ${cdp}`);
      console.log(`http://localhost:${port}`);
    });

    await initializeScheduledCleanups();
  } catch (error) {
    console.error("Failed to initialize database pools:", error);
    process.exit(1);
  }
}

void initializeServer();
