import express, { type Express, type ErrorRequestHandler } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { loadSession } from "./lib/auth";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.get("origin");
    const host = req.get("x-forwarded-host")?.split(",")[0]?.trim() || req.get("host");
    if (origin && new URL(origin).host !== host) { res.status(403).json({ error: "Cross-site requests are not allowed." }); return; }
  }
  next();
});
app.use(loadSession);

app.use("/api", router);
const handleError: ErrorRequestHandler = (err, req, res, _next) => {
  req.log.error({ err }, "Request failed");
  if (res.headersSent) { res.end(); return; }
  res.status(err.status === 400 ? 400 : 500).json({ error: err.status === 400 ? "Invalid request." : "Something went wrong. Please try again." });
};
app.use(handleError);

export default app;
