import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import router from "./routes/index.js";

const app = express();

// Trust Render's proxy so req.ip / audit logs record the real caller IP.
app.set("trust proxy", 1);

// Security: Helmet middleware for HTTP headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  xssFilter: true,
  noSniff: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));

// CORS configuration
app.use(cors({
  origin: true,
  credentials: true,
}));

// Rate limiting for brute force protection
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 login attempts per windowMs
  message: "Too many login attempts, please try again later.",
  skipSuccessfulRequests: true,
});

// Apply rate limiting to all requests
app.use(limiter);

// Apply stricter rate limiting to auth endpoints
app.use("/api/admin/login", authLimiter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api", router);

export default app;
