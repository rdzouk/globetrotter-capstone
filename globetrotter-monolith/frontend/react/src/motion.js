/**
 * Motion primitives modelled on Apple's "Designing Fluid Interfaces": springs
 * described by damping ratio and response rather than a fixed duration,
 * momentum projection, and rubber-banding.
 *
 * Springs run from the live on-screen value and keep their velocity when
 * re-targeted, so a gesture can grab and reverse a moving element without the
 * jump or the sudden stop that replacing one animation with another causes.
 */

const REST_DISTANCE = 0.25;
const REST_VELOCITY = 6;
const MAX_FRAME = 0.064;
const SUB_STEP = 1 / 240;

export function reducedMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Resting point of a flick, matching scroll deceleration rather than v^2/2a. */
export function project(velocity, decelerationRate = 0.998) {
  if (!Number.isFinite(velocity) || decelerationRate <= 0 || decelerationRate >= 1) return 0;
  return (velocity / 1000) * decelerationRate / (1 - decelerationRate);
}

/** Progressive resistance past a boundary, so an edge resists instead of freezing. */
export function rubberband(overshoot, dimension, constant = 0.55) {
  if (!Number.isFinite(overshoot) || !Number.isFinite(dimension) || dimension <= 0) return 0;
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** Keeps a short position history so a release can hand its velocity to a spring. */
export function velocityTracker(windowMs = 100) {
  const samples = [];
  return {
    add(position, time = performance.now()) {
      samples.push({ position, time });
      while (samples.length > 2 && time - samples[0].time > windowMs) samples.shift();
    },
    velocity() {
      if (samples.length < 2) return 0;
      const latest = samples[samples.length - 1];
      const oldest = samples[0];
      const seconds = (latest.time - oldest.time) / 1000;
      return seconds > 0 ? (latest.position - oldest.position) / seconds : 0;
    },
    reset() { samples.length = 0; },
  };
}

/**
 * `damping` 1 settles without overshoot; lower values bounce and suit motion a
 * gesture already threw. `response` is how quickly it reaches the target in
 * seconds, not a duration: the settle time emerges from the physics.
 */
export function spring({ from, to, velocity = 0, damping = 1, response = 0.4, onUpdate, onRest }) {
  let value = Number.isFinite(from) ? from : 0;
  let speed = Number.isFinite(velocity) ? velocity : 0;
  let target = Number.isFinite(to) ? to : 0;
  let frame = 0;

  const finish = () => {
    value = target;
    speed = 0;
    frame = 0;
    onUpdate(value);
    onRest?.(value);
  };

  const handle = {
    stop() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    },
    /** Re-aims without resetting position or velocity, so reversals stay smooth. */
    retarget(next, nextVelocity) {
      target = Number.isFinite(next) ? next : target;
      if (Number.isFinite(nextVelocity)) speed = nextVelocity;
      if (!frame) start();
    },
    get value() { return value; },
    get velocity() { return speed; },
  };

  function start() {
    let previous = performance.now();
    const step = now => {
      const elapsed = Math.min((now - previous) / 1000, MAX_FRAME);
      previous = now;
      const omega = (2 * Math.PI) / response;
      for (let remaining = elapsed; remaining > 0; remaining -= SUB_STEP) {
        const delta = Math.min(remaining, SUB_STEP);
        speed += (-omega * omega * (value - target) - 2 * damping * omega * speed) * delta;
        value += speed * delta;
      }
      if (Math.abs(value - target) < REST_DISTANCE && Math.abs(speed) < REST_VELOCITY) { finish(); return; }
      onUpdate(value);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }

  onUpdate(value);
  if (response <= 0 || reducedMotion()) finish();
  else start();
  return handle;
}
