// server.js - نسخة مبسطة بدون cors
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 بدء تشغيل الخادم...');

// إنشاء مجلد uploads
const uploadsDir = path.join(__dirname, 'uploads');
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('✅ تم إنشاء مجلد uploads');
  }
} catch (error) {
  console.error('❌ خطأ في إعداد مجلد uploads:', error.message);
  process.exit(1);
}

// إعداد CORS يدوياً بدلاً من مكتبة cors
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// logging middleware
app.use((req, res, next) => {
  console.log(`📝 ${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// مصفوفة لحفظ معلومات الملفات (يفضل استخدام قاعدة بيانات في الإنتاج)
const uploadedFiles = new Map();

// إعداد multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = crypto.randomBytes(16).toString('hex') + '.pdf';
    console.log('🏷️ اسم الملف الجديد:', uniqueName);
    
    // حفظ معلومات الملف
    uploadedFiles.set(uniqueName, {
      originalName: file.originalname,
      filename: uniqueName,
      uploadDate: new Date().toISOString(),
      mimetype: file.mimetype
    });
    
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500 ميجابايت
  },
  fileFilter: function (req, file, cb) {
    console.log('🔍 فحص نوع الملف:', file.mimetype);
    
    if (file.mimetype === 'application/pdf') {
      console.log('✅ نوع الملف صحيح');
      cb(null, true);
    } else {
      console.log('❌ نوع الملف غير صحيح:', file.mimetype);
      cb(new Error('يُسمح فقط بملفات PDF'));
    }
  }
});

// خدمة الملفات الثابتة
app.use(express.static('public'));

// الصفحة الرئيسية
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API لرفع الملفات
app.post('/api/upload', (req, res) => {
  console.log('\n🔄 بدء معالجة طلب الرفع...');
  
  const uploadMiddleware = upload.single('pdf');
  
  uploadMiddleware(req, res, (err) => {
    if (err) {
      console.error('❌ خطأ في multer:', err.message);
      
      if (err instanceof multer.MulterError) {
        switch (err.code) {
          case 'LIMIT_FILE_SIZE':
            return res.status(413).json({
              success: false,
              error: 'حجم الملف كبير جداً (الحد الأقصى: 500 ميجابايت)'
            });
          case 'LIMIT_UNEXPECTED_FILE':
            return res.status(400).json({
              success: false,
              error: 'حقل الملف غير صحيح'
            });
          default:
            return res.status(400).json({
              success: false,
              error: `خطأ في رفع الملف: ${err.message}`
            });
        }
      }
      
      return res.status(400).json({
        success: false,
        error: err.message
      });
    }
    
    try {
      if (!req.file) {
        console.log('❌ لم يتم استلام أي ملف');
        return res.status(400).json({
          success: false,
          error: 'لم يتم إرسال ملف'
        });
      }
      
      console.log('📥 ملف مستلم:', req.file.originalname);
      console.log('💾 محفوظ كـ:', req.file.filename);
      console.log('📊 الحجم:', (req.file.size / 1024 / 1024).toFixed(2), 'MB');
      
      // التحقق من وجود الملف
      if (!fs.existsSync(req.file.path)) {
        console.error('❌ الملف غير موجود بعد الحفظ');
        return res.status(500).json({
          success: false,
          error: 'فشل في حفظ الملف'
        });
      }
      
      // إنشاء رابط المشاركة (يوجه لصفحة المعاينة)
      const shareUrl = `${req.protocol}://${req.get('host')}/view/${req.file.filename}`;
      console.log('🔗 رابط المشاركة:', shareUrl);
      
      // تحديث معلومات الملف مع الحجم
      const fileInfo = uploadedFiles.get(req.file.filename);
      if (fileInfo) {
        fileInfo.size = req.file.size;
        uploadedFiles.set(req.file.filename, fileInfo);
      }
      
      console.log('✅ تم الرفع بنجاح!\n');
      
      res.json({
        success: true,
        message: 'تم رفع الملف بنجاح',
        shareUrl: shareUrl,
        originalName: req.file.originalname,
        size: req.file.size,
        filename: req.file.filename
      });
      
    } catch (error) {
      console.error('❌ خطأ في معالجة الملف:', error);
      res.status(500).json({
        success: false,
        error: 'حدث خطأ في الخادم'
      });
    }
  });
});

// صفحة معاينة الملف
app.get('/view/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(uploadsDir, filename);
  
  console.log(`👁️ طلب معاينة ملف: ${filename}`);
  
  // التحقق من وجود الملف
  if (!fs.existsSync(filePath)) {
    console.log('❌ الملف غير موجود');
    return res.status(404).send(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>الملف غير موجود</title>
        <style>
          body { font-family: Arial; text-align: center; padding: 50px; }
          h1 { color: #e74c3c; }
        </style>
      </head>
      <body>
        <h1>❌ الملف غير موجود</h1>
        <p>الملف المطلوب غير موجود أو تم حذفه</p>
        <a href="/">العودة للرئيسية</a>
      </body>
      </html>
    `);
  }
  
  // إرسال صفحة المعاينة
  res.sendFile(path.join(__dirname, 'public', 'view.html'));
});

// API لمعلومات الملف
app.get('/api/file-info/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(uploadsDir, filename);
  
  console.log(`📊 طلب معلومات ملف: ${filename}`);
  
  // التحقق من وجود الملف
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      error: 'الملف غير موجود'
    });
  }
  
  try {
    // الحصول على معلومات الملف من النظام
    const stats = fs.statSync(filePath);
    
    // الحصول على المعلومات المحفوظة
    const savedInfo = uploadedFiles.get(filename) || {};
    
    // دمج المعلومات
    const fileInfo = {
      filename: filename,
      originalName: savedInfo.originalName || filename,
      size: stats.size,
      uploadDate: savedInfo.uploadDate || stats.birthtime.toISOString(),
      mimetype: savedInfo.mimetype || 'application/pdf'
    };
    
    console.log('📋 معلومات الملف:', fileInfo);
    
    res.json({
      success: true,
      ...fileInfo
    });
    
  } catch (error) {
    console.error('❌ خطأ في قراءة معلومات الملف:', error);
    res.status(500).json({
      success: false,
      error: 'فشل في قراءة معلومات الملف'
    });
  }
});

// عرض/تحميل الملفات (نفس الكود السابق)
app.get('/files/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(uploadsDir, filename);
  
  console.log(`📖 طلب ملف: ${filename}`);
  
  if (!fs.existsSync(filePath)) {
    console.log('❌ الملف غير موجود');
    return res.status(404).json({
      success: false,
      error: 'الملف غير موجود'
    });
  }
  
  const display = req.query.display || 'inline';
  
  try {
    if (display === 'download') {
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    } else {
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    }
    
    res.setHeader('Content-Type', 'application/pdf');
    res.sendFile(filePath);
    console.log('✅ تم إرسال الملف');
    
  } catch (error) {
    console.error('❌ خطأ في إرسال الملف:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في إرسال الملف'
    });
  }
});

// معالج أخطاء عام
app.use((error, req, res, next) => {
  console.error('💥 خطأ عام:', error.message);
  if (!res.headersSent) {
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في الخادم'
    });
  }
});

// تشغيل الخادم
app.listen(PORT, (err) => {
  if (err) {
    console.error('❌ فشل في تشغيل الخادم:', err);
    process.exit(1);
  }
  
  console.log(`\n🎉 الخادم يعمل على:`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`📁 مجلد الرفع: ${uploadsDir}\n`);
});

// معالجة إغلاق الخادم
process.on('SIGINT', () => {
  console.log('\n🛑 إيقاف الخادم...');
  process.exit(0);
});
