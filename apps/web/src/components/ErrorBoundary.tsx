import { Component, ReactNode } from 'react';

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; message: string; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err.message };
  }

  componentDidCatch(err: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary]', err, info.componentStack);
  }

  reset = () => this.setState({ hasError: false, message: '' });

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-screen bg-studio-bg flex items-center justify-center">
          <div className="bg-studio-surface border border-studio-border rounded-xl p-8 max-w-sm w-full text-center space-y-4">
            <p className="text-gold font-mono text-xs tracking-widest uppercase">Something went wrong</p>
            <p className="text-zinc-500 text-sm">{this.state.message || 'An unexpected error occurred.'}</p>
            <button
              onClick={this.reset}
              className="mt-2 bg-gold/10 border border-gold/20 text-gold text-xs px-5 py-2 rounded-lg hover:bg-gold/20 transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
