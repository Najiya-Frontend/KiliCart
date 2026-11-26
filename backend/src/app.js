import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";

import { env } from "./config/env.js";
import healthRoutes from "./routes/health.routes.js";
import roleRoutes from "./routes/role.routes.js";
import authRoutes from "./routes/auth.routes.js";
import sellerRoutes from "./routes/seller.routes.js";
import adminSellerRoutes from "./routes/admin-seller.routes.js";
import catalogueRoutes from "./routes/catalogue.routes.js";
import sellerCatalogueRoutes from "./routes/seller-catalogue.routes.js";
import adminCatalogueRoutes from "./routes/admin-catalogue.routes.js";
import sellerProductImageRoutes from "./routes/seller-product-images.routes.js";

import {
  notFoundHandler,
  errorHandler,
} from "./middleware/error.middleware.js";

const app = express();
// Only addresses explicitly verified for this deployment may supply forwarding headers.
if (env.trustedProxies.length) app.set('trust proxy', env.trustedProxies);

// Security headers
app.use(helmet());

// Cross-origin configuration
app.use(
  cors({
    origin: env.corsOrigin.split(",").map((origin) => origin.trim()),
    credentials: true,
  })
);

// Request body parsing
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

// Basic API rate limiting
app.use(
  "/api",
  rateLimit({
    skip: (req) => req.path === '/v1/auth' || req.path.startsWith('/v1/auth/'),
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  })
);

// API routes
app.use("/api/v1/health", healthRoutes);
app.use("/api/v1/roles", roleRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1", sellerRoutes);
app.use("/api/v1/admin", adminSellerRoutes);
app.use("/api/v1", sellerCatalogueRoutes);
app.use("/api/v1", sellerProductImageRoutes);
app.use("/api/v1/admin", adminCatalogueRoutes);
app.use("/api/v1", catalogueRoutes);

// Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
