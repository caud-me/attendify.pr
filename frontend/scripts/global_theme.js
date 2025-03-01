const currentTheme = localStorage.getItem("theme");
        
if (currentTheme) {
    document.documentElement.setAttribute("data-theme", currentTheme);
}