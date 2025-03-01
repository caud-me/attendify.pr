const express = require('express');
const router = express.Router();
const { $requireRole } = require('../middleware.js');
const { $generatePassword, $toUsername } = require('../shortcuts.js');
const $pool = require('../database.js');
require('dotenv').config();

router.get('/me', $requireRole(['admin']), async (req, res) => {
    const $admin_username = req.session.user.username;
    const [me_fullname] = await $pool.execute(`
        SELECT full_name, role FROM users WHERE username = ?
    `, [$admin_username]); 
    
    res.json({ fullname: me_fullname });
});

router.get('/api', $requireRole(['admin']), async (req, res) => {
    const [users] = await $pool.execute(`SELECT * FROM users`);
    const [students] = await $pool.execute(`SELECT * FROM students`);
    const [student_classes] = await $pool.execute(`SELECT * FROM student_classes`);
    const [courses] = await $pool.execute(`SELECT * FROM courses`);
    const [classes] = await $pool.execute(`SELECT * FROM classes`);
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

// Additional admin routes...
// Add the remaining routes from .txt file:
// - createAdmin
// - addCourse  
// - addClass
// - createStudent
// - resetDatabase
// - prefillAttendance schedule
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
  const { course_name } = req.body;

  try {
    await $pool.execute(
      `INSERT INTO courses (course_name) VALUES (?)`,
      [course_name]
    );
    console.log(`[Attendify] Admin added course ${course_name}`);
    res.json({ message: 'Course added', course_name });
  } catch (error) {
    res.json({ message: 'Either duplicate entry, or something is wrong' });
  }
});

router.post('/addClass', $requireRole(['admin']), async (req, res) => {
  const { class_name, course_id } = req.body;

  try {
    await $pool.execute(
      `INSERT INTO classes (class_name, course_id) VALUES (?, ?)`,
      [class_name, course_id]
    );
    console.log(`[Attendify] Admin added class ${class_name}`);
    res.json({ message: 'Class added', class_name });
  } catch (error) {
    res.json({ message: 'Either duplicate entry, or something is wrong' });
  }
});

router.post('/createStudent', $requireRole(['admin']), async (req, res) => {
  const { fullname } = req.body;
  const username = $toUsername(fullname);
  const password = $generatePassword(12);

  try {
    await $pool.execute(
      `INSERT INTO users (username, full_name, password, role) VALUES (?, ?, ?, ?)`,
      [username, fullname, password, 'student']
    );
    console.log(`[Attendify] Admin created student ${username}`);
    res.json({ message: 'User created', fullname, password });
  } catch (error) {
    res.json({ message: 'Either duplicate entry, or something is wrong' });
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
module.exports = router;