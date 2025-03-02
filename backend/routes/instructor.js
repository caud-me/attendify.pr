const express = require('express');
const router = express.Router();
const { $requireRole } = require('../middleware.js');
const $pool = require('../database.js');
const moment = require('moment-timezone');
const path = require('path');
const xlsx = require('xlsx');
const socketIoClient = require('socket.io-client');

// Connect to the WebSocket server
const socket = socketIoClient('http://localhost:3000'); // Adjust if needed

// Store the latest data.json content
let latestData = {};

// Listen for real-time changes
socket.on('fileChanged', (data) => {
  console.log('Received updated data.json:', data);
  latestData = data; 
  console.log('Stored latest data:', latestData);
});

// Endpoint to get real-time data
router.get('/live-data', $requireRole(['teacher']), (req, res) => {
  res.json(latestData);
});

router.get('/me', $requireRole(['teacher']), async (req, res) => {
  const timezone = 'Asia/Manila'; // Replace with your desired timezone
  const now = moment().tz(timezone);
  const dayName = now.format('dddd'); // Full day name (e.g., "Tuesday")

  const $instructor_username = req.session.user.username;

  const [me_fullname] = await $pool.execute(`
      SELECT full_name FROM users WHERE username = ?
  `, [$instructor_username]);

  const [me_schedule] = await $pool.execute(`
      SELECT
          c.course_name,
          class_meeting.grade_section,
          class_meeting.day,
          class_meeting.start_time,
          class_meeting.end_time
      FROM
          classes AS class_meeting
      JOIN
          courses AS c ON class_meeting.course_code = c.course_code
      WHERE
          class_meeting.teacher_username = ?
          AND class_meeting.day = DATE_FORMAT(CURDATE(), '%a')
      ORDER BY
          FIELD(class_meeting.day, 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'),
          class_meeting.start_time;
  `, [$instructor_username]);

  const result = {
      fullname: me_fullname,
      schedule: me_schedule,
      time: dayName
  };

  res.json(result);
});

router.get('/ongoing', $requireRole(['teacher']), async (req, res) => {
  const username = req.session.user.username;
  
    const timezone = 'Asia/Manila';
    const now = moment().tz(timezone);

  // hardcode for testing
//   const hardcodedDateString = '2025-03-03T01:32:05+08:00';
//   const now = moment(hardcodedDateString)
  const dateString = now.format('YYYY-MM-DD'); // e.g., '2025-02-02'
  const timeString = now.format('HH:mm:ss'); // e.g., '00:51:00'
  const dayName = now.format('ddd'); // Short day name (e.g., "Tue")
  const currentTime = timeString;
  console.log(dateString, timeString, dayName, currentTime);

  try { // Important: Wrap the database operations in a try...catch block
      const [ongoing_class] = await $pool.execute(
          `SELECT 
              cm.class_id,
              c.course_name AS subject,
              cm.grade_section,
              cm.start_time,
              cm.end_time
          FROM classes cm
          JOIN courses c ON cm.course_code = c.course_code
          WHERE cm.teacher_username = ? 
              AND cm.day = ? 
              AND ? BETWEEN cm.start_time AND cm.end_time`,
          [username, dayName, currentTime]
      );

      if (ongoing_class.length === 0) {  // Check if a class was found
          return res.status(404).json({ message: 'No ongoing class found.' }); // Return 404 if not found
      }

      const class_id = ongoing_class[0].class_id; // Now it's safe to access index 0

      const [ongoing_students] = await $pool.execute(
          `SELECT 
              s.student_id,
              s.full_name,
              s.grade_section, 
              a.status,
              a.time_in,
              a.remark
          FROM students s
          JOIN student_classes sc ON s.student_id = sc.student_id
          LEFT JOIN attendance a ON s.student_id = a.student_id AND a.class_id = ? AND a.attendance_date = ?
          WHERE sc.class_id = ?
          ORDER BY CASE WHEN s.grade_section IS NULL THEN 1 ELSE 0 END, s.grade_section;`,
          [class_id, dateString, class_id]
      );

      const studentsWithStatus = ongoing_students.map(student => ({
          ...student, // spread the existing student properties
          status: student.status || 'absent',
          time_in: student.time_in ? student.time_in.toString() : null // Format time or null
      }));


      const result = {
          class: ongoing_class[0], // Send only the first class object, not the whole array
          students: studentsWithStatus
      };

      res.json(result);

  } catch (error) {  // Handle any errors during the database operations
      console.error("Error fetching ongoing class:", error); // Log the error for debugging
      res.status(500).json({ message: 'Internal Server Error' }); // Send a 500 response
  }
});

router.get('/downloadTodayScheduleOfTeacher', $requireRole(['teacher']), async (req, res) => {
  const username = req.session.user.username;

  const [result] = await $pool.execute(
      `
      SELECT 
          courses.course_name, 
          classes.course_code, 
          classes.grade_section, 
          classes.start_time, 
          classes.end_time 
      FROM classes
      JOIN courses ON classes.course_code = courses.course_code
      WHERE classes.teacher_username = ? 
      AND classes.day = DATE_FORMAT(CURRENT_DATE, '%a') 
      ORDER BY classes.start_time;
      `,
      [username]
  );

  const worksheet = xlsx.utils.json_to_sheet(result);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, "Today's Schedule");

  const filePath = path.join(__dirname, `[Attendify] Daily Schedule of ${username}.xlsx`);
  xlsx.writeFile(workbook, filePath);

  res.download(filePath);
});

router.get('/downloadAllScheduleOfTeacher', $requireRole(['teacher']), async (req, res) => {
  const username = req.session.user.username;
  const [result] = await $pool.execute(
      `
      SELECT 
          courses.course_name, 
          classes.course_code, 
          classes.grade_section, 
          classes.day, 
          classes.start_time, 
          classes.end_time 
      FROM classes
      JOIN courses ON classes.course_code = courses.course_code
      WHERE classes.teacher_username = ? 
      ORDER BY FIELD(classes.day, 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'), classes.start_time;
      `,
      [username]
  );

  const worksheet = xlsx.utils.json_to_sheet(result);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, "All Schedules");

  const filePath = path.join(__dirname, `[Attendify] Full Schedule of ${username}.xlsx`);
  xlsx.writeFile(workbook, filePath);

  res.download(filePath);
});

router.post('/add-remark', $requireRole(['teacher']), async (req, res) => {
  try {
      console.log("🔍 Received request:", req.body);

      const { student_id, remark } = req.body;
      const username = req.session.user.username;

      if (!student_id || !remark) {
          console.log("❌ Missing required fields:", req.body);
          return res.status(400).json({ message: "Missing required fields" });
      }

      // Get the ongoing class
      const timezone = 'Asia/Manila';
      const now = moment().tz(timezone);
      const timeString = now.format('HH:mm:ss'); // 'HH:MM:SS'
      const dayName = now.format('ddd');
      console.log("🕒 Current time:", timeString, dayName);

      const [ongoing_class] = await $pool.execute(`
          SELECT class_id FROM classes 
          WHERE teacher_username = ? 
            AND day = ? 
            AND ? BETWEEN start_time AND end_time
      `, [username, dayName, timeString]);

      if (ongoing_class.length === 0) {
          console.log("🚫 No ongoing class found");
          return res.status(404).json({ message: "No ongoing class found" });
      }

      const class_id = ongoing_class[0].class_id;
      console.log("📌 Using class_id:", class_id);

      // Ensure attendance record exists before updating
      const [existingAttendance] = await $pool.execute(`
          SELECT * FROM attendance 
          WHERE student_id = ? 
            AND class_id = ?
      `, [student_id, class_id]);

      if (existingAttendance.length === 0) {
          console.log("🚫 No attendance record found.");
          return res.status(404).json({ message: "No attendance record found for this student in the ongoing class." });
      }

      // Update the remark if a record exists
      const [updateResult] = await $pool.execute(`
          UPDATE attendance 
          SET remark = ?, recorded_by = ?, updated_at = NOW() 
          WHERE student_id = ? 
            AND class_id = ?
      `, [remark, req.session.user.username, student_id, class_id]);

      if (updateResult.affectedRows === 0) {
          console.log("❌ Failed to update attendance remark");
          return res.status(500).json({ message: "Failed to add remark" });
      }

      console.log("✅ Remark updated successfully");
      res.json({ message: "Remark updated successfully" });

  } catch (error) {
      console.error("🔥 Error adding remark:", error);
      res.status(500).json({ message: "Internal Server Error" });
  }
});

// Add the missing monthlyAttendance endpoint
router.get('/monthlyAttendance', $requireRole(['teacher']), async (req, res) => {
  try {
    const { month, year } = req.query;
    const username = req.session.user.username;

    const [result] = await $pool.execute(`
      SELECT 
        a.attendance_date,
        c.course_name,
        cm.grade_section,
        COUNT(CASE WHEN a.status = 'present' THEN 1 END) as present_count,
        COUNT(CASE WHEN a.status = 'absent' THEN 1 END) as absent_count,
        COUNT(CASE WHEN a.status = 'late' THEN 1 END) as late_countf
      FROM attendance a
      JOIN classes cm ON a.class_id = cm.class_id
      JOIN courses c ON cm.course_code = c.course_code
      WHERE cm.teacher_username = ?
      AND MONTH(a.attendance_date) = ?
      AND YEAR(a.attendance_date) = ?
      GROUP BY a.attendance_date, c.course_name, cm.grade_section
      ORDER BY a.attendance_date DESC
    `, [username, month, year]);

    res.json(result);
  } catch (error) {
    console.error('[Attendify] Error fetching monthly attendance:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});




module.exports = router;