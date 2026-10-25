// Render dijalankan satu per satu supaya mesin tidak kewalahan.
let renderQueue = Promise.resolve();

export function enqueue(task) {
  const run = renderQueue.then(task, task);
  renderQueue = run.catch(() => {});
  return run;
}
