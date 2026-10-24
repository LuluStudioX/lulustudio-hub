/* cursor.js - a dot grid revealed by a spotlight that follows the mouse.
   Ported from cv-lulustudio (recolored to the hub accent in css/styles.css).
   Mouse-only and skipped when the user prefers reduced motion. */
(function () {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasFinePointer = window.matchMedia('(pointer: fine)').matches;
  if (prefersReducedMotion || !hasFinePointer) return;

  const grid = document.createElement('div');
  grid.className = 'dot-grid';
  grid.setAttribute('aria-hidden', 'true');
  document.body.appendChild(grid);

  const EASING = 0.1; // how quickly the spotlight catches up to the cursor
  const root = document.documentElement;
  let targetX = -999;
  let targetY = -999;
  let currentX = -999;
  let currentY = -999;
  let frame = null;

  document.addEventListener('mousemove', onMouseMove);

  function onMouseMove(event) {
    targetX = (event.clientX / window.innerWidth) * 100;
    targetY = (event.clientY / window.innerHeight) * 100;
    if (!frame) frame = requestAnimationFrame(followCursor);
  }

  function followCursor() {
    frame = null;
    currentX += (targetX - currentX) * EASING;
    currentY += (targetY - currentY) * EASING;
    root.style.setProperty('--mx', currentX.toFixed(2) + '%');
    root.style.setProperty('--my', currentY.toFixed(2) + '%');
    if (Math.abs(targetX - currentX) > 0.1 || Math.abs(targetY - currentY) > 0.1) {
      frame = requestAnimationFrame(followCursor);
    }
  }
})();
