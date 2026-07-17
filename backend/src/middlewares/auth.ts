import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { logAudit } from "../lib/db.js";

export interface AdminJwtPayload {
  sub: string;   // username
  role: "owner" | "admin";
}

// Declaration merging so `req.adminUser` is typed everywhere requireAuth runs,
// without every route having to re-cast req as any just to read the caller's
// identity for audit logging / role checks.
declare global {
  namespace Express {
    interface Request {
      adminUser?: AdminJwtPayload;
    }
  }
}

export function getClientIp(req: Request): string {
  // req.ip respects `app.set('trust proxy', 1)` (set in app.ts) so this is the
  // real caller IP on Render/behind a proxy, not the proxy's own address.
  return req.ip || (req.socket && req.socket.remoteAddress) || "unknown";
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = header.slice(7);
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) {
    res.status(500).json({ error: "Server misconfigured" });
    return;
  }
  try {
    const payload = jwt.verify(token, secret) as AdminJwtPayload;
    if (!payload?.sub) { res.status(401).json({ error: "Invalid or expired token" }); return; }
    req.adminUser = payload;
    // Real, automatic audit trail: every state-changing admin request gets
    // logged here, once, in one place -- instead of every route handler
    // needing to remember to log itself. Reads (GET) aren't logged; they
    // aren't security-relevant the way a change is. Fire-and-forget: a
    // logging failure should never block the actual admin action.
    if (MUTATING_METHODS.has(req.method)) {
      logAudit(payload.sub, `${req.method} ${req.baseUrl}${req.path}`, null, getClientIp(req)).catch(() => {});
    }
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Stricter guard for account-management endpoints (creating/removing admins) --
// only an "owner" can manage other admin accounts. Must run after requireAuth.
export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (req.adminUser?.role !== "owner") {
    res.status(403).json({ error: "Only an owner account can do this" });
    return;
  }
  next();
}
