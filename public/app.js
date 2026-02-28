document.querySelectorAll(".manim-video").forEach((video) => {
  video.addEventListener("click", () => {
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  });
});

window.addEventListener("load", () => {
  if (window.tikzjax && typeof window.tikzjax.process === "function") {
    window.tikzjax.process();
  }
});
