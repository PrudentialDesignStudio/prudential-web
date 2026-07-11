import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

router.get("/gallery/categories", async (req, res) => {
  const type = req.query.type as string | undefined;
  let rows: any[];
  if (type) {
    rows = await db.prepare(
      "SELECT category, COUNT(*) as count FROM gallery_items WHERE type=? AND published=1 AND deleted_at IS NULL GROUP BY category ORDER BY category ASC"
    ).all(type);
  } else {
    rows = await db.prepare(
      "SELECT category, COUNT(*) as count FROM gallery_items WHERE published=1 AND deleted_at IS NULL GROUP BY category ORDER BY category ASC"
    ).all();
  }
  res.json(rows);
});

// All defined categories, including empty ones not yet holding any items.
router.get("/gallery/all-categories", async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM gallery_categories ORDER BY display_order ASC, name ASC").all());
});

router.get("/gallery", async (req, res) => {
  const type = req.query.type as string | undefined;
  const category = req.query.category as string | undefined;
  let data: any[];
  if (type && category) {
    data = await db.prepare("SELECT * FROM gallery_items WHERE type=? AND category=? AND published=1 AND deleted_at IS NULL ORDER BY display_order ASC").all(type, category);
  } else if (type) {
    data = await db.prepare("SELECT * FROM gallery_items WHERE type=? AND published=1 AND deleted_at IS NULL ORDER BY display_order ASC").all(type);
  } else if (category) {
    data = await db.prepare("SELECT * FROM gallery_items WHERE category=? AND published=1 AND deleted_at IS NULL ORDER BY display_order ASC").all(category);
  } else {
    data = await db.prepare("SELECT * FROM gallery_items WHERE published=1 AND deleted_at IS NULL ORDER BY display_order ASC").all();
  }
  res.json(data);
});

router.get("/texts", async (_req, res) => {
  const rows: any[] = await db.prepare("SELECT * FROM site_texts").all();
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  res.json(map);
});

router.get("/announcements", async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM announcements WHERE published=1 AND deleted_at IS NULL ORDER BY created_at DESC").all());
});

router.get("/testimonials", async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM testimonials WHERE published=1 AND deleted_at IS NULL ORDER BY display_order ASC, created_at ASC").all());
});

router.get("/events", async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM events WHERE published=1 AND deleted_at IS NULL ORDER BY event_date ASC").all());
});

router.get("/contact", async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM contact_info WHERE id=1").get());
});

router.get("/hero", async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM hero_content WHERE id=1").get());
});

router.get("/about", async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM about_content WHERE id=1").get());
});

router.get("/values", async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM school_values WHERE deleted_at IS NULL ORDER BY display_order").all());
});

router.get("/goals", async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM school_goals ORDER BY display_order").all());
});

router.get("/divisions", async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM academic_divisions WHERE deleted_at IS NULL ORDER BY display_order").all());
});

router.get("/staff", async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM staff_members WHERE published=1 AND deleted_at IS NULL ORDER BY display_order ASC").all());
});

router.get("/rules", async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM rules_regulations WHERE deleted_at IS NULL ORDER BY display_order ASC").all());
});

router.get("/anthem", async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM anthem_content WHERE id=1").get());
});

router.get("/features", async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM homepage_features ORDER BY display_order ASC").all());
});

router.get("/campus", async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM campus_section WHERE id=1").get());
});

router.get("/student-life", async (_req, res) => {
  const items = await db.prepare("SELECT * FROM student_life_items ORDER BY display_order ASC").all();
  const clubs = await db.prepare("SELECT * FROM student_clubs ORDER BY display_order ASC").all();
  res.json({ items, clubs });
});

router.get("/portals", async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM portal_links ORDER BY display_order ASC").all());
});

router.get("/academics-content", async (_req, res) => {
  res.json(await db.prepare("SELECT * FROM academics_content WHERE id=1").get());
});

router.post("/contact-submit", async (req, res) => {
  const { studentName, studentAge, studentGender, currentClass, desiredClass,
    parentName, phone, email, relationship, prevSchool, performance, subject, message } = req.body;
  if (!message) { res.status(400).json({ error: "Message is required" }); return; }
  await db.prepare(`INSERT INTO contact_submissions
    (student_name,student_age,student_gender,current_class,desired_class,parent_name,phone,email,relationship,prev_school,performance,subject,message)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(studentName??null, studentAge??null, studentGender??null, currentClass??null, desiredClass??null,
    parentName??null, phone??null, email??null, relationship??null, prevSchool??null, performance??null, subject??null, message);
  res.json({ ok: true });
});

export default router;
