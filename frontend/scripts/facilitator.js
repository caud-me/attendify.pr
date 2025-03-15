document.addEventListener('DOMContentLoaded', () => {
    facilitator_me();
    loadFlaggedReports();
});

async function facilitator_me() {
    const response = await fetch('/facilitator/me');
    const data = await response.json();

    document.getElementById('facilitator_full_name').textContent = data.fullname[0].full_name;
}

async function loadFlaggedReports() {
    const response = await fetch('/facilitator/remarks');
    const data = await response.json();

    const tbody = document.getElementById('remarksList');
    tbody.innerHTML = ""; // Clear previous content

    if (data.message) {
        tbody.innerHTML = `<tr><td colspan="6">${data.message}</td></tr>`;
        return;
    }

    data.forEach((entry, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>
                <p>${entry.full_name}</p>
                <div class="stub">${entry.grade_section}</div>
                <p>${entry.student_id}</p>
            </td>
            <td class="remark">${entry.remarks}</td>
            <td>
                <p>${entry.flagged_by}</p>
                <div class="stub">${entry.course_name}</div>
                <p>${entry.flagged_at}</p>
            </td>
        `;

        if (entry.remarks) {
            row.classList.add('flagged');
        }

        tbody.appendChild(row);
    });
}