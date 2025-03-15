const express = require('express');
const router = express.Router();
const {$requireRole} = require('../middleware.js');
const $pool = require('../database.js');

router.get('/me', $requireRole(['facilitator']), async (req, res) => {
    const $facilitator_username = req.session.user.username;
    const [me_fullname] = await $pool.execute(
        `SELECT full_name, role FROM users WHERE username = ?`, 
        [$facilitator_username]
    ); 
    const result = {fullname: me_fullname};
    res.json(result);
});

router.get('/remarks', $requireRole(['facilitator']), async (req, res) => {
    if (!req.session.user || !req.session.user.username) {
        return res.status(403).json({ message: "Unauthorized" });
    }

    try {
        const [rows] = await $pool.execute(`
            SELECT 
                a.attendance_id, 
                a.student_id, 
                s.full_name, 
                s.grade_section, 
                c.course_name, 
                c.course_code, 
                a.recorded_by AS flagged_by, 
                a.remark AS remarks,
                DATE_FORMAT(a.updated_at, '%a %b %e, %h:%i %p') AS flagged_at
            FROM attendance a
            JOIN students s ON a.student_id = s.student_id
            JOIN classes cl ON a.class_id = cl.class_id
            JOIN courses c ON cl.course_code = c.course_code
            WHERE a.remark IS NOT NULL;
        `);
        res.json(rows);
    } catch (error) {
        console.error("Error fetching remarks:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

module.exports = router;