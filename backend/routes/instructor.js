const express = require('express');
const router = express.Router();
const { $requireRole } = require('../middleware.js');
const $pool = require('../database.js');
const moment = require('moment-timezone');
const path = require('path');
const xlsx = require('xlsx');
const socketIoClient = require('socket.io-client');

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
  // const hardcodedDateString = '2025-03-24T01:32:05+08:00';
  // const now = moment(hardcodedDateString)
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
          `
            SELECT 
                s.student_id,
                s.full_name,
                s.grade_section, 
                a.status,
                a.time_in,
                a.time_out, 
                a.remark
            FROM students s
            JOIN student_classes sc ON s.student_id = sc.student_id
            LEFT JOIN attendance a ON s.student_id = a.student_id 
                AND a.class_id = ? 
                AND a.attendance_date = ?
            WHERE sc.class_id = ?
            ORDER BY 
                CASE WHEN s.grade_section IS NULL THEN 1 ELSE 0 END, 
                s.grade_section ASC, 
                s.full_name ASC;
          `,
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

router.get('/downloadStudentAttendanceToday', $requireRole(['teacher']), async (req, res) => {
  const username = req.session.user.username;
  const timezone = 'Asia/Manila';
  const now = moment().tz(timezone);
  // const hardcodedDateString = '2025-03-24T01:32:05+08:00';
  // const now = moment(hardcodedDateString)
  const dateString = now.format('YYYY-MM-DD');
  const dayName = now.format('ddd');
  const currentTime = now.format('HH:mm:ss');

  // Get current class information
  const [currentClass] = await $pool.execute(
    `
    SELECT 
        c.class_id, 
        c.course_code, 
        courses.course_name, 
        c.grade_section, 
        c.start_time, 
        c.end_time
    FROM classes c
    JOIN courses ON c.course_code = courses.course_code
    WHERE c.teacher_username = ?
    AND c.day = ?
    AND ? BETWEEN c.start_time AND c.end_time
    LIMIT 1;
     `,
    [username, dayName, currentTime]
  );

  if (!currentClass.length) {
    return res.status(404).send('No active class found at this time.');
  }

  const classId = currentClass[0].class_id;
  const courseCode = currentClass[0].course_code;
  const gradeSection = currentClass[0].grade_section;
  const courseName = currentClass[0].course_name;

  // Get students and their attendance for this class
  const [result] = await $pool.execute(
    `SELECT 
        s.student_id, 
        s.full_name, 
        s.grade_section, 
        a.status, 
        a.time_in, 
        a.remark 
     FROM students s
     JOIN student_classes sc ON s.student_id = sc.student_id AND sc.class_id = ?
     LEFT JOIN attendance a ON s.student_id = a.student_id 
       AND a.attendance_date = ? 
       AND a.class_id = ?
     ORDER BY s.grade_section, s.full_name`,
    [classId, dateString, classId]
  );

  console.log("📊 Attendance data:", result);

  if (result.length === 0) {
    return res.status(404).send('No attendance data found.');
  }

  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheetName = `${courseCode} - ${gradeSection}`;
  const worksheet = workbook.addWorksheet(sheetName);

  // Helper: Convert snake_case to Proper Case
  const toProperCase = (str) =>
    str.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

  // Get keys from the data for headers
  const keys = Object.keys(result[0]);

  // Row 1: Title (merged across columns)
  const title = `[Attendify] ${courseName} ${gradeSection} Attendance ${dateString}`;
  const lastColLetter = String.fromCharCode(64 + keys.length);
  worksheet.mergeCells(`A1:${lastColLetter}1`);
  const titleCell = worksheet.getCell('A1');
  titleCell.value = title;
  titleCell.font = { name: 'Segoe UI Semibold', size: 24 };
  titleCell.alignment = { vertical: 'middle'};

  // Row 2: Header row (will be inserted below the title)
  const headerRowValues = keys.map(key => toProperCase(key));
  const headerRow = worksheet.addRow(headerRowValues);
  headerRow.height = 24; 
  headerRow.alignment = { vertical: 'middle'};
  headerRow.font = { size: 12 }; 
  headerRow.font = { color: { argb: 'FF808080' } };

  // Data Rows: starting from row 3
  result.forEach(row => {
    const rowValues = keys.map(key => row[key]);
    worksheet.addRow(rowValues);
  });

  // Adjust each column's width based on header and cell lengths
  keys.forEach((key, i) => {
    let maxLength = toProperCase(key).length;
    result.forEach(row => {
      const cellValue = row[key] ? row[key].toString() : '';
      if (cellValue.length > maxLength) maxLength = cellValue.length;
    });
    worksheet.getColumn(i + 1).width = maxLength + 5;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${sheetName}.xlsx`);
  res.setHeader('Content-Length', buffer.length);
  res.send(buffer);
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

  if (result.length === 0) {
    return res.status(404).send("No schedule found for today.");
  }

  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheetName = "Today's Schedule";
  const worksheet = workbook.addWorksheet(sheetName);

  // Helper function for proper casing
  const toProperCase = (str) =>
    str.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

  // Get keys from result for headers
  const keys = Object.keys(result[0]);

  // Row 1: Title
  const title = "Today's Schedule";
  const lastColLetter = String.fromCharCode(64 + keys.length);
  worksheet.mergeCells(`A1:${lastColLetter}1`);
  const titleCell = worksheet.getCell('A1');
  titleCell.value = title;
  titleCell.font = { name: 'Segoe UI Semibold', size: 24 };
  titleCell.alignment = { vertical: 'middle'};

  // Row 2: Header row with specified formatting
  const headerRowValues = keys.map(key => toProperCase(key));
  const headerRow = worksheet.addRow(headerRowValues);
  headerRow.height = 24; 
  headerRow.alignment = { vertical: 'middle'};
  headerRow.font = { size: 12 }; 
  headerRow.font = { color: { argb: 'FF808080' } };

  // Data Rows:
  result.forEach(row => {
    const rowValues = keys.map(key => row[key]);
    worksheet.addRow(rowValues);
  });

  // Adjust column widths
  keys.forEach((key, i) => {
    let maxLength = toProperCase(key).length;
    result.forEach(row => {
      const cellValue = row[key] ? row[key].toString() : '';
      if (cellValue.length > maxLength) maxLength = cellValue.length;
    });
    worksheet.getColumn(i + 1).width = maxLength + 5;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${sheetName}.xlsx`);
  res.setHeader('Content-Length', buffer.length);
  res.send(buffer);
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

  if (result.length === 0) {
    return res.status(404).send("No schedule data found.");
  }

  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheetName = "All Schedules";
  const worksheet = workbook.addWorksheet(sheetName);

  // Helper: Convert snake_case to Proper Case
  const toProperCase = (str) =>
    str.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

  // Get keys for headers
  const keys = Object.keys(result[0]);

  // Row 1: Title
  const title = "All Schedules";
  const lastColLetter = String.fromCharCode(64 + keys.length);
  worksheet.mergeCells(`A1:${lastColLetter}1`);
  const titleCell = worksheet.getCell('A1');
  titleCell.value = title;
  titleCell.font = { name: 'Segoe UI Semibold', size: 24 };
  titleCell.alignment = { vertical: 'middle'};

  // Row 2: Header row
  const headerRowValues = keys.map(key => toProperCase(key));
  const headerRow = worksheet.addRow(headerRowValues);
  headerRow.height = 24; 
  headerRow.alignment = { vertical: 'middle'};
  headerRow.font = { size: 12 }; 
  headerRow.font = { color: { argb: 'FF808080' } };

  // Data Rows:
  result.forEach(row => {
    const rowValues = keys.map(key => row[key]);
    worksheet.addRow(rowValues);
  });

  // Adjust column widths
  keys.forEach((key, i) => {
    let maxLength = toProperCase(key).length;
    result.forEach(row => {
      const cellValue = row[key] ? row[key].toString() : '';
      if (cellValue.length > maxLength) maxLength = cellValue.length;
    });
    worksheet.getColumn(i + 1).width = maxLength + 5;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${sheetName}.xlsx`);
  res.setHeader('Content-Length', buffer.length);
  res.send(buffer);
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

router.get('/monthlyAttendance', $requireRole(['teacher']), async (req, res) => {
  const username = req.session.user.username;
  const { month, year } = req.query; // Get query params
  console.log(month, year)

  if (!month || !year) {
      return res.status(400).json({ message: "Month and year are required." });
  }

  const timezone = 'Asia/Manila';
    //hardcode value for testing
  // const now = moment('2025-03-14T12:10:00').tz('Asia/Manila');
  const now = moment().tz(timezone);
  const dayName = now.format('ddd');
  const timeString = now.format('HH:mm:ss');

//   const timezone = 'Asia/Manila';
//   const now = moment.tz('2025-03-15T08:00:00', timezone);
//   const dayName = now.format('ddd');
//   const timeString = now.format('HH:mm:ss');
// //   const month = now.format('MMMM');
// //   const year = now.format('YYYY');
//   console.log("🕒 Current time:", timeString, dayName);
// //   console.log("📅 Selected month:", month, year);
//   console.log("👨‍🏫 Instructor:", username);
//   console.log("Current Date:", now.format('YYYY-MM-DD'));

  try {
      // Find the currently ongoing class for the instructor
      const [ongoing_class] = await $pool.execute(
          `SELECT class_id, course_code, grade_section FROM classes 
           WHERE teacher_username = ? 
           AND day = ? 
           AND ? BETWEEN start_time AND end_time`,
          [username, dayName, timeString]
      );
      console.log("🔍 Ongoing class:", ongoing_class);

      if (ongoing_class.length === 0) {
          return res.status(404).json({ message: "No ongoing class found." });
      }

      const course_code = ongoing_class[0]?.course_code || null;
      console.log("📌 Using course_code:", course_code);

      const monthNumber = moment(month, 'MMMM').format('MM'); // Convert month name to number

      const [attendanceRecords] = await $pool.execute(
        `SELECT s.full_name, a.* 
         FROM attendance_history a
         JOIN students s ON a.student_id = s.student_id
         WHERE a.class_id = ? 
         AND a.attendance_date LIKE ?
         ORDER BY s.full_name ASC`,
        [`${ongoing_class[0]?.class_id}`, `%-${monthNumber}-%`]
      );
    
      console.log(ongoing_class[0]?.grade_section, ongoing_class[0]?.class_id, ongoing_class[0]?.course_code);
      const groupedAttendance = attendanceRecords.reduce((acc, row) => {
        const { full_name, student_id, class_id, attendance_date, status, time_in, time_out, recorded_by, remark } = row;
    
        if (!acc[student_id]) {
            acc[student_id] = {
                full_name,
                student_id,
                attendance_history: []
            };
        }
    
        acc[student_id].attendance_history.push({
            date: attendance_date,
            status,
            time_in,
            time_out,
            recorded_by,
            remark
        });
    
        return acc;
    }, {});

    const finalOutput = Object.values(groupedAttendance);

    

    
    

      console.log("📊 Monthly attendance:", finalOutput);

      res.json(finalOutput);

  } catch (error) {
      console.error("Error fetching monthly attendance:", error);
      res.status(500).json({ message: "Internal Server Error" });
  }
});

const tmp = require('tmp');

const ExcelJS = require('exceljs');

router.get('/monthlyAttendance/download', $requireRole(['teacher']), async (req, res) => {
    const username = req.session.user.username;
    var { month, year } = req.query;

  
    const timezone = 'Asia/Manila';
    const now = moment().tz(timezone);
    const dayName = now.format('ddd');
    const timeString = now.format('HH:mm:ss');

    if (!month || !year) {
        month = now.format('MMMM');
        year = now.format('YYYY');
    }

  
    try {
      const [ongoing_class] = await $pool.execute(
        `SELECT class_id, course_code, grade_section FROM classes 
         WHERE teacher_username = ? 
         AND day = ? 
         AND ? BETWEEN start_time AND end_time`,
        [username, dayName, timeString]
      );
  
      if (ongoing_class.length === 0) {
        return res.status(404).json({ message: "No ongoing class found." });
      }
  
      const class_id = ongoing_class[0].class_id;
      const monthNumber = moment(month, 'MMMM').format('MM');
  
      const [attendanceRecords] = await $pool.execute(
        `SELECT 
            s.full_name,
            s.student_id,
            COUNT(CASE WHEN a.status = 'present' THEN 1 END) AS total_present,
            COUNT(CASE WHEN a.status = 'late' THEN 1 END) AS total_late,
            COUNT(CASE WHEN a.status = 'absent' THEN 1 END) AS total_absent,
            GROUP_CONCAT(CONCAT(DAY(a.attendance_date), ':', a.status) ORDER BY a.attendance_date) AS daily_status
          FROM 
            attendance_history a
          JOIN 
            students s ON a.student_id = s.student_id
          WHERE 
            a.class_id = ? 
            AND a.attendance_date LIKE ?
          GROUP BY 
            s.student_id
          ORDER BY 
            s.full_name ASC`,
          [`${ongoing_class[0]?.class_id}`, `%-${monthNumber}-%`]
      );
  
      console.log(ongoing_class[0]?.grade_section, ongoing_class[0]?.class_id, ongoing_class[0]?.course_code);
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Monthly Attendance");
  
      const defaultFont = { name: 'Segoe UI', size: 12 };
      worksheet.properties.defaultRowHeight = 20;
  
      const titleRow = worksheet.addRow([`${month} ${year} Attendance`]);
      titleRow.font = { ...defaultFont, size: 24, bold: false, family: 2 };
      worksheet.mergeCells(`A1:AI1`);
      titleRow.alignment = { vertical: 'middle' };
      titleRow.height = 30;
  
      const headerRow = worksheet.addRow([
        '#', 'Name', 'Student ID', 
        'P', 'L', 'A',  // Added Total Counters
        ...Array.from({ length: 31 }, (_, i) => i + 1)
      ]);
  
      headerRow.font = { ...defaultFont, color: { argb: '808080' } };
      headerRow.alignment = { horizontal: 'center' };
  
      attendanceRecords.forEach((student, index) => {
        const dailyAttendance = Array(31).fill('');
  
        if (student.daily_status) {
          student.daily_status.split(',').forEach(record => {
            const [day, status] = record.split(':');
            dailyAttendance[day - 1] = status; // Map status to correct day
          });
        }
  
        const row = worksheet.addRow([
          index + 1,
          student.full_name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()),
          student.student_id,
          student.total_present || 0, 
          student.total_late || 0, 
          student.total_absent || 0, 
          ...dailyAttendance
        ]);
  
        row.font = defaultFont;
        row.alignment = { vertical: 'middle' };
  
        row.eachCell((cell, colNum) => {
          if (colNum > 6) { // Only cells for daily status
            if (cell.value === 'present') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'C6EFCE' } }; // Green
            if (cell.value === 'late') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEB9C' } }; // Yellow
            if (cell.value === 'absent') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC7CE' } }; // Red
          }
        });
      });
  
      // Column Widths
      worksheet.getColumn(1).width = 5;   // #
      worksheet.getColumn(2).width = 40;  // Name
      worksheet.getColumn(3).width = 20;  // Student ID
      worksheet.getColumn(4).width = 5;   // P
      worksheet.getColumn(5).width = 5;   // L
      worksheet.getColumn(6).width = 5;   // A
      for (let i = 7; i <= 37; i++) worksheet.getColumn(i).width = 5; // Days 1-31
  
      const legendRow = worksheet.addRow([]);
      legendRow.height = 10;
  
      const legend = worksheet.addRow(["Legend: ", "", "■ Present", "", "■ Late", "", "■ Absent"]);
      legend.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'C6EFCE' } };
      legend.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEB9C' } };
      legend.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC7CE' } };
  
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="[Attendify] ${month} ${year} Attendance.xlsx"`);
  
      await workbook.xlsx.write(res);
      res.end();
  
    } catch (error) {
      console.error("Error fetching monthly attendance:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  router.get('/api', $requireRole(['teacher']), async (req, res) => {

    const [classes] = await $pool.execute(`
      SELECT classes.*, courses.course_name 
      FROM classes
      JOIN courses ON classes.course_code = courses.course_code
      ORDER BY teacher_username
  `);  

    res.json({
      admin_classes: classes
  });
});

module.exports = router;