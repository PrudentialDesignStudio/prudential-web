import { Router } from "express";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { requireAuth } from "../middlewares/auth.js";
import db, { logVersion, TRASHABLE_TABLES, purgeExpiredTrash, TRASH_RETENTION_DAYS, reorderTable } from "../lib/db.js";

const router = Router();

// Auth
// The effective admin password is whatever was last saved via /change-password
// (persisted in site_settings, so it survives restarts/redeploys); if nothing's
// been saved yet, it falls back to the ADMIN_PASSWORD env var from Render.
async function getEffectivePassword(): Promise<string | undefined> {
  const row: any = await db.prepare("SELECT value FROM site_settings WHERE key = 'admin_password_hash'").get();
  return row?.value ?? process.env.ADMIN_PASSWORD;
}

router.post("/login", async (req, res) => {
  const { password } = req.body as { password?: string };
  const jwtSecret = process.env.ADMIN_JWT_SECRET;
  if (!jwtSecret) { res.status(500).json({ error: "Server misconfigured" }); return; }
  const adminPassword = await getEffectivePassword();
  if (!adminPassword) { res.status(500).json({ error: "Server misconfigured" }); return; }
  if (!password || password !== adminPassword) { res.status(401).json({ error: "Incorrect password" }); return; }
  const token = jwt.sign({ role: "admin" }, jwtSecret, { expiresIn: "8h" });
  res.json({ token });
});

router.post("/change-password", requireAuth, async (req, res) => {
  const { newPassword } = req.body as { newPassword?: string };
  if (!newPassword || newPassword.length < 6) { res.status(400).json({ error: "Password must be at least 6 characters" }); return; }
  await db.prepare("INSERT INTO site_settings (key,value) VALUES ('admin_password_hash',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(newPassword);
  process.env.ADMIN_PASSWORD = newPassword;
  res.json({ ok: true });
});

// Forgot password — emails the current admin password to the school's admin inbox.
// Uses the same Gmail transporter/env vars as the admissions notification email.
const FORGOT_PW_COOLDOWN_MS = 60_000;
let lastForgotPwSentAt = 0;

router.post("/forgot-password", async (_req, res) => {
  const now = Date.now();
  const elapsed = now - lastForgotPwSentAt;
  if (lastForgotPwSentAt && elapsed < FORGOT_PW_COOLDOWN_MS) {
    const waitSec = Math.ceil((FORGOT_PW_COOLDOWN_MS - elapsed) / 1000);
    res.status(429).json({ error: `Please wait ${waitSec}s before requesting again` });
    return;
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_PASS;
  const recipient = process.env.ADMIN_RECOVERY_EMAIL || "pis.abuja@gmail.com";
  if (!gmailUser || !gmailPass) { res.status(500).json({ error: "Email is not configured on the server" }); return; }

  const adminPassword = await getEffectivePassword();
  if (!adminPassword) { res.status(500).json({ error: "Server misconfigured" }); return; }

  try {
    const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailPass } });
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
        <div style="background:#0B1F5C;padding:20px;text-align:center;">
          <h2 style="color:#FFD700;margin:0;">Prudential International School</h2>
          <p style="color:#00AEEF;margin:4px 0 0;">Admin Password Recovery</p>
        </div>
        <div style="padding:24px;background:#f9fafc;">
          <p style="color:#333;font-size:14px;">Someone requested the admin dashboard password from the login screen.</p>
          <div style="background:#eef2ff;border-radius:8px;padding:16px;text-align:center;margin:16px 0;">
            <span style="font-size:12px;color:#555;letter-spacing:1px;text-transform:uppercase;">Current Password</span>
            <div style="font-size:22px;font-weight:800;color:#0B1F5C;margin-top:6px;letter-spacing:1px;">${adminPassword}</div>
          </div>
          <p style="color:#888;font-size:12px;">If you didn't request this, someone else has access to the login page — consider changing the password once signed in.</p>
        </div>
        <div style="background:#0B1F5C;padding:12px;text-align:center;">
          <p style="color:rgba(255,255,255,.6);font-size:11px;margin:0;">Prudential International School · Admin Dashboard</p>
        </div>
      </div>`;
    await transporter.sendMail({
      from: `"PIS Admin Dashboard" <${gmailUser}>`,
      to: recipient,
      subject: "Admin Dashboard Password Recovery",
      html,
    });
    lastForgotPwSentAt = now;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to send recovery email" });
  }
});

// Version History
router.get("/history", requireAuth, async (req, res) => {
  const { table, id } = req.query;
  let rows;
  if (table && id) {
    rows = await db.prepare("SELECT * FROM version_history WHERE table_name=? AND record_id=? ORDER BY changed_at DESC LIMIT 50").all(table, id);
  } else if (table) {
    rows = await db.prepare("SELECT * FROM version_history WHERE table_name=? ORDER BY changed_at DESC LIMIT 100").all(table);
  } else {
    rows = await db.prepare("SELECT * FROM version_history ORDER BY changed_at DESC LIMIT 100").all();
  }
  res.json(rows);
});

// Trash / Recently Deleted ------------------------------------------------
// Soft-deleted rows across every trashable table, newest-deleted first.
// Anything past the retention window is purged before the list is built,
// so what's shown is always actually restorable.
router.get("/trash", requireAuth, async (_req, res) => {
  await purgeExpiredTrash();
  const out: any[] = [];
  for (const [table, meta] of Object.entries(TRASHABLE_TABLES)) {
    const rows: any[] = await db.prepare(`SELECT * FROM ${table} WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`).all();
    for (const r of rows) {
      out.push({
        table,
        id: r.id,
        kind: meta.label,
        title: r[meta.titleField] || `${meta.label} #${r.id}`,
        sub: meta.subField ? r[meta.subField] : null,
        imageUrl: r.image_url ?? null,
        deletedAt: r.deleted_at,
        retentionDays: TRASH_RETENTION_DAYS,
      });
    }
  }
  out.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
  res.json(out);
});
router.post("/trash/:table/:id/restore", requireAuth, async (req, res) => {
  const { table, id } = req.params;
  if (!TRASHABLE_TABLES[table]) { res.status(400).json({ error: "Unknown table" }); return; }
  await db.prepare(`UPDATE ${table} SET deleted_at = NULL WHERE id = ?`).run(Number(id));
  res.json({ ok: true });
});
router.delete("/trash/:table/:id", requireAuth, async (req, res) => {
  const { table, id } = req.params;
  if (!TRASHABLE_TABLES[table]) { res.status(400).json({ error: "Unknown table" }); return; }
  await db.prepare(`DELETE FROM ${table} WHERE id = ? AND deleted_at IS NOT NULL`).run(Number(id));
  res.status(204).send();
});

// Gallery Categories
router.get("/gallery/categories", requireAuth, async (_req, res) => {
  const cats: any[] = await db.prepare("SELECT * FROM gallery_categories ORDER BY display_order ASC, name ASC").all();
  const counts: any[] = await db.prepare("SELECT category, COUNT(*) as count FROM gallery_items WHERE deleted_at IS NULL GROUP BY category").all();
  const countMap: Record<string, number> = {};
  for (const c of counts) countMap[c.category] = c.count;
  res.json(cats.map(c => ({ ...c, itemCount: countMap[c.name] ?? 0 })));
});
router.post("/gallery/categories", requireAuth, async (req, res) => {
  const name = (req.body.name as string ?? "").trim();
  if (!name) { res.status(400).json({ error: "Category name is required" }); return; }
  const exists = await db.prepare("SELECT 1 FROM gallery_categories WHERE name = ?").get(name);
  if (exists) { res.status(409).json({ error: "A category with this name already exists" }); return; }
  const maxOrder: any = await db.prepare("SELECT COALESCE(MAX(display_order), -1) as m FROM gallery_categories").get();
  const result = await db.prepare("INSERT INTO gallery_categories (name, display_order) VALUES (?, ?) RETURNING *").get(name, maxOrder.m + 1);
  res.status(201).json(result);
});
router.put("/gallery/categories/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const e: any = await db.prepare("SELECT * FROM gallery_categories WHERE id = ?").get(id);
  if (!e) { res.status(404).json({ error: "Not found" }); return; }
  const newName = (req.body.name as string ?? "").trim();
  if (!newName) { res.status(400).json({ error: "Category name is required" }); return; }
  // Renaming a category updates every gallery item already filed under the old name too,
  // so existing photos/videos stay attached to the (renamed) category instead of going orphaned.
  await db.prepare("UPDATE gallery_categories SET name = ? WHERE id = ?").run(newName, id);
  await db.prepare("UPDATE gallery_items SET category = ? WHERE category = ?").run(newName, e.name);
  res.json({ ...e, name: newName });
});
router.delete("/gallery/categories/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const e: any = await db.prepare("SELECT * FROM gallery_categories WHERE id = ?").get(id);
  if (!e) { res.status(404).json({ error: "Not found" }); return; }
  const itemCount: any = await db.prepare("SELECT COUNT(*) as c FROM gallery_items WHERE category = ? AND deleted_at IS NULL").get(e.name);
  if (itemCount.c > 0) {
    res.status(409).json({ error: `This category still has ${itemCount.c} item(s). Move or delete them first.` });
    return;
  }
  await db.prepare("DELETE FROM gallery_categories WHERE id = ?").run(id);
  res.status(204).send();
});

// Gallery
// Supports optional ?category=&type= filtering so the admin dashboard can ask
// for exactly the slice it's displaying — mirrors the public /cms/gallery
// query shape, but (unlike the public route) intentionally does NOT filter by
// published, since admins need to see and manage hidden/unpublished items too.
router.get("/gallery", requireAuth, async (req, res) => {
  const type = req.query.type as string | undefined;
  const category = req.query.category as string | undefined;
  let data: any[];
  if (type && category) {
    data = await db.prepare("SELECT * FROM gallery_items WHERE type=? AND category=? AND deleted_at IS NULL ORDER BY display_order ASC, created_at ASC").all(type, category);
  } else if (type) {
    data = await db.prepare("SELECT * FROM gallery_items WHERE type=? AND deleted_at IS NULL ORDER BY display_order ASC, created_at ASC").all(type);
  } else if (category) {
    data = await db.prepare("SELECT * FROM gallery_items WHERE category=? AND deleted_at IS NULL ORDER BY display_order ASC, created_at ASC").all(category);
  } else {
    data = await db.prepare("SELECT * FROM gallery_items WHERE deleted_at IS NULL ORDER BY display_order ASC, created_at ASC").all();
  }
  res.json(data);
});
router.post("/gallery", requireAuth, async (req, res) => {
  const { url, caption, type, category, displayOrder } = req.body;
  const result = await db.prepare("INSERT INTO gallery_items (url,caption,type,category,display_order) VALUES (?,?,?,?,?) RETURNING *").get(url, caption, type ?? "image", category ?? "General", displayOrder ?? 0);
  res.status(201).json(result);
});
// Add several uploaded items to one category in a single request — this is what
// the "drop files into a category" admin flow calls after Cloudinary returns the URLs.
router.post("/gallery/batch", requireAuth, async (req, res) => {
  const { items } = req.body as { items?: { url: string; caption?: string; type?: string; category: string }[] };
  if (!Array.isArray(items) || items.length === 0) { res.status(400).json({ error: "No items provided" }); return; }
  const insert = db.prepare("INSERT INTO gallery_items (url,caption,type,category,display_order) VALUES (?,?,?,?,?) RETURNING *");
  const maxOrders: Record<string, number> = {};
  const inserted = [];
  for (const item of items) {
    if (maxOrders[item.category] === undefined) {
      const row: any = await db.prepare("SELECT COALESCE(MAX(display_order), -1) as m FROM gallery_items WHERE category = ?").get(item.category);
      maxOrders[item.category] = row.m;
    }
    maxOrders[item.category] += 1;
    inserted.push(await insert.get(item.url, item.caption ?? null, item.type ?? "image", item.category, maxOrders[item.category]));
  }
  res.status(201).json(inserted);
});
router.put("/gallery/reorder", requireAuth, async (req, res) => {
  const { ids } = req.body as { ids?: number[] };
  if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: "ids array is required" }); return; }
  await reorderTable("gallery_items", ids);
  res.json({ ok: true });
});
router.put("/gallery/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const e: any = await db.prepare("SELECT * FROM gallery_items WHERE id=?").get(id);
  if (!e) { res.status(404).json({ error: "Not found" }); return; }
  const { url, caption, type, category, displayOrder } = req.body;
  if (url && url !== e.url) await logVersion("gallery_items", id, "url", e.url, url);
  if (category && category !== e.category) await logVersion("gallery_items", id, "category", e.category, category);
  const result = await db.prepare("UPDATE gallery_items SET url=?,caption=?,type=?,category=?,display_order=? WHERE id=? RETURNING *").get(url??e.url, caption??e.caption, type??e.type, category??e.category, displayOrder??e.display_order, id);
  res.json(result);
});
router.delete("/gallery/:id", requireAuth, async (req, res) => {
  await db.prepare("UPDATE gallery_items SET deleted_at = datetime('now') WHERE id=?").run(Number(req.params.id));
  res.status(204).send();
});
// Bulk actions: multi-select publish / unpublish / delete. Delete routes
// through the same soft-delete Trash system as the single-item delete above —
// there is no second, hard-delete path here.
router.post("/gallery/bulk", requireAuth, async (req, res) => {
  const { ids, action } = req.body as { ids?: number[]; action?: "publish" | "unpublish" | "delete" };
  if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: "ids array is required" }); return; }
  if (!["publish", "unpublish", "delete"].includes(action ?? "")) { res.status(400).json({ error: "Unknown action" }); return; }
  for (const id of ids) {
    if (action === "publish") await db.prepare("UPDATE gallery_items SET published=1 WHERE id=?").run(id);
    else if (action === "unpublish") await db.prepare("UPDATE gallery_items SET published=0 WHERE id=?").run(id);
    else await db.prepare("UPDATE gallery_items SET deleted_at = datetime('now') WHERE id=?").run(id);
  }
  res.json({ ok: true });
});

// Announcements
router.get("/announcements", requireAuth, async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM announcements WHERE deleted_at IS NULL ORDER BY created_at DESC").all());
});
router.post("/announcements", requireAuth, async (req, res) => {
  const { title, body, imageUrl, published } = req.body;
  const result = await db.prepare("INSERT INTO announcements (title,body,image_url,published) VALUES (?,?,?,?) RETURNING *").get(title, body, imageUrl??null, (published??true)?1:0);
  res.status(201).json(result);
});
router.put("/announcements/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const e: any = await db.prepare("SELECT * FROM announcements WHERE id=?").get(id);
  if (!e) { res.status(404).json({ error: "Not found" }); return; }
  const { title, body, imageUrl, published } = req.body;
  if (body && body !== e.body) await logVersion("announcements", id, "body", e.body, body);
  const result = await db.prepare("UPDATE announcements SET title=?,body=?,image_url=?,published=?,updated_at=? WHERE id=? RETURNING *").get(title??e.title, body??e.body, imageUrl!==undefined?imageUrl:e.image_url, published!==undefined?(published?1:0):e.published, new Date().toISOString(), id);
  res.json(result);
});
router.delete("/announcements/:id", requireAuth, async (req, res) => {
  await db.prepare("UPDATE announcements SET deleted_at = datetime('now') WHERE id=?").run(Number(req.params.id));
  res.status(204).send();
});

// Testimonials
router.get("/testimonials", requireAuth, async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM testimonials WHERE deleted_at IS NULL ORDER BY display_order ASC, created_at ASC").all());
});
router.post("/testimonials", requireAuth, async (req, res) => {
  const { imageUrl, caption, displayOrder, published } = req.body;
  const result = await db.prepare("INSERT INTO testimonials (image_url,caption,display_order,published) VALUES (?,?,?,?) RETURNING *").get(imageUrl, caption ?? null, displayOrder ?? 0, (published??true)?1:0);
  res.status(201).json(result);
});
router.put("/testimonials/reorder", requireAuth, async (req, res) => {
  const { ids } = req.body as { ids?: number[] };
  if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: "ids array is required" }); return; }
  await reorderTable("testimonials", ids);
  res.json({ ok: true });
});
router.put("/testimonials/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const e: any = await db.prepare("SELECT * FROM testimonials WHERE id=?").get(id);
  if (!e) { res.status(404).json({ error: "Not found" }); return; }
  const { imageUrl, caption, displayOrder, published } = req.body;
  if (imageUrl && imageUrl !== e.image_url) await logVersion("testimonials", id, "image_url", e.image_url, imageUrl);
  const result = await db.prepare("UPDATE testimonials SET image_url=?,caption=?,display_order=?,published=?,updated_at=? WHERE id=? RETURNING *").get(imageUrl??e.image_url, caption!==undefined?caption:e.caption, displayOrder!==undefined?displayOrder:e.display_order, published!==undefined?(published?1:0):e.published, new Date().toISOString(), id);
  res.json(result);
});
router.delete("/testimonials/:id", requireAuth, async (req, res) => {
  await db.prepare("UPDATE testimonials SET deleted_at = datetime('now') WHERE id=?").run(Number(req.params.id));
  res.status(204).send();
});

// Events
router.get("/events", requireAuth, async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM events WHERE deleted_at IS NULL ORDER BY event_date ASC").all());
});
router.post("/events", requireAuth, async (req, res) => {
  const { title, description, eventDate, location, imageUrl, published } = req.body;
  const result = await db.prepare("INSERT INTO events (title,description,event_date,location,image_url,published) VALUES (?,?,?,?,?,?) RETURNING *").get(title, description??null, eventDate, location??null, imageUrl??null, (published??true)?1:0);
  res.status(201).json(result);
});
router.put("/events/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const e: any = await db.prepare("SELECT * FROM events WHERE id=?").get(id);
  if (!e) { res.status(404).json({ error: "Not found" }); return; }
  const { title, description, eventDate, location, imageUrl, published } = req.body;
  const result = await db.prepare("UPDATE events SET title=?,description=?,event_date=?,location=?,image_url=?,published=?,updated_at=? WHERE id=? RETURNING *").get(title??e.title, description!==undefined?description:e.description, eventDate??e.event_date, location!==undefined?location:e.location, imageUrl!==undefined?imageUrl:e.image_url, published!==undefined?(published?1:0):e.published, new Date().toISOString(), id);
  res.json(result);
});
router.delete("/events/:id", requireAuth, async (req, res) => {
  await db.prepare("UPDATE events SET deleted_at = datetime('now') WHERE id=?").run(Number(req.params.id));
  res.status(204).send();
});

// Contact GET/PUT defined below with hours field

// Hero
router.get("/hero", requireAuth, async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM hero_content WHERE id=1").get());
});
// Hero PUT is defined below with full stats + CTA fields

// About
router.get("/about", requireAuth, async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM about_content WHERE id=1").get());
});
router.put("/about", requireAuth, async (req, res) => {
  const { story1, story2, story3, mission, vision, img1, img2 } = req.body;
  const e: any = await db.prepare("SELECT * FROM about_content WHERE id=1").get();
  for (const f of ["story1","story2","story3","mission","vision"]) {
    const v = req.body[f];
    if (v && v !== (e as any)[f]) await logVersion("about_content", 1, f, (e as any)[f], v);
  }
  const result = await db.prepare("UPDATE about_content SET story1=?,story2=?,story3=?,mission=?,vision=?,img1=?,img2=?,updated_at=? WHERE id=1 RETURNING *").get(story1??e.story1, story2??e.story2, story3??e.story3, mission??e.mission, vision??e.vision, img1!==undefined?img1:e.img1, img2!==undefined?img2:e.img2, new Date().toISOString());
  res.json(result);
});

// Values
router.get("/values", requireAuth, async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM school_values WHERE deleted_at IS NULL ORDER BY display_order").all());
});
router.post("/values", requireAuth, async (req, res) => {
  const { title, body } = req.body;
  if (!title || !body) { res.status(400).json({ error: "Title and body required" }); return; }
  res.json(await db.prepare("INSERT INTO school_values (title,body) VALUES (?,?) RETURNING *").get(title, body));
});
router.put("/values/reorder", requireAuth, async (req, res) => {
  const { ids } = req.body as { ids?: number[] };
  if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: "ids array is required" }); return; }
  await reorderTable("school_values", ids);
  res.json({ ok: true });
});
router.put("/values/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { title, body } = req.body;
  const e: any = await db.prepare("SELECT * FROM school_values WHERE id=?").get(id);
  if (!e) { res.status(404).json({ error: "Not found" }); return; }
  if (body && body !== e.body) await logVersion("school_values", id, "body", e.body, body);
  const result = await db.prepare("UPDATE school_values SET title=?,body=?,updated_at=? WHERE id=? RETURNING *").get(title, body, new Date().toISOString(), id);
  res.json(result);
});
router.delete("/values/:id", requireAuth, async (req, res) => {
  await db.prepare("UPDATE school_values SET deleted_at = datetime('now') WHERE id=?").run(Number(req.params.id));
  res.status(204).send();
});

// Goals
router.get("/goals", requireAuth, async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM school_goals ORDER BY display_order").all());
});
router.post("/goals", requireAuth, async (req, res) => {
  const { body } = req.body;
  if (!body) { res.status(400).json({ error: "Goal text required" }); return; }
  const maxOrder: any = await db.prepare("SELECT COALESCE(MAX(display_order), 0) as m FROM school_goals").get();
  res.json(await db.prepare("INSERT INTO school_goals (body,display_order) VALUES (?,?) RETURNING *").get(body, maxOrder.m + 1));
});
router.put("/goals/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { body } = req.body;
  const e: any = await db.prepare("SELECT * FROM school_goals WHERE id=?").get(id);
  if (!e) { res.status(404).json({ error: "Not found" }); return; }
  if (body && body !== e.body) await logVersion("school_goals", id, "body", e.body, body);
  const result = await db.prepare("UPDATE school_goals SET body=?,updated_at=? WHERE id=? RETURNING *").get(body ?? e.body, new Date().toISOString(), id);
  res.json(result);
});
router.delete("/goals/:id", requireAuth, async (req, res) => {
  await db.prepare("DELETE FROM school_goals WHERE id=?").run(Number(req.params.id));
  res.status(204).send();
});

// Academic Divisions
router.get("/divisions", requireAuth, async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM academic_divisions WHERE deleted_at IS NULL ORDER BY display_order").all());
});
router.post("/divisions", requireAuth, async (req, res) => {
  const { title, age_range, body } = req.body;
  if (!title || !body) { res.status(400).json({ error: "Title and body required" }); return; }
  res.json(await db.prepare("INSERT INTO academic_divisions (title,age_range,body) VALUES (?,?,?) RETURNING *").get(title, age_range, body));
});
router.put("/divisions/reorder", requireAuth, async (req, res) => {
  const { ids } = req.body as { ids?: number[] };
  if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: "ids array is required" }); return; }
  await reorderTable("academic_divisions", ids);
  res.json({ ok: true });
});
router.put("/divisions/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const e: any = await db.prepare("SELECT * FROM academic_divisions WHERE id=?").get(id);
  if (!e) { res.status(404).json({ error: "Not found" }); return; }
  const { title, ageRange, body } = req.body;
  if (body && body !== e.body) await logVersion("academic_divisions", id, "body", e.body, body);
  const result = await db.prepare("UPDATE academic_divisions SET title=?,age_range=?,body=?,updated_at=? WHERE id=? RETURNING *").get(title??e.title, ageRange??e.age_range, body??e.body, new Date().toISOString(), id);
  res.json(result);
});
router.delete("/divisions/:id", requireAuth, async (req, res) => {
  await db.prepare("UPDATE academic_divisions SET deleted_at = datetime('now') WHERE id=?").run(Number(req.params.id));
  res.status(204).send();
});

// Staff
router.get("/staff", requireAuth, async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM staff_members WHERE deleted_at IS NULL ORDER BY display_order ASC").all());
});
router.post("/staff", requireAuth, async (req, res) => {
  const { name, title, department, imageUrl, displayOrder } = req.body;
  const result = await db.prepare("INSERT INTO staff_members (name,title,department,image_url,display_order) VALUES (?,?,?,?,?) RETURNING *").get(name, title, department??null, imageUrl??null, displayOrder??0);
  res.status(201).json(result);
});
router.put("/staff/reorder", requireAuth, async (req, res) => {
  const { ids } = req.body as { ids?: number[] };
  if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: "ids array is required" }); return; }
  await reorderTable("staff_members", ids);
  res.json({ ok: true });
});
router.put("/staff/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const e: any = await db.prepare("SELECT * FROM staff_members WHERE id=?").get(id);
  if (!e) { res.status(404).json({ error: "Not found" }); return; }
  const { name, title, department, imageUrl, displayOrder } = req.body;
  if (name && name !== e.name) await logVersion("staff_members", id, "name", e.name, name);
  if (title && title !== e.title) await logVersion("staff_members", id, "title", e.title, title);
  const result = await db.prepare("UPDATE staff_members SET name=?,title=?,department=?,image_url=?,display_order=? WHERE id=? RETURNING *").get(name??e.name, title??e.title, department!==undefined?department:e.department, imageUrl!==undefined?imageUrl:e.image_url, displayOrder??e.display_order, id);
  res.json(result);
});
router.post("/staff/bulk", requireAuth, async (req, res) => {
  const { ids, action } = req.body as { ids?: number[]; action?: "publish" | "unpublish" | "delete" };
  if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: "ids array is required" }); return; }
  if (!["publish", "unpublish", "delete"].includes(action ?? "")) { res.status(400).json({ error: "Unknown action" }); return; }
  for (const id of ids) {
    if (action === "publish") await db.prepare("UPDATE staff_members SET published=1 WHERE id=?").run(id);
    else if (action === "unpublish") await db.prepare("UPDATE staff_members SET published=0 WHERE id=?").run(id);
    else await db.prepare("UPDATE staff_members SET deleted_at = datetime('now') WHERE id=?").run(id);
  }
  res.json({ ok: true });
});
router.delete("/staff/:id", requireAuth, async (req, res) => {
  await db.prepare("UPDATE staff_members SET deleted_at = datetime('now') WHERE id=?").run(Number(req.params.id));
  res.status(204).send();
});

// Rules
router.get("/rules", requireAuth, async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM rules_regulations WHERE deleted_at IS NULL ORDER BY display_order ASC").all());
});
router.post("/rules", requireAuth, async (req, res) => {
  const { category, content, displayOrder } = req.body;
  const result = await db.prepare("INSERT INTO rules_regulations (category,content,display_order) VALUES (?,?,?) RETURNING *").get(category, content, displayOrder??0);
  res.status(201).json(result);
});
router.put("/rules/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const e: any = await db.prepare("SELECT * FROM rules_regulations WHERE id=?").get(id);
  if (!e) { res.status(404).json({ error: "Not found" }); return; }
  const { category, content, displayOrder } = req.body;
  if (content && content !== e.content) await logVersion("rules_regulations", id, "content", e.content, content);
  const result = await db.prepare("UPDATE rules_regulations SET category=?,content=?,display_order=? WHERE id=? RETURNING *").get(category??e.category, content??e.content, displayOrder??e.display_order, id);
  res.json(result);
});
router.delete("/rules/:id", requireAuth, async (req, res) => {
  await db.prepare("UPDATE rules_regulations SET deleted_at = datetime('now') WHERE id=?").run(Number(req.params.id));
  res.status(204).send();
});

// Anthem
router.get("/anthem", requireAuth, async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM anthem_content WHERE id=1").get());
});
router.put("/anthem", requireAuth, async (req, res) => {
  const { schoolTitle, schoolLyrics, schoolAudio, nationalTitle, nationalLyrics, nationalAudio } = req.body;
  const e: any = await db.prepare("SELECT * FROM anthem_content WHERE id=1").get();
  if (schoolLyrics && schoolLyrics !== e.school_lyrics) await logVersion("anthem_content", 1, "school_lyrics", e.school_lyrics, schoolLyrics);
  if (nationalLyrics && nationalLyrics !== e.national_lyrics) await logVersion("anthem_content", 1, "national_lyrics", e.national_lyrics, nationalLyrics);
  const result = await db.prepare(`UPDATE anthem_content SET school_title=?,school_lyrics=?,school_audio=?,national_title=?,national_lyrics=?,national_audio=?,updated_at=? WHERE id=1 RETURNING *`).get(schoolTitle??e.school_title, schoolLyrics??e.school_lyrics, schoolAudio!==undefined?schoolAudio:e.school_audio, nationalTitle??e.national_title, nationalLyrics??e.national_lyrics, nationalAudio!==undefined?nationalAudio:e.national_audio, new Date().toISOString());
  res.json(result);
});

// Submissions
router.get("/submissions", requireAuth, async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM contact_submissions ORDER BY created_at DESC").all());
});
router.put("/submissions/:id/read", requireAuth, async (req, res) => {
  await db.prepare("UPDATE contact_submissions SET read=1 WHERE id=?").run(Number(req.params.id));
  res.json({ ok: true });
});
router.put("/submissions/:id/notes", requireAuth, async (req, res) => {
  const { notes } = req.body;
  await db.prepare("UPDATE contact_submissions SET notes=? WHERE id=?").run(notes, Number(req.params.id));
  res.json({ ok: true });
});
router.delete("/submissions/:id", requireAuth, async (req, res) => {
  await db.prepare("DELETE FROM contact_submissions WHERE id=?").run(Number(req.params.id));
  res.status(204).send();
});

// Admissions
router.get("/admissions", requireAuth, async (_req, res) => {
  const rows = await db.prepare("SELECT * FROM admissions ORDER BY created_at DESC").all();
  res.json(rows);
});
router.put("/admissions/:id/read", requireAuth, async (req, res) => {
  await db.prepare("UPDATE admissions SET read=1 WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});
router.delete("/admissions/:id", requireAuth, async (req, res) => {
  await db.prepare("DELETE FROM admissions WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// Site Texts
router.get("/texts", requireAuth, async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM site_texts ORDER BY key").all());
});
router.put("/texts/:key", requireAuth, async (req, res) => {
  const { value } = req.body as { value?: string };
  if (value === undefined) { res.status(400).json({ error: "value required" }); return; }
  const result = await db.prepare("UPDATE site_texts SET value=?,updated_at=? WHERE key=? RETURNING *").get(value, new Date().toISOString(), req.params.key);
  if (!result) { res.status(404).json({ error: "Key not found" }); return; }
  res.json(result);
});

// ── Hero (extended: stats + CTA) ──────────────────────────────────────────
router.put("/hero", requireAuth, async (req, res) => {
  const { headline, subtext, badge, btn1Text, btn2Text, bgImage,
    stat1Num, stat1Label, stat2Num, stat2Label, stat3Num, stat3Label,
    ctaBadge, ctaHeading, ctaBody, ctaBtn1, ctaBtn2 } = req.body;
  const e: any = await db.prepare("SELECT * FROM hero_content WHERE id=1").get();
  if (headline && headline !== e.headline) await logVersion("hero_content", 1, "headline", e.headline, headline);
  if (subtext && subtext !== e.subtext) await logVersion("hero_content", 1, "subtext", e.subtext, subtext);
  const result = await db.prepare(`UPDATE hero_content SET
    headline=?,subtext=?,badge=?,btn1_text=?,btn2_text=?,bg_image=?,
    stat1_num=?,stat1_label=?,stat2_num=?,stat2_label=?,stat3_num=?,stat3_label=?,
    cta_badge=?,cta_heading=?,cta_body=?,cta_btn1=?,cta_btn2=?,updated_at=?
    WHERE id=1 RETURNING *`).get(
    headline??e.headline, subtext??e.subtext, badge??e.badge,
    btn1Text??e.btn1_text, btn2Text??e.btn2_text,
    bgImage!==undefined?bgImage:e.bg_image,
    stat1Num??e.stat1_num, stat1Label??e.stat1_label,
    stat2Num??e.stat2_num, stat2Label??e.stat2_label,
    stat3Num??e.stat3_num, stat3Label??e.stat3_label,
    ctaBadge??e.cta_badge, ctaHeading??e.cta_heading, ctaBody??e.cta_body,
    ctaBtn1??e.cta_btn1, ctaBtn2??e.cta_btn2,
    new Date().toISOString());
  res.json(result);
});

// Homepage Features
router.get("/features", requireAuth, async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM homepage_features ORDER BY display_order ASC").all());
});
router.post("/features", requireAuth, async (req, res) => {
  const { title, body, displayOrder } = req.body;
  const max = (await db.prepare("SELECT MAX(display_order) as m FROM homepage_features").get() as any)?.m ?? 0;
  const result = await db.prepare("INSERT INTO homepage_features (title,body,display_order) VALUES (?,?,?) RETURNING *").get(title, body, displayOrder??max+1);
  res.status(201).json(result);
});
router.put("/features/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const e: any = await db.prepare("SELECT * FROM homepage_features WHERE id=?").get(id);
  if (!e) { res.status(404).json({ error: "Not found" }); return; }
  const { title, body, displayOrder } = req.body;
  const result = await db.prepare("UPDATE homepage_features SET title=?,body=?,display_order=? WHERE id=? RETURNING *").get(title??e.title, body??e.body, displayOrder??e.display_order, id);
  res.json(result);
});
router.delete("/features/:id", requireAuth, async (req, res) => {
  await db.prepare("DELETE FROM homepage_features WHERE id=?").run(Number(req.params.id));
  res.status(204).send();
});

// Campus Section
router.get("/campus", requireAuth, async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM campus_section WHERE id=1").get());
});
router.put("/campus", requireAuth, async (req, res) => {
  const { heading, subtext, bullet1, bullet2, bullet3, bullet4 } = req.body;
  const e: any = await db.prepare("SELECT * FROM campus_section WHERE id=1").get();
  const result = await db.prepare("UPDATE campus_section SET heading=?,subtext=?,bullet1=?,bullet2=?,bullet3=?,bullet4=?,updated_at=? WHERE id=1 RETURNING *").get(
    heading??e.heading, subtext??e.subtext,
    bullet1??e.bullet1, bullet2??e.bullet2, bullet3??e.bullet3, bullet4??e.bullet4,
    new Date().toISOString());
  res.json(result);
});

// Student Life
router.get("/student-life", requireAuth, async (_req, res) => {
  const items = await db.prepare("SELECT * FROM student_life_items ORDER BY display_order ASC").all();
  const clubs = await db.prepare("SELECT * FROM student_clubs ORDER BY display_order ASC").all();
  res.json({ items, clubs });
});
router.post("/student-life/items", requireAuth, async (req, res) => {
  const { title, body, imageUrl, displayOrder } = req.body;
  const max = (await db.prepare("SELECT MAX(display_order) as m FROM student_life_items").get() as any)?.m ?? 0;
  const result = await db.prepare("INSERT INTO student_life_items (title,body,image_url,display_order) VALUES (?,?,?,?) RETURNING *").get(title, body, imageUrl??null, displayOrder??max+1);
  res.status(201).json(result);
});
router.put("/student-life/items/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const e: any = await db.prepare("SELECT * FROM student_life_items WHERE id=?").get(id);
  if (!e) { res.status(404).json({ error: "Not found" }); return; }
  const { title, body, imageUrl, displayOrder } = req.body;
  const result = await db.prepare("UPDATE student_life_items SET title=?,body=?,image_url=?,display_order=? WHERE id=? RETURNING *").get(title??e.title, body??e.body, imageUrl!==undefined?imageUrl:e.image_url, displayOrder??e.display_order, id);
  res.json(result);
});
router.delete("/student-life/items/:id", requireAuth, async (req, res) => {
  await db.prepare("DELETE FROM student_life_items WHERE id=?").run(Number(req.params.id));
  res.status(204).send();
});
router.post("/student-life/clubs", requireAuth, async (req, res) => {
  const { name } = req.body;
  const max = (await db.prepare("SELECT MAX(display_order) as m FROM student_clubs").get() as any)?.m ?? 0;
  const result = await db.prepare("INSERT INTO student_clubs (name,display_order) VALUES (?,?) RETURNING *").get(name, max+1);
  res.status(201).json(result);
});
router.delete("/student-life/clubs/:id", requireAuth, async (req, res) => {
  await db.prepare("DELETE FROM student_clubs WHERE id=?").run(Number(req.params.id));
  res.status(204).send();
});

// Portal Links
router.get("/portals", requireAuth, async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM portal_links ORDER BY display_order ASC").all());
});
router.put("/portals/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const e: any = await db.prepare("SELECT * FROM portal_links WHERE id=?").get(id);
  if (!e) { res.status(404).json({ error: "Not found" }); return; }
  const { title, description, tag, url, color } = req.body;
  const result = await db.prepare("UPDATE portal_links SET title=?,description=?,tag=?,url=?,color=? WHERE id=? RETURNING *").get(title??e.title, description??e.description, tag??e.tag, url??e.url, color??e.color, id);
  res.json(result);
});

// Academics Content
router.get("/academics-content", requireAuth, async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM academics_content WHERE id=1").get());
});
router.put("/academics-content", requireAuth, async (req, res) => {
  const { curriculumHeading, curriculumBody, curriculumImage, scienceHeading, scienceBody, scienceImage } = req.body;
  const e: any = await db.prepare("SELECT * FROM academics_content WHERE id=1").get();
  const result = await db.prepare(`UPDATE academics_content SET
    curriculum_heading=?,curriculum_body=?,curriculum_image=?,
    science_heading=?,science_body=?,science_image=?,updated_at=? WHERE id=1 RETURNING *`).get(
    curriculumHeading??e.curriculum_heading, curriculumBody??e.curriculum_body,
    curriculumImage!==undefined?curriculumImage:e.curriculum_image,
    scienceHeading??e.science_heading, scienceBody??e.science_body,
    scienceImage!==undefined?scienceImage:e.science_image,
    new Date().toISOString());
  res.json(result);
});

// Contact Info (with hours)
router.get("/contact", requireAuth, async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM contact_info WHERE id=1").get());
});
router.put("/contact", requireAuth, async (req, res) => {
  const { phone1, phone2, email, address, hours, mapUrl, facebook } = req.body;
  const e: any = await db.prepare("SELECT * FROM contact_info WHERE id=1").get();
  const result = await db.prepare("UPDATE contact_info SET phone1=?,phone2=?,email=?,address=?,hours=?,map_url=?,facebook=?,updated_at=? WHERE id=1 RETURNING *").get(
    phone1??e.phone1, phone2??e.phone2, email??e.email, address??e.address,
    hours??e.hours, mapUrl!==undefined?mapUrl:e.map_url, facebook!==undefined?facebook:e.facebook,
    new Date().toISOString());
  res.json(result);
});

export default router;
