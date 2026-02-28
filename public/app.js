// Video click to play/pause
document.querySelectorAll(".manim-video").forEach((video) => {
  video.addEventListener("click", () => {
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  });
});

// TikZJax processing
window.addEventListener("load", () => {
  if (window.tikzjax && typeof window.tikzjax.process === "function") {
    window.tikzjax.process();
  }
});

// Carousel control
function initCarousel() {
  const track = document.querySelector('.carousel-track');
  const prevBtn = document.querySelector('.carousel-prev');
  const nextBtn = document.querySelector('.carousel-next');

  if (!track || !prevBtn || !nextBtn) return;

  let position = 0;

  function getCardWidth() {
    const card = track.querySelector('.card');
    if (!card) return 200;
    const style = getComputedStyle(track);
    const gap = parseInt(style.gap) || 16;
    return card.offsetWidth + gap;
  }

  function getVisibleCards() {
    const carousel = track.parentElement;
    const cardWidth = getCardWidth();
    return Math.floor(carousel.offsetWidth / cardWidth);
  }

  prevBtn.addEventListener('click', () => {
    const cardWidth = getCardWidth();
    position = Math.min(position + cardWidth, 0);
    track.style.transform = `translateX(${position}px)`;
  });

  nextBtn.addEventListener('click', () => {
    const cardWidth = getCardWidth();
    const totalCards = track.querySelectorAll('.card').length;
    const visibleCards = getVisibleCards();
    const maxScroll = -((totalCards - visibleCards) * cardWidth);
    position = Math.max(position - cardWidth, maxScroll);
    track.style.transform = `translateX(${position}px)`;
  });
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initCarousel();
});
