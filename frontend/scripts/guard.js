document.addEventListener('DOMContentLoaded', () => {
    guard_me();
});

async function guard_me() {
    const response = await fetch('/guard/me');
    const data = await response.json();

    document.getElementById('guard_full_name').textContent = data.fullname[0].full_name;
}