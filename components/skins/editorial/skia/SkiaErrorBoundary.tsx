import { Component, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** Rendered if a Skia subtree throws at mount/render. Defaults to nothing. */
  fallback?: ReactNode;
};

type State = { failed: boolean };

/**
 * Catches render-time failures from Skia subtrees (e.g. the native view is not
 * registered in this runtime) and renders `fallback` instead. Editorial Skia
 * effects are decorative, so the fallback is typically `null` (overlay simply
 * disappears) while the underlying content keeps rendering on its own.
 */
export class SkiaErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
