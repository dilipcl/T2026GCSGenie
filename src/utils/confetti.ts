import confetti from 'canvas-confetti';

export function triggerCelebration(options?: confetti.Options) {
  try {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.7 },
      colors: ['#6366f1', '#22c55e', '#f59e0b', '#06b6d4', '#ec4899'],
      ...options,
    });
  } catch {
    // Graceful fallback if confetti canvas not available
  }
}

export function triggerStreakCelebration(_streakDays?: number) {
  try {
    const end = Date.now() + 1000;
    const colors = ['#f59e0b', '#ef4444', '#6366f1'];

    (function frame() {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: colors,
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: colors,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    })();
  } catch {
    // Ignore
  }
}
