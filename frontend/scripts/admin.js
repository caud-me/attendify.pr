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
  classes_visualized();
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
        <td>${eachData.full_name}</td>
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

function generateColor(courseCode) {
  let hash = 0;
  for (let i = 0; i < courseCode.length; i++) {
      hash = courseCode.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const hue = (hash % 360 + 360) % 360; // Ensure it's within 0-360
  const saturation = 60; // 60% to keep colors vibrant
  const lightness = 70; // 70% for a softer pastel look

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

async function classes_visualized() {
  const response = await fetch('/admin/api');
  const data = await response.json();

  console.log("API Data:", data);
  console.log("Extracted Classes:", data.admin_classes);

  if (!data.admin_classes || data.admin_classes.length === 0) {
      console.error("No classes data found!");
      return;
  }

  const scheduleTable = document.querySelector("#schedule-table tbody");
  const timeSlots = ["07:30:00", "09:00:00", "10:30:00", "12:00:00", "13:30:00", "15:00:00"];
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];

  // Initialize schedule object
  let schedule = {};
  timeSlots.forEach(time => {
      schedule[time] = { "Mon": "", "Tue": "", "Wed": "", "Thu": "", "Fri": "" };
  });

  // Process class data
  data.admin_classes.forEach(cls => {
      console.log(`Processing class: ${cls.class_id} - ${cls.start_time} - ${cls.day}`);

      if (schedule[cls.start_time] && days.includes(cls.day)) {
          // Initialize the cell with a div wrapper if it's empty
          if (!schedule[cls.start_time][cls.day]) {
              schedule[cls.start_time][cls.day] = "<div class='multi-class-wrapper'>";
          }

          function getCourseColor(courseCode) {
            return courseColors[courseCode] || "#cccccc"; // Default gray if not found
        }

          // Append new class entry inside the wrapper
          schedule[cls.start_time][cls.day] += `
            <div class="class-entry">
              <p>${cls.teacher_username}</p>
              <div class="stub" style="background-color: ${generateColor(cls.course_code)};">
                ${cls.course_name.length > 24 ? cls.course_name.substring(0, 21) + "..." : cls.course_name}
              </div>
              <small style="margin: 0;">${cls.grade_section}</small>
            </div>
          `;
      }
  });

  // Close the wrappers
  timeSlots.forEach(time => {
      days.forEach(day => {
          if (schedule[time][day]) {
              schedule[time][day] += "</div>";
          }
      });
  });

  // Render table
  for (let time of timeSlots) {
      let row = `<tr>
          <td>${time}</td>
          <td>${schedule[time]["Mon"] || ""}</td>
          <td>${schedule[time]["Tue"] || ""}</td>
          <td>${schedule[time]["Wed"] || ""}</td>
          <td>${schedule[time]["Thu"] || ""}</td>
          <td>${schedule[time]["Fri"] || ""}</td>
      </tr>`;
      scheduleTable.innerHTML += row;
  }
}
