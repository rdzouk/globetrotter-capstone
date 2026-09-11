import { useCallback, useEffect, useRef, useState } from 'react';
import { project, rubberband, spring, velocityTracker } from './motion';

const PHONE_QUERY = '(max-width: 760px)';
const FLICK_VELOCITY = 600;
const DISMISS_FRACTION = 0.4;

const isPhone = () => window.matchMedia(PHONE_QUERY).matches;

/**
 * Presents a dialog as a draggable sheet on phones and a centred panel on
 * larger screens. Motion is expressed as a single "hidden" value (0 presented,
 * 1 dismissed) so a drag, its release and the settle animation are the same
 * continuous quantity, and grabbing a moving sheet simply takes over from
 * wherever it currently sits.
 */
export function useSheet(dialogRef, onDismiss) {
  const [settled, setSettled] = useState(false);
  const state = useRef({ animation: null, drag: null, hidden: 1, dismissing: false });
  const tracker = useRef(velocityTracker());
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  const paint = useCallback(hidden => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    state.current.hidden = hidden;
    const height = dialog.offsetHeight || 1;
    dialog.style.setProperty('--sheet-dim', String(Math.max(0, Math.min(1, 1 - hidden))));
    dialog.style.opacity = isPhone() ? '1' : String(Math.max(0, Math.min(1, 1 - hidden)));
    dialog.style.transform = isPhone()
      ? `translate3d(0, ${hidden * height}px, 0)`
      : `translate3d(0, ${hidden * 10}px, 0) scale(${1 - hidden * 0.03})`;
  }, [dialogRef]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    paint(1);
    const animation = spring({ from: 1, to: 0, damping: 1, response: 0.35, onUpdate: paint, onRest: () => setSettled(true) });
    state.current.animation = animation;
    return () => {
      animation.stop();
      state.current.animation?.stop();
      dialog.close();
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [dialogRef, paint]);

  const dismiss = useCallback((velocity = 0) => {
    if (state.current.dismissing) return;
    state.current.dismissing = true;
    const height = dialogRef.current?.offsetHeight || 1;
    state.current.animation?.stop();
    state.current.animation = spring({
      from: state.current.hidden, to: 1, velocity: velocity / height,
      damping: 1, response: 0.28, onUpdate: paint, onRest: () => dismissRef.current(),
    });
  }, [dialogRef, paint]);

  const onPointerDown = useCallback(event => {
    if (!isPhone() || event.button > 0 || state.current.dismissing) return;
    const height = dialogRef.current?.offsetHeight || 1;
    state.current.animation?.stop();
    state.current.drag = { pointerId: event.pointerId, startY: event.clientY, startOffset: state.current.hidden * height, height };
    tracker.current.reset();
    tracker.current.add(event.clientY, event.timeStamp);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [dialogRef]);

  const onPointerMove = useCallback(event => {
    const drag = state.current.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    tracker.current.add(event.clientY, event.timeStamp);
    const offset = drag.startOffset + (event.clientY - drag.startY);
    paint((offset >= 0 ? offset : -rubberband(-offset, drag.height)) / drag.height);
  }, [paint]);

  const onPointerEnd = useCallback(event => {
    const drag = state.current.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    state.current.drag = null;
    const velocity = tracker.current.velocity();
    const offset = state.current.hidden * drag.height;
    if (offset + project(velocity) > drag.height * DISMISS_FRACTION || velocity > FLICK_VELOCITY) { dismiss(velocity); return; }
    state.current.animation?.stop();
    state.current.animation = spring({
      from: state.current.hidden, to: 0, velocity: velocity / drag.height,
      damping: 0.8, response: 0.3, onUpdate: paint,
    });
  }, [dismiss, paint]);

  return { settled, dismiss, grabProps: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd } };
}
