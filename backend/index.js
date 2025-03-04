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
const io = socketIo(httpServer);

// Setup Socket.io
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
      setupChokidar(req);
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

// new function

// Watch data.json for changes
const dataPath = path.join(__dirname, '../data/data.json');

// Function to read data from data.json
// extensive checking
function readData() {
  try {
    if (!fs.existsSync(dataPath)) {
      console.error("[Attendify] data.json does not exist!");
      return {};
    }

    const rawData = fs.readFileSync(dataPath, 'utf8').trim(); // Trim extra spaces
    console.log("[DEBUG] Raw data from data.json:", rawData);

    if (!rawData) {
      console.error("[Attendify] data.json is empty!");
      return {};
    }

    const jsonData = JSON.parse(rawData);

    if (typeof jsonData !== 'object' || Array.isArray(jsonData) || Object.keys(jsonData).length === 0) {
      console.error("[Attendify] Invalid JSON format!");
      return {};
    }

    return jsonData;
  } catch (error) {
    console.error("[Attendify] Error reading data.json:", error);
    return {};
  }
}



// Function to write data to data.json
function writeData(data) {
  try {
      fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
      return true;
  } catch (error) {
      console.error("Error writing to data.json:", error);
      return false;
  }
}

app.post('/api/updateData', (req, res) => {
  if (!req.session.user || !req.session.user.username) {
      return res.status(401).json({ message: 'Unauthorized' });
  }

  const username = req.session.user.username;
  const update = req.body; // Data to update

  const currentData = readData();
  const newData = { ...currentData, ...update };

  if (writeData(newData)) {
      console.log(`[Attendify] data.json updated by ${username}:`, newData);
      io.emit('dataUpdated', { data: newData, user: username });
      res.status(200).json({ message: 'Data updated successfully' });
  } else {
      res.status(500).json({ message: 'Failed to update data' });
  }
});

// chokidar.watch(dataPath).on('change', () => {
//   const updatedData = readData();
//   // io.emit('fileChanged', updatedData);
//   console.log(`[Attendify] data.json changed! ${JSON.stringify(updatedData)}`);
//   console.log({ data: updatedData, user: 'external' }); 
//   io.emit('fileChanged', { data: updatedData, user: 'external' });
// });

// Function to process attendance updates from data.json changes (using RFID as keys)
// async function processAttendanceData(updatedData, ME) {
//   const moment = require('moment-timezone');
//   const timezone = 'Asia/Manila';
//   const now = moment().tz(timezone);
//   const today = now.format('YYYY-MM-DD');
//   const timeString = now.format('HH:mm:ss');
//   const dayName = now.format('ddd'); // e.g., "Mon", "Tue", etc.

//   // Get the ongoing class for the current instructor (ME)
//   const [ongoing_class] = await pool.execute(
//     `SELECT class_id FROM classes 
//      WHERE teacher_username = ? 
//        AND day = ? 
//        AND ? BETWEEN start_time AND end_time 
//      LIMIT 1`,
//     [ME, dayName, timeString]
//   );

//   if (ongoing_class.length === 0) {
//     console.error(`[Attendify] No ongoing class found for instructor ${ME}`);
//     return;
//   }
//   const classId = ongoing_class[0].class_id;
//   console.log(`[Attendify] Found ongoing class ${classId} for instructor ${ME}`);

//   // Use updatedData directly if it's keyed by RFID
//   const attendanceRecords = updatedData.data ? updatedData.data : updatedData;
//   if (Object.keys(attendanceRecords).length === 0) {
//     console.error('[Attendify] No attendance data found in the updated file.');
//     return;
//   }
  
//   // Process each record using RFID as key
//   for (const rfid in attendanceRecords) {
//     const studentData = attendanceRecords[rfid];
//     if (!studentData || !studentData.status || !studentData.timeIn) {
//       console.warn(`[Attendify] Incomplete data for RFID ${rfid}`);
//       continue;
//     }
    
//     // Map RFID to student_id using your students table
//     const [studentRows] = await pool.execute(
//       `SELECT student_id FROM students WHERE rfid = ? LIMIT 1`,
//       [rfid]
//     );
//     if (studentRows.length === 0) {
//       console.warn(`[Attendify] No student found with RFID ${rfid}`);
//       continue;
//     }
//     const studentId = studentRows[0].student_id;
    
//     if (studentData.status.toLowerCase() === 'in') {
//       // Update the attendance record with time_in and mark as present
//       const checkInQuery = `
//         UPDATE attendance 
//         SET time_in = ?, status = 'present', updated_at = NOW()
//         WHERE student_id = ? AND class_id = ? AND attendance_date = ?
//       `;
//       const [result] = await pool.execute(checkInQuery, [studentData.timeIn, studentId, classId, today]);
//       console.log(`[Attendify] Processed check-in for student ${studentId} (RFID: ${rfid})`);
      
//     } else if (studentData.status.toLowerCase() === 'out') {
//       // For check-out, expect a timeOut field in the JSON data
//       const timeOut = studentData.timeOut;
//       if (!timeOut) {
//         console.warn(`[Attendify] Missing timeOut for student with RFID ${rfid} marked as Out`);
//         continue;
//       }

//       console.log(`[Attendify] Checking out: RFID ${rfid}, student ${studentId}, timeOut: ${timeOut}`);

//       const checkOutQuery = `
//         UPDATE attendance 
//         SET time_out = ?, updated_at = NOW()
//         WHERE student_id = ? AND class_id = ? AND attendance_date = ? AND time_out IS NULL
//       `;
//       const [result] = await pool.execute(checkOutQuery, [timeOut, studentId, classId, today]);
//       console.log(`[Attendify] Processed check-out for student ${studentId} (RFID: ${rfid})`);
      
//     } else {
//       console.warn(`[Attendify] Unknown status "${studentData.status}" for RFID ${rfid}`);
//     }
//   }
// }
function isValidAttendanceEntry(entry) {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    typeof entry.timeIn === 'string' &&
    typeof entry.status === 'string' &&
    (entry.status.toLowerCase() !== 'out' || typeof entry.timeOut === 'string') // timeOut required if status is 'Out'
  );
}


async function processAttendanceData(updatedData, ME) {
  const moment = require('moment-timezone');
  const timezone = 'Asia/Manila';
  const now = moment().tz(timezone);
  const today = now.format('YYYY-MM-DD');
  const timeString = now.format('HH:mm:ss');
  const dayName = now.format('ddd');

  console.log("[Attendify] Raw updatedData received:", JSON.stringify(updatedData, null, 2));
  console.log("[Attendify] Updated data.json content:", JSON.stringify(updatedData, null, 2));
  console.log("[Attendify] Instructor username:", ME);


  // Find ongoing class
  const [ongoing_class] = await pool.execute(
    `SELECT class_id FROM classes 
     WHERE teacher_username = ? 
       AND day = ? 
       AND STR_TO_DATE(?, '%H:%i:%s') BETWEEN start_time AND end_time 
     LIMIT 1`,
    [ME, dayName, timeString]
  );

  if (ongoing_class.length === 0) {
    console.error(`[Attendify] No ongoing class found for instructor ${ME}`);
    return;
  }
  const classId = ongoing_class[0].class_id;
  console.log(`[Attendify] Found ongoing class ${classId} for instructor ${ME}`);

  if (!updatedData || Object.keys(updatedData).length === 0) {
    console.error("[Attendify] No attendance data found in the updated file.");
    return;
  }

  for (const rfid in updatedData) {
    const studentData = updatedData[rfid];
  
    // 🔍 Validate the format before processing
    if (!isValidAttendanceEntry(studentData)) {
      console.error(`[Attendify] Invalid data format for key: ${rfid}`, studentData);
      continue; // ⏭️ Skip invalid entries
    }
  
    // Proceed with normal attendance processing
    const [studentRows] = await pool.execute(
      `SELECT student_id FROM students WHERE rfid = ? LIMIT 1`,
      [rfid]
    );
  
    if (studentRows.length === 0) {
      console.warn(`[Attendify] No student found with RFID ${rfid}`);
      continue;
    }
  
    const studentId = studentRows[0].student_id;
  
    if (studentData.status.toLowerCase() === 'in') {
      const checkInQuery = `
        UPDATE attendance 
        SET time_in = ?, status = 'present', updated_at = NOW()
        WHERE student_id = ? AND class_id = ? AND attendance_date = ?
      `;
      await pool.execute(checkInQuery, [studentData.timeIn, studentId, classId, today]);
      console.log(`[Attendify] Processed check-in for student ${studentId} (RFID: ${rfid})`);
  
    } else if (studentData.status.toLowerCase() === 'out') {
      const timeOut = studentData.timeOut;
      if (!timeOut) {
        console.warn(`[Attendify] Missing timeOut for student with RFID ${rfid} marked as Out`);
        continue;
      }
  
      console.log(`[Attendify] Checking out: RFID ${rfid}, student ${studentId}, timeOut: ${timeOut}`);
  
      const checkOutQuery = `
        UPDATE attendance 
        SET time_out = ?, updated_at = NOW()
        WHERE student_id = ? AND class_id = ? AND attendance_date = ? AND time_out IS NULL
      `;
      await pool.execute(checkOutQuery, [timeOut, studentId, classId, today]);
      console.log(`[Attendify] Processed check-out for student ${studentId} (RFID: ${rfid})`);
    } else {
      console.warn(`[Attendify] Unknown status "${studentData.status}" for RFID ${rfid}`);
    }
  }
  
}


// Update setupChokidar to call processAttendanceData when data.json changes
// function setupChokidar(req) {
//   const ME = req.session?.user?.username || 'external';
//   console.log("working? setupChokidar");

//   chokidar.watch(dataPath).on('change', async () => {
//     const updatedData = readData();
//     console.log(`[Attendify] data.json changed! ${JSON.stringify(updatedData)}`);
//     console.log("data:", updatedData);
//     console.log("user:", ME);
    
//     try {
//       await processAttendanceData(updatedData, ME);
//     } catch (err) {
//       console.error('[Attendify] Error processing attendance data:', err);
//     }
    
//     io.emit('fileChanged', { data: updatedData, user: ME });
//   });
// }

function isValidTimestamp(timestamp) {
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timestamp.trim()); // Trim spaces
}


function isValidDataStructure(data) {
  if (typeof data !== 'object' || Array.isArray(data)) return false;

  for (const [key, value] of Object.entries(data)) {
    if (typeof key !== 'string' || !/^[A-F0-9]{2} [A-F0-9]{2} [A-F0-9]{2} [A-F0-9]{2}$/.test(key)) {
      console.error(`[Attendify] Invalid key format: ${key}`);
      return false;
    }

    if (
      typeof value !== 'object' ||
      !value.timeIn ||
      !isValidTimestamp(value.timeIn) ||
      !["In", "Out"].includes(value.status) ||  // ✅ Allow both "In" and "Out"
      (value.timeOut && !isValidTimestamp(value.timeOut))
    ) {
      console.error(`[Attendify] Invalid data format for key: ${key}`, value);
      return false;
    }
    
  }
  return true;
}

// function setupChokidar(req) {
//   const ME = req.session?.user?.username || 'external';
//   console.log("working? setupChokidar");

//   if (!fs.existsSync(dataPath)) {
//     console.error(`[Attendify] Error: data.json not found at ${dataPath}`);
//     return;
//   }

//   try {
//     const initialData = readData();
//     if (!isValidDataStructure(initialData)) {
//       throw new Error("Invalid data.json format");
//     }
//   } catch (error) {
//     console.error(`[Attendify] Error reading/parsing data.json:`, error);
//     return;
//   }

//   chokidar.watch(dataPath).on('change', async () => {
//   const updatedData = readData();

//   if (!updatedData || Object.keys(updatedData).length === 0) {
//     console.error(`[Attendify] Skipping processing: data.json is empty.`);
//     return;
//   }

//   if (!isValidDataStructure(updatedData)) {
//     console.error(`[Attendify] Invalid format detected in updated data.json`);
//     return;
//   }

//   });
// }




// prefilling, with cron
function setupChokidar(req) {
  const ME = req.session?.user?.username || 'external';
  console.log("working? setupChokidar");

  if (!fs.existsSync(dataPath)) {
    console.error(`[Attendify] Error: data.json not found at ${dataPath}`);
    return;
  }

  chokidar.watch(dataPath).on('change', async () => {
    console.log("[Attendify] Detected change in data.json, processing...");

    const updatedData = readData();

    if (!updatedData || Object.keys(updatedData).length === 0) {
      console.warn(`[Attendify] Skipping processing: data.json is empty.`);
      io.emit('fileChanged', { data: {}, user: ME }); // 🔥 Ensure UI updates even if data is empty
      return;
    }

    if (!isValidDataStructure(updatedData)) {
      console.error(`[Attendify] Invalid format detected in updated data.json`);
      io.emit('fileChanged', { data: {}, user: ME }); // 🔥 Ensure UI gets an empty update
      return;
    }

    console.log(`[Attendify] data.json changed! ${JSON.stringify(updatedData)}`);
    console.log("data:", updatedData);
    console.log("user:", ME);

    try {
      await processAttendanceData(updatedData, ME);
    } catch (err) {
      console.error('[Attendify] Error processing attendance data:', err);
    }

    io.emit('fileChanged', { data: updatedData, user: ME }); // 🔥 Ensure UI updates!
  });
}


async function prefillAttendance() {
  try {
      console.log(`[Attendify] Starting attendance prefill process at ${new Date().toISOString()}`);

      // 1. Archive current attendance records into attendance_history
      const archiveQuery = `
          INSERT INTO attendance_history (
              attendance_id, student_id, class_id, attendance_date, status,
              time_in, time_out, recorded_by, remark, archived_at
          )
          SELECT 
              attendance_id, student_id, class_id, attendance_date, status,
              time_in, time_out, recorded_by, remark, NOW()
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



prefillAttendance()

// Start server
httpServer.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

cron.schedule('0 0 * * *', prefillAttendance); // Run daily at midnight

// Endpoint to record student attendance (Time In / Time Out)
app.post('/api/attendance', async (req, res) => {
  const { studentId, status, timestamp } = req.body;
  
  if (!studentId || !status || !timestamp) {
    return res.status(400).json({ message: 'Missing required fields: studentId, status, and timestamp' });
  }

  try {
    // Use the ME variable (current instructor username from the session) as in your socket setup
    const ME = req.session?.user?.username || 'external';

    // Get current time details using moment-timezone (same as your instructor/ongoing endpoint)
    const moment = require('moment-timezone');
    const timezone = 'Asia/Manila';
    const now = moment().tz(timezone);
    const timeString = now.format('HH:mm:ss');
    const dayName = now.format('ddd'); // Short day name e.g. "Mon", "Tue"
    const today = now.format('YYYY-MM-DD');

    // Get the ongoing class for the instructor (using ME)
    const [ongoing_class] = await pool.execute(
      `SELECT 
          cm.class_id
       FROM classes cm
       WHERE cm.teacher_username = ? 
         AND cm.day = ? 
         AND ? BETWEEN cm.start_time AND cm.end_time
       LIMIT 1`,
      [ME, dayName, timeString]
    );

    if (ongoing_class.length === 0) {
      return res.status(404).json({ message: `No ongoing class found for instructor ${ME}` });
    }

    const classId = ongoing_class[0].class_id;

    if (status.toLowerCase() === 'in') {
      // Record "Time In": Update the existing attendance record with the time_in value
      const checkInQuery = `
        UPDATE attendance 
        SET time_in = ?, status = 'present', updated_at = NOW()
        WHERE student_id = ? AND class_id = ? AND attendance_date = ?
      `;
      const [result] = await pool.execute(checkInQuery, [timestamp, studentId, classId, today]);
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Attendance record not found for check-in' });
      }
      
      console.log(`[Attendify] Time in recorded for student ${studentId} in class ${classId} at ${timestamp}`);
      return res.status(200).json({ message: 'Time in recorded successfully' });
      
    } else if (status.toLowerCase() === 'out') {
      // Record "Time Out": Update the attendance record with the time_out value if not already set
      const checkOutQuery = `
        UPDATE attendance 
        SET time_out = ?, updated_at = NOW()
        WHERE student_id = ? AND class_id = ? AND attendance_date = ? AND time_out IS NULL
      `;
      const [result] = await pool.execute(checkOutQuery, [timestamp, studentId, classId, today]);
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'No valid check-in record found for check-out' });
      }
      
      console.log(`[Attendify] Time out recorded for student ${studentId} in class ${classId} at ${timestamp}`);
      return res.status(200).json({ message: 'Time out recorded successfully' });
      
    } else {
      return res.status(400).json({ message: 'Invalid status value. Expected "In" or "Out".' });
    }
  } catch (error) {
    console.error('[Attendify] Error recording attendance:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
