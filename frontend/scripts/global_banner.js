const banner = document.getElementById('banner');
const isBannerDismissed = localStorage.getItem('bannerDismissed') === 'true';

// If the banner was previously dismissed, hide it.
if (isBannerDismissed && banner) {
  banner.classList.add('hidden');
}

// Function to hide the banner and remember that it was dismissed.
window.dismissBanner = () => {
  if (banner) {
    banner.classList.add('hidden');
    localStorage.setItem('bannerDismissed', 'true');
  }
};

document.getElementById("mainToggle").addEventListener("click", function(event) {
  event.preventDefault();
  document.querySelector("main").classList.toggle("notLimitedTo768p");
});