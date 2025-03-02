const express = require('express');
const path = require('path');
const http = require('http');
const session = require('express-session');
const socketIo = require('socket.io');
const chokidar = require('chokidar');
const fs = require('fs');
const mysql = require('mysql2/promise');
const cron = require('node-cron');

// Database connection
const pool = require('./database.js');

// Middleware
const { sessionMiddleware } = require('./middleware.js');

// Routes
const facilitatorRoutes = require('./routes/facilitator');
const instructorRoutes = require('./routes/instructor');
const guardRoutes = require('./routes/guard');
const adminRoutes = require('./routes/admin');

// Initialize Express app
const app = express();
const port = 3000;

// Create HTTP server
const httpServer = http.createServer(app);

// Setup Socket.io
const io = socketIo(httpServer);
io.on('connection', (socket) => {
  console.log('A user connected');
  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// Middleware setup
app.use(express.static(path.join(__dirname, '../frontend')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// Static routes
app.get('/403', (req, res) => res.sendFile(path.join(__dirname, '../frontend/403.html')));
app.get('/home', (req, res) => res.sendFile(path.join(__dirname, '../frontend/home.html')));
app.get('/demolive', (req, res) => res.sendFile(path.join(__dirname, '../frontend/demolive.html')));
app.get('/settings', (req, res) => res.sendFile(path.join(__dirname, '../frontend/settings.html')));

// Protected static routes
const $requireRole = (roles) => (req, res, next) => {
  if (req.session.user && roles.includes(req.session.user.role)) {
    next();
  } else {
    res.redirect('/403');
  }
};

app.get('/instructor', $requireRole(['teacher']), (req, res) => res.sendFile(path.join(__dirname, '../frontend/instructor.html')));
app.get('/facilitator', $requireRole(['facilitator']), (req, res) => res.sendFile(path.join(__dirname, '../frontend/facilitator.html')));
app.get('/guard', $requireRole(['guard']), (req, res) => res.sendFile(path.join(__dirname, '../frontend/guard.html')));
app.get('/admin', $requireRole(['admin']), (req, res) => res.sendFile(path.join(__dirname, '../frontend/admin.html')));

// Authentication routes
app.post('/signin', async (req, res) => {
  try {
    const { username, password } = req.body;
    const [rows] = await pool.execute('SELECT * FROM users WHERE username = ?', [username]);

    if (rows[0] && rows[0].password === password) {
      req.session.user = rows[0];
      await new Promise((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          resolve();
        });
      });

      const redirectPaths = {
        teacher: '/instructor',
        admin: '/admin',
        facilitator: '/facilitator',
        guard: '/guard'
      };

      console.log('[Attendify] logged in as', req.session.user.username);
      res.redirect(redirectPaths[req.session.user.role]);
    } else {
      res.status(401).send(`Invalid credentials <a href='/home'>Go back.</a>`);
    }
  } catch (error) {
    console.error('[Attendify] Login error:', error);
    res.status(500).send('Internal server error');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// Root route with role-based redirect
app.get('/', (req, res) => {
  if (req.session.user) {
    const redirectPaths = {
      teacher: '/instructor',
      admin: '/admin',
      facilitator: '/facilitator',
      guard: '/guard'
    };
    console.log(req.session.user.role);
    res.redirect(redirectPaths[req.session.user.role]);
  } else {
    console.log("[Debug] No user session, redirecting to /home");
    res.redirect('/home');
  }
});

// API routes
app.use('/facilitator', $requireRole(['facilitator']), facilitatorRoutes);
app.use('/instructor', $requireRole(['teacher']), instructorRoutes);
app.use('/guard', $requireRole(['guard']), guardRoutes);
app.use('/admin', $requireRole(['admin']), adminRoutes);

// Watch data.json for changes
const dataPath = path.join(__dirname, '../data/data.json');
chokidar.watch(dataPath).on('change', () => {
  fs.readFile(dataPath, 'utf8', (err, data) => {
    if (err) {
      console.error('[Attendify] Error reading data file:', err);
      return;
    }
    const jsonData = JSON.parse(data);
    io.emit('fileChanged', jsonData);
  });
});

// prefilling, with cron
async function prefillAttendance() {
  try {
      console.log(`[Attendify] Starting attendance prefill process at ${new Date().toISOString()}`);

      // 1. Archive current attendance records into attendance_history
      const archiveQuery = `
          INSERT INTO attendance_history (attendance_id, student_id, class_id, attendance_date, status, time_in, time_out, recorded_by, remark)
          SELECT attendance_id, student_id, class_id, attendance_date, status, time_in, time_out, recorded_by, remark
          FROM attendance
      `;
      await pool.execute(archiveQuery);
      console.log(`[Attendify] Archived attendance records to history.`);

      // 2. Truncate the attendance table
      await pool.execute(`TRUNCATE TABLE attendance`);
      console.log(`[Attendify] Attendance table truncated.`);

      // 3. Prefill attendance for today's classes
      const prefillQuery = `
          INSERT INTO attendance (student_id, class_id, attendance_date, status, recorded_by)
          SELECT sc.student_id, cm.class_id, CURDATE(), 'absent', 'system'
          FROM student_classes sc
          JOIN classes cm ON sc.class_id = cm.class_id
          WHERE cm.day = DATE_FORMAT(CURDATE(), '%a')
            AND sc.enrollment_type IN ('preset', 'manual')
            AND NOT EXISTS (
                SELECT 1 FROM attendance a
                WHERE a.student_id = sc.student_id 
                  AND a.class_id = cm.class_id 
                  AND a.attendance_date = CURDATE()
            )
      `;
      await pool.execute(prefillQuery);
      console.log(`[Attendify] Attendance prefilled for ${new Date().toISOString()}.`);

  } catch (error) {
      console.error(`[Attendify] Error during attendance prefill process:`, error);
  }
}




// Start server
httpServer.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

cron.schedule('0 0 * * *', prefillAttendance); // Run daily at midnight