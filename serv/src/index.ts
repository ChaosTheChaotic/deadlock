import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./trpc";
import path from "path";

const app = express();
const port = process.env.PORT ?? 8888;

const cdp = path.join(__dirname, "../../web/dist");
app.use(express.static(cdp));

app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
  }),
);

app.get(/^\/(?!trpc).*/, (req, res) => {
  res.sendFile(path.join(cdp, "index.html"));
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  console.log(`Frontend served from: ${cdp}`);
  console.log(`http://localhost:${port}`);
});
