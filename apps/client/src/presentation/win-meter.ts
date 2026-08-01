/** DOM count-up for win meters. */
export function countUpElement(
  el: HTMLElement,
  to: number,
  ms = 600,
  formatter: (n: number) => string = (n) => n.toLocaleString(),
): Promise<void> {
  return new Promise((resolve) => {
    const from = 0;
    if (to <= 0) {
      el.textContent = formatter(0);
      resolve();
      return;
    }
    const start = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = Math.floor(from + (to - from) * eased);
      el.textContent = formatter(v);
      if (t < 1) requestAnimationFrame(tick);
      else {
        el.textContent = formatter(to);
        resolve();
      }
    };
    requestAnimationFrame(tick);
  });
}
