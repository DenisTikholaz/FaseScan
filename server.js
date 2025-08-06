require('dotenv').config();
const express = require('express');
require('./passportAuth');
const bodyParser = require('body-parser');
const { OAuth2Client } = require('google-auth-library');
const pool = require('./db');
const { createUserTable } = require('./createUserTable');
const { handleStatusChange } = require('./userTableManager');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { updateMonthlyTotals } = require('./updateMonthlyTotals');


const { execFile } = require('child_process');

const app = express();



app.use(bodyParser.json());
app.use('/uploads', express.static('uploads')); 

const WEB_CLIENT_ID = process.env.GOOGLE_WEB_CLIENT_ID;
const client = new OAuth2Client(WEB_CLIENT_ID);

// ⚙️ Налаштування multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/avatars');
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${Date.now()}_${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({ storage });

const userPhotoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/user_photos');
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `photo_${Date.now()}_${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, filename);
  }
});

const uploadUserPhoto = multer({ storage: userPhotoStorage });


app.post('/admin/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM admins WHERE email = $1', [email]);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }

    const admin = result.rows[0];

    if (password === admin.password) { 
      res.status(200).json({ success: true, admin });
    } else {
      res.status(403).json({ success: false, error: 'Invalid password' });
    }
  } catch (error) {
    console.error('❌ Admin login error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});



// ✅ Авторизація Google
app.post('/auth/google/mobile', async (req, res) => {
  const { token } = req.body;

  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: WEB_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    if (!email.endsWith('@gmail.com')) {
      return res.status(403).json({ error: 'Only Gmail accounts are allowed.' });
    }

    
    const userCheck = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
    let user;

    if (userCheck.rowCount === 0) {
      const insertUser = await pool.query(
        `INSERT INTO users (google_id, email, name, avatar_url) VALUES ($1, $2, $3, $4) RETURNING *`,
        [googleId, email, name, picture]
      );
      user = insertUser.rows[0];
      await createUserTable(email);
    }
    else {
      user = userCheck.rows[0];
    }

    res.status(200).json({ success: true, user });
  } catch (error) {
    console.error('❌ Auth error:', error);
    res.status(401).json({ error: 'Invalid token or authentication failed.' });
  }
});

// 📤 Завантаження аватара
app.post('/user/:googleId/avatar', upload.single('avatar'), async (req, res) => {
  const { googleId } = req.params;
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const avatarPath = `${req.protocol}://${req.get('host')}/uploads/avatars/${req.file.filename}`;

  try {
    const update = await pool.query(
      'UPDATE users SET avatar_url = $1 WHERE google_id = $2 RETURNING *',
      [avatarPath, googleId]
    );

    res.json({ success: true, user: update.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users');
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Database error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});


// 🔍 Отримання профілю
app.get('/user/:googleId', async (req, res) => {
  try {
    const { googleId } = req.params;
    console.log(`🔍 Запит отримання користувача з ID: ${googleId}`);

    const result = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
    console.log(`📊 Результат запиту:`, result.rows);

    if (result.rowCount === 0) {
      console.warn(`❌ Користувач з ID ${googleId} не знайдений.`);
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Database error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

function tableNameFromEmail(email) {
  return 'user_' + email.replace(/[@.]/g, '_');
}

app.get('/user/:googleId/report', async (req, res) => {
  const { googleId } = req.params;

  try {
    const userResult = await pool.query('SELECT email FROM users WHERE google_id = $1', [googleId]);

    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const email = userResult.rows[0].email;
    const tableName = tableNameFromEmail(email);

    const reportResult = await pool.query(`
      SELECT login_time AS date, expected_salary AS salary, work_minutes AS hours, formatted_work_time
      FROM ${tableName}
      WHERE date_trunc('month', login_time) = date_trunc('month', CURRENT_DATE)
      ORDER BY login_time DESC
    `);

    res.json({ report: reportResult.rows });
  } catch (err) {
    console.error('❌ Report fetch error:', err);
    res.status(500).json({ error: 'Error fetching user report' });
  }
});
//endpoint для оновлення статусу
app.post('/user/:googleId/status', async (req, res) => {
  const { googleId } = req.params;
  const { status } = req.body;

  try {
    const result = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const user = result.rows[0];
    await pool.query(
      'UPDATE users SET status = $1 WHERE google_id = $2',
      [status, googleId]
    );

    await handleStatusChange(user.email, user.name, user.google_id, status);
await updateMonthlyTotals();


    res.json({ success: true, user: { ...user, status } });
  } catch (err) {
    console.error('❌ Status update error:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// 📷 Завантаження фото користувача
app.post('/user/:googleId/photos', uploadUserPhoto.single('photo'), async (req, res) => {
  const { googleId } = req.params;

  if (!req.file) {
    return res.status(400).json({ error: 'Файл не надіслано' });
  }

  const photoUrl = `${req.protocol}://${req.get('host')}/uploads/user_photos/${req.file.filename}`;
  const photoPath = path.join(__dirname, req.file.path);

  try {
    await pool.query(
      'UPDATE users SET photos = COALESCE(photos, \'[]\'::jsonb) || $1::jsonb WHERE google_id = $2',
      [JSON.stringify([photoUrl]), googleId]
    );

    const { spawn } = require('child_process');
    const python = spawn('python', ['encode_face.py', photoPath, googleId]);

    let resultData = '';
    python.stdout.on('data', (data) => {
      resultData += data.toString();
    });

    python.stderr.on('data', (data) => {
      console.error(`Python error: ${data}`);
    });

    python.on('close', (code) => {
      console.log(`Python script exited with code ${code}`);
      if (resultData.includes('Success')) {
        res.json({ success: true, photoUrl, encoding: 'Created' });
      } else {
        res.json({ success: true, photoUrl, encoding: 'Failed: ' + resultData });
      }
    });

  } catch (err) {
    console.error('❌ Помилка при збереженні фото:', err);
    res.status(500).json({ error: 'Database error' });
  }
});


// 🎯 Ідентифікація користувача за фото
app.post('/user/identify-photo', uploadUserPhoto.single('photo'), async (req, res) => {
  console.log('🚀 /identify-photo endpoint called');
  const file = req.file;

  if (!file) {
    return res.status(400).json({ success: false, message: 'Файл не надіслано' });
  }

  const photoPath = path.join(__dirname, file.path);
  const { spawn } = require('child_process');
  const python = spawn('python', ['identify_face.py', photoPath]);

  let resultData = '';
  python.stdout.on('data', (data) => {
    console.log(`📤 Вихід Python: ${data}`);
    resultData += data.toString();
  });

  python.stderr.on('data', (data) => {
    console.error(`Python error: ${data}`);
  });

  python.on('close', async (code) => {
    const match = resultData.match(/Identified as:\s*(\d+)/);
    const result = match ? match[1] : 'Unknown';

    console.log('✅ Ідентифіковано як:', result);
    console.log(`Python завершився з кодом ${code}. Результат: ${result}`);

    if (result === 'Unknown' || result === 'No face found') {
      return res.json({ success: false, message: 'Користувача не знайдено' });
    }

    try {
      
      const userResult = await pool.query('SELECT * FROM users WHERE google_id = $1', [result.toString()]);
      if (userResult.rowCount === 0) {
        return res.json({ success: false, message: 'Користувача з таким ID не знайдено в базі' });
      }

      const user = userResult.rows[0];
      const newStatus = user.status === 'active' ? 'offline' : 'active';

      await pool.query(
        'UPDATE users SET status = $1 WHERE google_id = $2',
        [newStatus, user.google_id]
      );

      await handleStatusChange(user.email, user.name, user.google_id, newStatus);
      await updateMonthlyTotals();

      
      const updatedUser = { ...user, status: newStatus };

      
      return res.json({
        success: true,
        message: `Статус змінено на ${newStatus}`,
        identifiedUser: updatedUser
      });

      
    } catch (err) {
      console.error('❌ DB Error:', err);
      return res.status(500).json({ success: false, message: 'Помилка сервера' });
    }
  });
});

// 🗑 Видалення фото користувача
app.delete('/user/:googleId/photos', async (req, res) => {
  const { googleId } = req.params;
  const photoUrl = req.query.url;


  if (!photoUrl) {
    return res.status(400).json({ error: "Missing 'url' in request body" });
  }

  try {
    const result = await pool.query(
      `UPDATE users
       SET photos = (
         SELECT jsonb_agg(photo)
         FROM (
           SELECT photo
           FROM jsonb_array_elements_text(photos) AS photo
           WHERE photo != $1
         ) AS filtered
       )
       WHERE google_id = $2 RETURNING *`,
      [photoUrl, googleId]
    );

    const filename = path.basename(photoUrl);
    const filepath = path.join(__dirname, 'uploads', 'user_photos', filename);

    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      console.log(`✅ Фото видалено: ${filepath}`);
    } else {
      console.warn(`⚠️ Файл не знайдено для видалення: ${filepath}`);
    }

    res.json({ success: true, updatedUser: result.rows[0] });
  } catch (err) {
    console.error('❌ Помилка при видаленні фото:', err);
    res.status(500).json({ error: 'Database error' });
  }
});



// 📥 Отримання фото користувача
app.get('/user/:googleId/photos', async (req, res) => {
  const { googleId } = req.params;

  try {
    const result = await pool.query(
      'SELECT photos FROM users WHERE google_id = $1',
      [googleId]
    );

    const photos = result.rows[0]?.photos || [];
    res.json({ photos });
  } catch (err) {
    console.error('❌ Помилка при отриманні фото:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
  });


//ipconfig
//node server.js
