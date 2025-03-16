const element = document.querySelector('.animating');
const text = element.textContent;
let index = 0;

// Clear the text content
element.textContent = '';

// Function to display text letter by letter
function animateText() {
  if (index < text.length) {
    element.textContent += text[index];
    index++;
    setTimeout(animateText, 50); // Adjust speed to 0.5 seconds
  }
}

// Start the animation after a 0.5-second delay
setTimeout(animateText, 500);
