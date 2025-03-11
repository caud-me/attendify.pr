document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".displayTable").forEach(element => {
    element.addEventListener("click", () => {
      element.classList.toggle("immersive");
    });
  });

  document.querySelectorAll('.tab-container').forEach(container => {
    container.addEventListener('click', event => {
      if (event.target.matches('.tab-button')) {
        const selectedTab = event.target.getAttribute('data-tab');
        const section = event.target.closest('section');

        // Remove active classes from all buttons and contents in this section
        section.querySelectorAll('.tab-button').forEach(button => {
          button.classList.remove('active');
          button.setAttribute('aria-selected', 'false');
        });
        section.querySelectorAll('.tab-content').forEach(content => {
          content.classList.remove('active');
        });

        // Activate the clicked tab and corresponding content
        event.target.classList.add('active');
        event.target.setAttribute('aria-selected', 'true');
        section.querySelector(`.tab-content[data-tab="${selectedTab}"]`).classList.add('active');
      }
    });
  });

  admins_me();
  admins_api();
});

async function admins_me() {
  const response = await fetch('/admin/me');
  const data = await response.json();
  document.getElementById('admin_full_name').textContent = data.fullname[0].full_name;
}

async function admins_api() {
  const response = await fetch('/admin/api');
  const data = await response.json();

  const adminTableUser = document.getElementById('admin_tableuser');
  const adminTableStudents = document.getElementById('admin_tablestudents');
  const adminTableStudentClasses = document.getElementById('admin_tablestudent_classes');
  const adminTableCourses = document.getElementById('admin_tablecourses');
  const adminTableClasses = document.getElementById('admin_tableclasses');

  data.admin_users.forEach((eachData, index) => {
    adminTableUser.innerHTML += `
      <tr>
        <td>${index + 1}</td>
        <td>${eachData.username}</td>
        <td>${eachData.full_name}</td>
        <td>${eachData.role}</td>
      </tr>
    `;
  });

  data.admin_students.forEach((eachData, index) => {
    adminTableStudents.innerHTML += `
      <tr>
        <td>${index + 1}</td>
        <td>${eachData.student_id}</td>
        <td>${eachData.full_name}</td>
        <td>${eachData.rfid}</td>
        <td>${eachData.rfid_no}</td>
        <td>${eachData.is_regular}</td>
        <td>${eachData.grade_section}</td>
        <td>${eachData.profile_image}</td>
        <td>${eachData.guardian_contact}</td>
      </tr>
    `;
  });

  data.admin_student_classes.forEach((eachData, index) => {
    adminTableStudentClasses.innerHTML += `
      <tr>
        <td>${index + 1}</td>
        <td>${eachData.student_id}</td>
        <td>${eachData.class_id}</td>
        <td>${eachData.enrollment_type}</td>
        <td>${eachData.enrollment_date}</td>
      </tr>
    `;
  });

  data.admin_courses.forEach((eachData, index) => {
    adminTableCourses.innerHTML += `
      <tr>
        <td>${index + 1}</td>
        <td>${eachData.course_code}</td>
        <td>${eachData.course_name}</td>
      </tr>
    `;
  });

  data.admin_classes.forEach((eachData, index) => {
    adminTableClasses.innerHTML += `
      <tr>
        <td>${index + 1}</td>
        <td>${eachData.teacher_username}</td>
        <td>${eachData.grade_section}</td>
        <td>${eachData.course_name} - ${eachData.course_code}</td>
        <td>${eachData.day}</td>
        <td>${eachData.start_time}</td>
        <td>${eachData.end_time}</td>
        <td>${eachData.class_id}</td>
      </tr>
    `;
  });
}