import express from "express";
import {
  createExpressMiddleware,
  CreateExpressContextOptions,
} from "@trpc/server/adapters/express";
import { appRouter } from "./trpc";
import path from "path";
import { initDbs } from "./rlibs";
import cookieParser from "cookie-parser";
import helmet from "helmet";

const app = express();
const port = process.env.PORT ?? 8888;

const cdp = path.join(__dirname, "../../web/dist");
app.use(express.static(cdp));
app.use(express.json());
app.use(helmet());
app.use(cookieParser());

app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext: (opts: CreateExpressContextOptions) => {
      const { req, res } = opts;
      
      const cookies = req.cookies || {};
      const token = cookies.accessToken;

      const refreshToken = req.cookies?.refreshToken;

      return {
        token,
        refreshToken,
        req,
        res,
      };
    },
  }),
);

app.use((_, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

app.get(/^\/(?!trpc).*/, (_, res) => {
  res.sendFile(path.join(cdp, "index.html"));
});

async function initializeServer() {
  try {
    console.log("Initializing database pools...");
    await initDbs();
    console.log("Database pools initialized successfully");

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
