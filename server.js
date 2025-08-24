// server.js - خادم Node.js لمشاركة PDF
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// إعداد multer لرفع الملفات
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "uploads/";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueId = crypto.randomUUID();
    cb(null, `${uniqueId}.pdf`);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("يُسمح بملفات PDF فقط!"));
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// قاعدة بيانات بسيطة بالذاكرة
const filesDB = new Map();

// تقديم الملفات الثابتة (index.html + download.html)
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

// API رفع الملفات
app.post("/api/upload", upload.single("pdf"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "لم يتم إرسال ملف" });
    }

    const fileId = path.parse(req.file.filename).name;
    const fileInfo = {
      id: fileId,
      originalName: req.file.originalname,
      filename: req.file.filename,
      size: req.file.size,
      uploadTime: new Date(),
      downloadCount: 0
    };

    filesDB.set(fileId, fileInfo);

    const shareUrl = `${req.protocol}://${req.get("host")}/share/${fileId}`;

    res.json({
      success: true,
      fileId,
      shareUrl,
      downloadUrl: `${req.protocol}://${req.get("host")}/download/${fileId}`
    });
  } catch (error) {
    console.error("خطأ في رفع الملف:", error);
    res.status(500).json({ error: "حدث خطأ في رفع الملف" });
  }
});

// صفحة المشاركة (تحويل إلى download.html)
app.get("/share/:fileId", (req, res) => {
  const fileId = req.params.fileId;
  if (!filesDB.get(fileId)) {
    return res.status(404).send("❌ الملف غير موجود");
  }
  res.sendFile(path.join(__dirname, "public", "download.html"));
});

// API: معلومات الملف
app.get("/api/file/:fileId", (req, res) => {
  const fileId = req.params.fileId;
  const fileInfo = filesDB.get(fileId);

  if (!fileInfo) {
    return res.status(404).json({ error: "الملف غير موجود" });
  }

  res.json({
    id: fileInfo.id,
    name: fileInfo.originalName,
    size: (fileInfo.size / 1024 / 1024).toFixed(2) + " MB",
    uploadTime: fileInfo.uploadTime.toLocaleString("ar"),
    downloadCount: fileInfo.downloadCount
  });
});

// API: تحميل الملف
app.get("/download/:fileId", (req, res) => {
  const fileId = req.params.fileId;
  const fileInfo = filesDB.get(fileId);

  if (!fileInfo) {
    return res.status(404).send("❌ الملف غير موجود");
  }

  const filePath = path.join(__dirname, "uploads", fileInfo.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("❌ الملف مفقود في الخادم");
  }

  fileInfo.downloadCount++;
  filesDB.set(fileId, fileInfo);

  res.download(filePath, fileInfo.originalName);
});

// تشغيل الخادم
app.listen(PORT, () => {
  console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
});
