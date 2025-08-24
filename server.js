// server.js - خادم محسّن مع تشخيص شامل
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 بدء تشغيل الخادم...');

// إنشاء مجلد uploads مع التحقق من الصلاحيات
const uploadsDir = path.join(__dirname, 'uploads');
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('✅ تم إنشاء مجلد uploads');
  } else {
    console.log('✅ مجلد uploads موجود مسبقاً');
  }
  
  // التحقق من صلاحيات الكتابة
  fs.accessSync(uploadsDir, fs.constants.W_OK);
  console.log('✅ صلاحيات الكتابة متاحة');
  
} catch (error) {
  console.error('❌ خطأ في إعداد مجلد uploads:', error.message);
  process.exit(1);
}

// إعداد CORS مع options مفصلة
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// إضافة middleware للـ logging
app.use((req, res, next) => {
  console.log(`📝 ${new Date().toISOString()} - ${req.method} ${req.url}`);
  console.log('📦 Headers:', req.headers);
  next();
});

// إعداد multer مع error handling شامل
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    console.log('📁 تحديد مجلد الوجهة:', uploadsDir);
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    try {
      const uniqueName = crypto.randomBytes(16).toString('hex') + '.pdf';
      console.log('🏷️ اسم الملف الجديد:', uniqueName);
      cb(null, uniqueName);
    } catch (error) {
      console.error('❌ خطأ في إنشاء اسم الملف:', error);
      cb(error);
    }
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500 ميجابايت
    fieldSize: 10 * 1024 * 1024   // 10 ميجابايت للحقول
  },
  fileFilter: function (req, file, cb) {
    console.log('🔍 فحص نوع الملف:', file.mimetype);
    console.log('📄 اسم الملف الأصلي:', file.originalname);
    
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
console.log('📂 يخدم الملفات من مجلد: public');

// Route للصفحة الرئيسية
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API لرفع الملفات مع error handling شامل
app.post('/api/upload', (req, res) => {
  console.log('\n🔄 بدء معالجة طلب الرفع...');
  console.log('📊 معلومات الطلب:');
  console.log('  - Content-Type:', req.get('Content-Type'));
  console.log('  - Content-Length:', req.get('Content-Length'));
  
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
              error: 'حقل الملف غير صحيح. استخدم "pdf" كاسم الحقل'
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
      console.log('📥 معلومات الملف المستلم:');
      
      if (!req.file) {
        console.log('❌ لم يتم استلام أي ملف');
        return res.status(400).json({
          success: false,
          error: 'لم يتم إرسال ملف'
        });
      }
      
      console.log('  - الاسم الأصلي:', req.file.originalname);
      console.log('  - الاسم الجديد:', req.file.filename);
      console.log('  - الحجم:', (req.file.size / 1024 / 1024).toFixed(2), 'MB');
      console.log('  - النوع:', req.file.mimetype);
      console.log('  - المسار:', req.file.path);
      
      // التحقق من وجود الملف فعلياً
      if (!fs.existsSync(req.file.path)) {
        console.error('❌ الملف غير موجود في المسار المحدد');
        return res.status(500).json({
          success: false,
          error: 'فشل في حفظ الملف'
        });
      }
      
      // إنشاء رابط المشاركة
      const shareUrl = `${req.protocol}://${req.get('host')}/files/${req.file.filename}`;
      
      console.log('🔗 رابط المشاركة:', shareUrl);
      console.log('✅ تم رفع الملف بنجاح!\n');
      
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
      console.error('Stack trace:', error.stack);
      
      res.status(500).json({
        success: false,
        error: 'حدث خطأ في الخادم أثناء معالجة الملف'
      });
    }
  });
});

// API لعرض/تحميل الملفات
app.get('/files/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(uploadsDir, filename);
  
  console.log(`📖 طلب ملف: ${filename}`);
  console.log(`📍 المسار الكامل: ${filePath}`);
  
  if (!fs.existsSync(filePath)) {
    console.log('❌ الملف غير موجود');
    return res.status(404).json({
      success: false,
      error: 'الملف غير موجود'
    });
  }
  
  const display = req.query.display || 'inline';
  console.log(`👁️ نوع العرض: ${display}`);
  
  try {
    if (display === 'download') {
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    } else {
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    }
    
    res.setHeader('Content-Type', 'application/pdf');
    
    // إرسال الملف
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error('❌ خطأ في إرسال الملف:', err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: 'فشل في إرسال الملف'
          });
        }
      } else {
        console.log('✅ تم إرسال الملف بنجاح');
      }
    });
    
  } catch (error) {
    console.error('❌ خطأ في إعداد إرسال الملف:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في الخادم'
    });
  }
});

// معالج أخطاء عام
app.use((error, req, res, next) => {
  console.error('💥 خطأ عام في التطبيق:', error);
  console.error('Stack trace:', error.stack);
  
  if (!res.headersSent) {
    res.status(500).json({
      success: false,
      error: 'حدث خطأ داخلي في الخادم'
    });
  }
});

// معالج 404
app.use((req, res) => {
  console.log(`❓ صفحة غير موجودة: ${req.url}`);
  res.status(404).json({
    success: false,
    error: 'الصفحة المطلوبة غير موجودة'
  });
});

// بدء تشغيل الخادم
app.listen(PORT, (err) => {
  if (err) {
    console.error('❌ فشل في تشغيل الخادم:', err);
    process.exit(1);
  }
  
  console.log(`\n🎉 الخادم يعمل على:`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`📁 مجلد الرفع: ${uploadsDir}`);
  console.log(`⏰ ${new Date().toLocaleString()}\n`);
});

// معالجة إغلاق الخادم
process.on('SIGINT', () => {
  console.log('\n🛑 إيقاف الخادم...');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('💥 خطأ غير متوقع:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 رفض غير معالج:', reason);
  process.exit(1);
});
