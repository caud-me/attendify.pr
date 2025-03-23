document.addEventListener("DOMContentLoaded", function() {
    function convertTo12Hour(time24) {
        if (!time24) return '';
        
        try {
            const [hours24, minutes] = time24.split(':');
            let period = 'AM';
            let hours12 = parseInt(hours24);
    
            if (hours12 >= 12) {
                period = 'PM';
                if (hours12 > 12) {
                    hours12 -= 12;
                }
            }
            if (hours12 === 0) {
                hours12 = 12;
            }
    
            return `${hours12}:${minutes} ${period}`;
        } catch (error) {
            console.error('Error converting time:', error);
            console.log('Original time:', time24, 'attempted');
            return time24; // Return original if conversion fails
        }
    }
    function formatName(name) {
        return name.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
    }

    const socket = io('http://localhost:3000'); // Connect to the WebSocket server
    // Listen for real-time updates
    socket.on("fileChanged", (payload) => {
        const updatedData = payload.data;
    
        // Get the first (and only) key-value pair from the data
        const rfidNumber = Object.keys(updatedData)[0];
        const studentData = updatedData[rfidNumber];
    
        if (studentData && studentData.timeIn && studentData.status) {
            const timeIn = studentData.timeIn.split(" ")[1]; // Extract just the time part
            const status = studentData.status === "In" ? "PRESENT" : "LATE";
    
            const displayUpdate = document.getElementById("displayUpdate");
            if (displayUpdate) {
                // ✅ Directly set textContent (no extra elements!)
                displayUpdate.textContent = `[Attendify] Scanned`;
    
                // Optional: Clear message after 5 seconds
                setTimeout(() => {
                    displayUpdate.textContent = "";
                }, 5000);
            }
        }
    
        instructors_ongoing();
    });

    const remarkModal = document.getElementById("remarkModal");
    const remarkInput = document.getElementById("remarkInput");
    const submitRemarkBtn = document.getElementById("remarkConfirm");
    const tbody = document.getElementById("instructor_ongoingStudents");

    let selectedStudentId = null;

    if (tbody) {
        tbody.addEventListener("click", function(event) {
            if (event.target.classList.contains("remark-btn")) {
                event.preventDefault(); // Prevent default action of <a> tag

                selectedStudentId = event.target.dataset.studentid;
                const studentName = event.target.dataset.studentname;

                document.getElementById("remarkStudentName").textContent = `Adding remark for ${studentName}. The report will then be sent to the facilitators.`;
                remarkModal.classList.remove("hidden"); // Show modal
            }
        });
    } else {
        console.error("tbody#instructor_ongoingStudents not found in the DOM");
    }

    // Close modal when clicking outside
    window.addEventListener("click", function(event) {
        if (event.target === remarkModal) {
            remarkModal.classList.add("hidden");
        }
    });

    // Submit remark
    submitRemarkBtn.addEventListener("click", async function() {
        const remark = remarkInput.value.trim();

        if (!remark || !selectedStudentId) {
            alert("Please enter a remark.");
            return;
        }

        try {
            const response = await fetch("/instructor/add-remark", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    student_id: selectedStudentId,
                    remark
                })
            });

            const data = await response.json();

            if (response.ok) {
                alert("Remark added successfully!");
                remarkModal.classList.add("hidden"); // Close modal
                location.reload(); // Refresh the page to update remarks
            } else {
                alert("Error: " + data.message);
            }
        } catch (error) {
            console.error("Error:", error);
            alert("Failed to add remark.");
        }
    });

    async function instructors_me() {
        try {
            const response = await fetch('/instructor/me');
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const data = await response.json();

            const fullNameElement = document.getElementById('instructor_full_name');
            const dayElement = document.getElementById('day');
            const tbody = document.getElementById('instructor_schedule');

            if (fullNameElement) {
                fullNameElement.textContent = data.fullname[0].full_name;
            } else {
                console.error("instructor_full_name not found in the DOM");
            }

            if (dayElement) {
                dayElement.textContent = data.time;
            } else {
                console.error("day not found in the DOM");
            }

            if (tbody) {
                tbody.innerHTML = ''; // Clear existing content
                data.schedule.forEach((scheduleItem, index) => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${index + 1}</td>
                        <td>
                            <p>${scheduleItem.course_name}</p>
                            <div class="stub">${scheduleItem.grade_section}</div>
                        </td>
                        <td>${convertTo12Hour(scheduleItem.start_time)}</td>
                        <td>${convertTo12Hour(scheduleItem.end_time)}</td>
                    `;
                    tbody.appendChild(row);
                });
            } else {
                console.error("tbody#instructor_schedule not found in the DOM");
            }
        } catch (error) {
            console.error("Error in instructors_me:", error);
        }
    }

    // Initialize month and year dropdowns
const monthDropdown = document.getElementById("month");
const yearDropdown = document.getElementById("year");

if (monthDropdown) {
    const currentDate = new Date();
    monthDropdown.value = currentDate.getMonth() + 1;
} else {
    console.error("monthDropdown not found in the DOM");
}
if (yearDropdown) {
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 5; y <= currentYear + 1; y++) {
        const option = document.createElement("option");
        option.value = y;
        option.textContent = y;
        yearDropdown.appendChild(option);
    }
    yearDropdown.value = currentYear;
} else {
    console.error("yearDropdown not found in the DOM");
}
// Dynamically build day columns for attendance table header
const attendanceHeader = document.getElementById("attendanceHeader");
if (attendanceHeader) {
    for (let i = 1; i <= 31; i++) {
        const th = document.createElement("th");
        th.textContent = i;
        attendanceHeader.appendChild(th);
    }
} else {
    console.error("attendanceHeader not found in the DOM");
}

async function loadAttendance() {
    const month = monthDropdown.options[monthDropdown.selectedIndex].text.toLowerCase(); 
    const year = yearDropdown.value;

    try {
        const response = await fetch(`/instructor/monthlyAttendance?month=${month}&year=${year}`);
        if (!response.ok) throw new Error(`HTTP Error! Status: ${response.status}`);

        const data = await response.json();
        console.log("Fetched Data:", data); // For debugging
        renderAttendanceTable(data);
    } catch (error) {
        console.error("Error fetching attendance:", error);
    }
}

function renderAttendanceTable(data) {
    const tableBody = document.getElementById("attendanceTableBody");

    tableBody.innerHTML = "";

    data.forEach((student, index) => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${formatName(student.full_name)}</td>
            ${generateAttendanceCells(student.attendance_history)}
        `;
        tableBody.appendChild(row);
    });
}

function generateAttendanceCells(history) {
    return Array.from({ length: 31 }, (_, day) => {
        const record = history.find(att => {
            const date = new Date(att.date);
            return date.getDate() === day + 1;
        });

        const status = record ? record.status : "absent";
        const statusSymbol = status === "present" ? "P" : status === "late" ? "L" : "A";
        return `<td><p class="${status}">${statusSymbol}</p></td>`;
    }).join("");
}

loadAttendance(); // Call immediately when page loads



if (monthDropdown && yearDropdown) {
    monthDropdown.addEventListener("change", loadAttendance);
    yearDropdown.addEventListener("change", loadAttendance);
    loadAttendance(); // Load initial data
} else {
    console.error("Month or year dropdown not initialized.");
}

    async function instructors_ongoing() {
        try {
            const response = await fetch('/instructor/ongoing');
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const data = await response.json();
            console.log("instructors_ongoing data", data);
            console.log("Attendance Data:", data);


            const isFreeTimeElement = document.getElementById('isFreeTime');
            const isFreeTimeCElement = document.getElementById('isFreeTimeC');
            const widgetOngoingElement = document.getElementById('widget_ongoing');

            if (data.class && data.students) {
                // Update class info
                if (widgetOngoingElement) {
                    widgetOngoingElement.innerHTML = `
                        <div>
                            <div id="widget_ongoing_section">${data.class.grade_section.split("-")[1]}</div>
                            <div id="widget_ongoing_grade">${data.class.grade_section.split("-")[0]}</div>
                        </div>
                        <div>
                            <div id="widget_ongoing_course">${data.class.subject}</div>
                            <div id="widget_ongoing_schedule">${convertTo12Hour(data.class.start_time)} to ${convertTo12Hour(data.class.end_time)}</div>
                        </div>
                    `;
                } else {
                    console.error("widget_ongoing not found in the DOM");
                }

                // Populate students
                const tbody = document.getElementById('instructor_ongoingStudents');
                if (tbody) {
                    try {
                        tbody.innerHTML = data.students.map((student, index) => {
                            const hasRemark = student.remark && student.remark.trim() !== '' ? 'has-remark' : '';
                            return `
                                <tr class="${hasRemark}">
                                    <td>${index + 1}</td>
                                    <td><b>${formatName(student.full_name)}</b></td>
                                    <td>
                                        <div class="respect3">
                                            <p class=${student.status}>${student.status.charAt(0).toUpperCase() + student.status.slice(1).toLowerCase()}</p>
                                            <a href="#" class="remark-btn" data-studentid="${student.student_id}" data-studentname="${student.full_name}">Flag</a>
                                        </div>
                                    </td>
                                    <td>${student.time_in ? convertTo12Hour(student.time_in) : ' '}</td>
                                    <td>${student.time_out ? convertTo12Hour(student.time_out) : ' '}</td>
                                    <td>${student.grade_section}</td>
                                    <td>${student.student_id}</td>
                                    <td>${student.remark || ' '}</td>
                                </tr>
                            `;
                        }).join('');
                    } catch (error) {
                        console.error("Error populating student table:", error);
                    }

                    // Update visibility
                    if (isFreeTimeElement && isFreeTimeCElement) {
                        isFreeTimeElement.classList.add('hidden');
                        isFreeTimeCElement.classList.remove('hidden');
                    } else {
                        console.error("isFreeTime or isFreeTimeC not found in the DOM");
                    }

                } else {
                    console.error("tbody#instructor_ongoingStudents not found in the DOM");
                }

            } else {
                if (isFreeTimeElement && isFreeTimeCElement) {
                    isFreeTimeElement.classList.remove('hidden');
                    isFreeTimeCElement.classList.add('hidden');
                } else {
                    console.error("isFreeTime or isFreeTimeC not found in the DOM");
                }
            }
        } catch (error) {
            console.error("Error in instructors_ongoing:", error);
        }
    }

    instructors_me();
    instructors_ongoing(); 
    classes_visualized();
    
});

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
    const response = await fetch('/instructor/api');
    const data = await response.json();
  
    console.log("API Data:", data);
    console.log("Extracted Classes:", data.admin_classes);
  
    if (!data.admin_classes || data.admin_classes.length === 0) {
        console.error("No classes data found!");
        return;
    }
  
    const scheduleTable = document.querySelector("#schedule-table tbody");
    const timeSlots = ["01:00:00", "07:30:00", "09:00:00", "10:30:00", "12:00:00", "13:30:00", "15:00:00"];
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
  