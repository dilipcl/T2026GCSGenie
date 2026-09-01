import React from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';

/**
 * Keeps one broken thing from taking the whole app with it.
 *
 * React's answer to a throw during render is to unmount the entire tree. With
 * nothing catching it the screen goes black - no header, no navigation, no
 * message, and no way back except a reload the user has to think to try. That
 * is what a misplaced `useMemo` in the check-in dialog did: tapping Check In
 * changed the hook count, React threw, and the app disappeared. The defect was
 * one line; the damage was total, and only because nothing stood between it and
 * the root.
 *
 * So the tree is divided into places where a failure is survivable. A view that
 * throws leaves the header and the tabs alone, so the student can move to
 * another screen and carry on. A modal that throws leaves the screen beneath it
 * intact. Only a failure outside all of those reaches the root boundary, which
 * is the one that has to say "reload".
 *
 * Two things this deliberately does not do:
 *
 *  - It does not catch errors from event handlers, timers or promises. React
 *    boundaries never see those. The write path already has its own answer:
 *    `ChangeGuardProvider` catches a failed `run()`, says so in a toast, and
 *    logs nothing to the family feed.
 *  - It does not hide the error. Whatever it caught goes to the console in
 *    full, with the component stack, because a boundary that swallows the
 *    diagnosis is worse than the blank screen it replaced.
 */

type Variant = 'page' | 'panel' | 'overlay';

interface Props {
  children: React.ReactNode;
  /**
   * What broke, named the way the person reading it would name it - "the
   * check-in", "this screen". Goes straight into the sentence shown.
   */
  label: string;
  /**
   * Changing any of these clears the error and renders the children again.
   * Switching tabs, or closing the dialog that failed, should get a fresh
   * attempt rather than a panel that stays broken until the app is reloaded.
   */
  resetKeys?: unknown[];
  /**
   * Run when the user asks to recover. For a modal this is what closes it -
   * a crashed dialog has no working close button of its own.
   */
  onReset?: () => void;
  variant?: Variant;
}

interface State {
  error: Error | null;
  /** The reset keys as they were when the error was caught. */
  keys: unknown[] | undefined;
}

/**
 * Exported for its test. This is the part that decides whether a boundary lets
 * go of an error, and getting it wrong is silent in both directions: too eager
 * and the fallback flickers past before it can be read, too reluctant and the
 * panel stays broken until the app is reloaded, which is the failure the
 * boundary existed to prevent.
 */
export function sameKeys(a: unknown[] | undefined, b: unknown[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((value, i) => Object.is(value, b[i]));
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, keys: undefined };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (!state.error) {
      return sameKeys(state.keys, props.resetKeys) ? null : { keys: props.resetKeys };
    }
    // Broken, but the thing it depended on has moved on - try again.
    if (!sameKeys(state.keys, props.resetKeys)) {
      return { error: null, keys: props.resetKeys };
    }
    return null;
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[${this.props.label}] stopped rendering:`, error, info.componentStack);
  }

  private retry = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { label, variant = 'panel', onReset } = this.props;

    const body = (
      <div
        role="alert"
        className="w-full max-w-md rounded-2xl border border-amber-500/60 bg-amber-950/95 backdrop-blur px-4 py-4 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-300 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-amber-100">
              {variant === 'page' ? 'Genie hit a problem' : `Something went wrong in ${label}`}
            </h2>
            <p className="text-[11px] text-amber-100/90 mt-0.5 leading-snug">
              {variant === 'page'
                ? 'Nothing has been lost — your data is still on this device. Reloading should clear it.'
                : 'Nothing has been saved or changed. The rest of the app still works.'}
            </p>
            {/* The message itself, so a report can name the fault rather than
                describing the colour of the box it appeared in. */}
            <p className="text-[10px] text-amber-200/70 mt-1.5 font-mono break-words">
              {error.message}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3">
          {variant === 'page' ? (
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reload</span>
            </button>
          ) : (
            <button
              onClick={this.retry}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all"
            >
              {onReset ? <X className="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5" />}
              <span>{onReset ? 'Close it' : 'Try again'}</span>
            </button>
          )}
        </div>
      </div>
    );

    if (variant === 'page') {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">{body}</div>
      );
    }

    if (variant === 'overlay') {
      return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          {body}
        </div>
      );
    }

    return <div className="py-6 flex justify-center">{body}</div>;
  }
}
