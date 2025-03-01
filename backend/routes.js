const { $resolvePath, $tryCatch } = require("./shortcuts.js");
const { $requireRole } = require("./middleware.js");
const cron = require("node-cron")
const facilitatorRoutes = require('./routes/facilitator');
const instructorRoutes = require('./routes/instructor');
const guardRoutes = require('./routes/guard');
const adminRoutes = require('./routes/admin');

module.exports = (app, $pool) => {
  // Static routes
  app.get("/403", (req, res) => res.sendFile($resolvePath("../frontend/403.html")));
  app.get("/home", (req, res) => res.sendFile($resolvePath("../frontend/home.html")));
  app.get("/demolive", (req, res) => res.sendFile($resolvePath("../frontend/demolive.html")));
  app.get("/settings", (req, res) => res.sendFile($resolvePath("../frontend/settings.html")));
  
  // Protected static routes
  app.get("/instructor", $requireRole(['teacher']), (req, res) => 
    res.sendFile($resolvePath("../frontend/instructor.html")));
  app.get("/facilitator", $requireRole(['facilitator']), (req, res) => 
    res.sendFile($resolvePath("../frontend/facilitator.html")));
  app.get("/guard", $requireRole(['guard']), (req, res) =>
    res.sendFile($resolvePath("../frontend/guard.html")));
  app.get("/admin", $requireRole(['admin']), (req, res) => 
    res.sendFile($resolvePath("../frontend/admin.html")));

  // Fixed Authentication route
  app.post('/signin', async (req, res) => {
    try {
      const {username, password} = req.body;
      const [rows] = await $pool.execute('SELECT * FROM users WHERE username = ?', [username]);
      
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
  app.get('/', (req,res) => {
    if (req.session.user) {
        const redirectPaths = {
            teacher: '/instructor',
            admin: '/admin',
            facilitator: '/facilitator',
            guard: '/guard'
        }
        console.log(req.session.user.role)
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

  // --

  async function prefillAttendance() {
    try {
        console.log(`[Attendify] Starting attendance prefill process at ${new Date().toISOString()}`);
        console.log(`[Attendify] Turning off foreign key checks`);
        await $pool.execute(`SET FOREIGN_KEY_CHECKS = 0`);
  
        // 1. Archive current attendance records into attendance_history
        const archiveQuery = `
            INSERT INTO attendance_history (attendance_id, student_id, class_id, attendance_date, status, time_in, time_out, recorded_by, remark)
            SELECT attendance_id, student_id, class_id, attendance_date, status, time_in, time_out, recorded_by, remark
            FROM attendance
        `;
        await $pool.execute(archiveQuery);
        console.log(`[Attendify] Archived attendance records to history.`);
  
        // 2. Truncate the attendance table
        await $pool.execute(`TRUNCATE TABLE attendance`);
        console.log(`[Attendify] Attendance table truncated.`);
  
        // 3. Prefill attendance for today's classes
        //    Note: The classes table has a 'day' column (enum: 'Mon','Tue','Wed','Thu','Fri').
        //          DATE_FORMAT(CURDATE(), '%a') returns a three-letter abbreviation (e.g., 'Mon') that matches.
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
        await $pool.execute(prefillQuery);
        console.log(`[Attendify] Attendance prefilled for ${new Date().toISOString()}.`);
        console.log(`[Attendify] Turning on foreign key checks`);
        await $pool.execute(`SET FOREIGN_KEY_CHECKS = 1`);
  
    } catch (error) {
        console.error(`[Attendify] Error during attendance prefill process:`, error);
    }
  }
  
  cron.schedule('0 0 * * *', () => {
    console.log(`[Attendify] Cron job triggered at ${new Date().toISOString()}.`);
    prefillAttendance();
  });
  const cronTasks = cron.getTasks();
  
  console.log(`[Attendify] Is cron running and listening?`, cronTasks.size > 0 ? 'Yes' : 'No');
};
