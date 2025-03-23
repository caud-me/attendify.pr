const express = require('express');
const router = express.Router();
const { $requireRole } = require('../middleware.js');
const { $generatePassword, $toUsername } = require('../shortcuts.js');
const $pool = require('../database.js');

router.get('/me', $requireRole(['admin']), async (req, res) => {
    const $admin_username = req.session.user.username;
    const [me_fullname] = await $pool.execute(`
        SELECT full_name, role FROM users WHERE username = ?
    `, [$admin_username]); 
    
    res.json({ fullname: me_fullname });
});

router.get('/api', $requireRole(['admin', 'instructor']), async (req, res) => {
    const [users] = await $pool.execute(`SELECT * FROM users`);
    const [students] = await $pool.execute(`SELECT * FROM students ORDER BY rfid_no`);
    const [student_classes] = await $pool.execute(`
      SELECT student_classes.student_id, students.full_name, student_classes.*  
      FROM student_classes  
      JOIN students ON student_classes.student_id = students.student_id  
      ORDER BY students.grade_section, students.full_name;
      `);
    const [courses] = await $pool.execute(`SELECT * FROM courses`);
    const [classes] = await $pool.execute(`
      SELECT classes.*, courses.course_name 
      FROM classes
      JOIN courses ON classes.course_code = courses.course_code
      ORDER BY teacher_username
  `);  
    const [attendance_history] = await $pool.execute(`SELECT * FROM attendance_history`);
    const [attendance] = await $pool.execute(`SELECT * FROM attendance`);

    res.json({
        admin_users: users,
        admin_students: students,
        admin_student_classes: student_classes,
        admin_courses: courses,
        admin_classes: classes,
        admin_attendance_history: attendance_history,
        admin_attendance: attendance
    });
});

router.post('/createTeacher', $requireRole(['admin']), async (req, res) => {
    const { fullname } = req.body;
    const username = $toUsername(fullname);
    const password = $generatePassword(12);

    try {
        await $pool.execute(
            `INSERT INTO users (username, full_name, password, role) VALUES (?, ?, ?, ?)`,
            [username, fullname, password, 'teacher']
        );
        console.log(`[Attendify] Admin created teacher ${username}`);
        res.json({ message: 'User created', fullname, password });
    } catch (error) {
        res.json({ message: 'Either duplicate entry, or something is wrong'});
    }
});

router.post('/createGuard', $requireRole(['admin']), async (req, res) => {
  const { fullname } = req.body;
  const username = $toUsername(fullname);
  const password = $generatePassword(12);

  try {
      await $pool.execute(
          `INSERT INTO users (username, full_name, password, role) VALUES (?, ?, ?, ?)`,
          [username, fullname, password, 'guard']
      );
      console.log(`[Attendify] Admin created guard ${username}`);
      res.json({ message: 'User created', fullname, password });
  } catch (error) {
      res.json({ message: 'Either duplicate entry, or something is wrong'});
  }
});

router.post('/createFacilitator', $requireRole(['admin']), async (req, res) => {
    const { fullname } = req.body;
    const username = $toUsername(fullname);
    const password = $generatePassword(12);

    try {
        await $pool.execute(
            `INSERT INTO users (username, full_name, password, role) VALUES (?, ?, ?, ?)`,
            [username, fullname, password, 'facilitator']
        );
        console.log(`[Attendify] Admin created facilitator ${username}`);
        res.json({ message: 'User created', fullname, password });
    } catch (error) {
        res.json({ message: 'Either duplicate entry, or something is wrong'});
    }
});

router.post('/createAdmin', $requireRole(['admin']), async (req, res) => {
  const { fullname } = req.body;
  const username = $toUsername(fullname);
  const password = $generatePassword(12);

  try {
    await $pool.execute(
      `INSERT INTO users (username, full_name, password, role) VALUES (?, ?, ?, ?)`,
      [username, fullname, password, 'admin']
    );
    console.log(`[Attendify] Admin created admin ${username}`);
    res.json({ message: 'User created', fullname, password });
  } catch (error) {
    res.json({ message: 'Either duplicate entry, or something is wrong' });
  }
});

router.post('/addCourse', $requireRole(['admin']), async (req, res) => {
  const { course_code, course_name } = req.body;

  try {
    await $pool.execute(`INSERT INTO courses (course_code, course_name) VALUES (?, ?)`, [course_code, course_name]);
    console.log(`[Attendify] Admin added course ${course_name}`);
    res.json({ message: `Course added ${course_name}` });
  } catch (error) {
    res.json(error);
  }
});

// 1:41am stable class_id
router.post('/addClass', $requireRole(['admin']), async (req, res) => {
  const { coursecode, gradesection, username, day, starttime, endtime } = req.body;

  // arron: generate class-id, less restrictive regex
  const CLASSID = `${gradesection}-${coursecode}-${day.toUpperCase()}-${starttime.replace(':', '')}`;
  const pattern = /^\d{2}-[a-zA-Z0-9]+-[a-zA-Z0-9]+-[A-Z]{3}-\d{4}$/i;

  if (!pattern.test(CLASSID)) {
    return res.status(400).json({ message: `Invalid class_id format. Follow: 12-MAWD-APPLIED1006-MON-0900 ${CLASSID}` });
  }

  try {
    const [result] = await $pool.execute(
      `INSERT INTO classes (class_id, course_code, grade_section, teacher_username, day, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [CLASSID, coursecode, gradesection, username, day, starttime, endtime]
    );

    res.json({ message: 'Class Created', class_id: CLASSID });
    console.log(`[Attendify] Admin created class ${CLASSID}`);
    console.log(`[Attendify] ${username} is now in charge of course ${coursecode}`);
  } catch (error) {
    console.log(error)
    res.json(error);
  }
});

// 1:41am stable class_id
router.post('/createStudent', $requireRole(['admin']), async (req, res) => {
  const { student_id, full_name, rfid, rfid_no, is_regular, grade_section, guardian_contact, class_ids } = req.body;
  const profile_image = req.file ? req.file.filename : null; // Handle file upload if applicable

  try {
      console.log(`[Attendify] Attempting to create student: ${full_name} (${student_id})`);

      // Check if RFID already exists
      const [existingStudent] = await $pool.execute(`SELECT * FROM students WHERE rfid = ?`, [rfid]);
      if (existingStudent.length > 0) {
          console.log(`[Attendify] RFID conflict: ${rfid} already exists.`);
          return res.status(400).json({ message: 'RFID already exists' });
      }

      // Insert student into database
      await $pool.execute(
          `INSERT INTO students (student_id, full_name, rfid, rfid_no, is_regular, grade_section, profile_image, guardian_contact) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [student_id, full_name, rfid, rfid_no, is_regular, is_regular == 1 ? grade_section : null, profile_image, guardian_contact]
      );

      console.log(`[Attendify] Student created: ${full_name} (${student_id})`);

      if (is_regular == 1) {
          // Auto-enroll regular students in their grade section courses
          const [classes] = await $pool.execute(`SELECT class_id FROM classes WHERE grade_section = ?`, [grade_section]);
          for (const cls of classes) {
              await $pool.execute(
                  `INSERT INTO student_classes (student_id, class_id, enrollment_type, enrollment_date) VALUES (?, ?, 'preset', CURDATE())`,
                  [student_id, cls.class_id]
              );
              console.log(`[Attendify] Auto-enrolled ${full_name} in class ${cls.class_id}`);
          }
      } else {
          // Manually enroll irregular students in selected classes
          if (class_ids && class_ids.length > 0) {
              const values = class_ids.map(class_id => [student_id, class_id, 'manual', new Date()]);
              await $pool.query(`INSERT INTO student_classes (student_id, class_id, enrollment_type, enrollment_date) VALUES ?`, [values]);
              console.log(`[Attendify] Manually enrolled ${full_name} in ${class_ids.length} classes`);
          }

          console.log(`[Attendify] Irregular student enrollment completed. Available classes can be fetched from '/admins/api'`);
      }

      res.json({ message: 'Student Enrolled Successfully' });
      console.log(`[Attendify] Enrollment completed: ${full_name} (${student_id})`);

  } catch (error) {
      console.error(`[Attendify] Error enrolling student:`, error);
      res.status(500).json({ message: 'Error enrolling student' });
  }
});

router.post('/resetDatabase', $requireRole(['admin']), async (req, res) => {
  try {
    await $pool.execute(`DELETE FROM attendance`);
    await $pool.execute(`DELETE FROM attendance_history`);
    await $pool.execute(`DELETE FROM student_classes`);
    await $pool.execute(`DELETE FROM students`);
    await $pool.execute(`DELETE FROM classes`);
    await $pool.execute(`DELETE FROM courses`);
    await $pool.execute(`DELETE FROM users WHERE role != 'system'`);
    console.log(`[Attendify] Admin reset the database`);
    res.json({ message: 'Database reset' });
  } catch (error) {
    res.json({ message: 'Something went wrong' });
  }
});

router.post('/prefillAttendance', $requireRole(['admin']), async (req, res) => {
  const { schedule } = req.body;

  try {
    for (const entry of schedule) {
      await $pool.execute(
        `INSERT INTO attendance (student_id, class_id, date, status) VALUES (?, ?, ?, ?)`,
        [entry.student_id, entry.class_id, entry.date, entry.status]
      );
    }
    console.log(`[Attendify] Admin prefilled attendance schedule`);
    res.json({ message: 'Attendance schedule prefilled' });
  } catch (error) {
    res.json({ message: 'Something went wrong' });
  }
});

router.get('/download/:table', $requireRole(['admin']), async (req, res) => {
  const { table } = req.params;
  const [data] = await $pool.execute(`SELECT * FROM ${table}`);

  if (!data.length) return res.status(404).send('No data found.');

  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  
  // We'll use the table name (converted to Proper Case) as the worksheet name.
  // (If you run into naming issues, you might need to sanitize the name.)
  const toProperCase = (str) =>
    str
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());

  const properTableName = toProperCase(table);
  const worksheet = workbook.addWorksheet(properTableName);

  // Get the column keys from the first data row.
  const keys = Object.keys(data[0]);

  // Define columns (this automatically creates a header row in the current worksheet)
  worksheet.columns = keys.map(key => ({
    header: toProperCase(key),
    key,
    width: Math.max(
      toProperCase(key).length,
      ...data.map(row => (row[key] ? row[key].toString().length : 0))
    ) + 5
  }));

  // At this point, ExcelJS has created the header row at row 1.
  // Now, insert a new row at the top for the title.
  worksheet.insertRow(1, [properTableName]);

  // Merge cells in the title row (A1 to the last column)
  const lastColLetter = String.fromCharCode(64 + keys.length); // e.g. if keys.length = 5, then letter = E
  worksheet.mergeCells(`A1:${lastColLetter}1`);

  // Format the title row
  const titleCell = worksheet.getCell('A1');
  titleCell.font = { name: 'Segoe UI Semibold', size: 24 };
  titleCell.alignment = { vertical: 'middle'};

  worksheet.getRow(2).height = 24; 
  worksheet.getRow(2).alignment = { vertical: 'middle'};
  worksheet.getRow(2).font = { name: 'Segoe UI Semibold', size: 12 }; 
  // gray color
  worksheet.getRow(2).font = { color: { argb: 'FF808080' } };

  // Now, the header row is pushed down to row 2, and your data should start at row 3.
  data.forEach(row => worksheet.addRow(row));

  // Debug output (should log your title in A1)
  console.log('Title in A1:', worksheet.getCell('A1').value);

  // Generate Excel file and send it in response
  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${table}.xlsx`);
  res.setHeader('Content-Length', buffer.length);
  res.send(buffer);
});

//re enroll
router.get('/reenroll', $requireRole(['admin']), async (req, res) => {
    // Clears student_classes for refresh
    await $pool.execute(`DELETE FROM student_classes`);

    // Re-enrolls students and captures result
    const [result] = await $pool.execute(`
      INSERT INTO student_classes (student_id, class_id, enrollment_type, enrollment_date)
      SELECT s.student_id, c.class_id, 'preset', CURDATE()
      FROM students s
      JOIN classes c ON s.grade_section = c.grade_section;
    `);

    res.json({ message: `OK, ${result.affectedRows} rows affected` });
})

module.exports = router;