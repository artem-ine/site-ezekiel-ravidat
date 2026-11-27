/**
 * Load at most a couple of cover images per animation frame so nearby
 * shelves do not stall the main thread with a burst of decodes.
 */

type Job = {
  url: string;
  done: (image: HTMLImageElement | null) => void;
};

const queue: Job[] = [];
const cache = new Map<string, HTMLImageElement | null>();
let pumping = false;
let inFlight = 0;
const MAX_IN_FLIGHT = 2;

function pump() {
  pumping = true;
  while (inFlight < MAX_IN_FLIGHT && queue.length > 0) {
    const job = queue.shift()!;
    const hit = cache.get(job.url);
    if (hit !== undefined) {
      job.done(hit);
      continue;
    }
    inFlight += 1;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      cache.set(job.url, image);
      inFlight -= 1;
      job.done(image);
      schedule();
    };
    image.onerror = () => {
      cache.set(job.url, null);
      inFlight -= 1;
      if (process.env.NODE_ENV === "development") {
        console.warn("[room] cover texture failed:", job.url);
      }
      job.done(null);
      schedule();
    };
    image.src = job.url;
  }
  pumping = false;
  if (queue.length > 0 || inFlight > 0) schedule();
}

function schedule() {
  if (pumping) return;
  requestAnimationFrame(pump);
}

export function enqueueCover(
  url: string,
  done: (image: HTMLImageElement | null) => void,
): () => void {
  const cached = cache.get(url);
  if (cached !== undefined) {
    done(cached);
    return () => {};
  }
  const job: Job = { url, done };
  queue.push(job);
  schedule();
  return () => {
    const index = queue.indexOf(job);
    if (index >= 0) queue.splice(index, 1);
  };
}
