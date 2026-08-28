import { useEffect, useRef } from 'react';

/**
 * Every real modal in the app closed on a backdrop click but ignored Escape,
 * which is the keyboard-and-screen-reader way out of a dialog. This is the one
 * place that behaviour lives.
 *
 * The stack matters. A modal frequently opens the shared confirm dialog on top
 * of itself ("Delete this goal?"), and both listen on `window`. Without an
 * ordering rule a single Escape would cancel the confirm *and* close the modal
 * underneath it, losing the form the parent was halfway through. Only the layer
 * registered last responds; the ones beneath it wait their turn.
 */
const layers: symbol[] = [];

export function useEscapeToClose(isOpen: boolean, onClose: () => void) {
  // Callers pass an inline arrow, so `onClose` is a new function on every
  // render. Held in a ref, the subscription depends on `isOpen` alone -
  // otherwise a re-render of a background modal would re-push it and steal
  // Escape from the dialog stacked above it.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    const layer = Symbol('dismissable');
    layers.push(layer);

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (layers[layers.length - 1] !== layer) return;
      event.stopPropagation();
      onCloseRef.current();
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const index = layers.lastIndexOf(layer);
      if (index !== -1) layers.splice(index, 1);
    };
  }, [isOpen]);
}
