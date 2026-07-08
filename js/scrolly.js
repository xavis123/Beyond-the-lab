// ===== scrolly.js: IntersectionObserver for scroll-triggered updates =====

function initScrolly() {
  var steps = document.querySelectorAll(".story-step");

  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        var stepNum = parseInt(entry.target.getAttribute("data-step"), 10);

        // Avoid redundant updates
        if (state.currentStep === stepNum) return;

        state.currentStep = stepNum;
        dispatch.call("stepChanged", null, stepNum);

        // Visual feedback: mark active step
        steps.forEach(function(s) { s.classList.remove("active"); });
        entry.target.classList.add("active");
      }
    });
  }, {
    root: null,
    rootMargin: "-30% 0px -40% 0px",
    threshold: 0.1
  });

  steps.forEach(function(step) {
    observer.observe(step);
  });
}
