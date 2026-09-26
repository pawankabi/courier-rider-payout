import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Receipt, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * StatementErrorBoundary
 * 
 * Prevents blank white screen on public statement view.
 * Displays:
 * - Header: "खाता लेजर (Khatabook Statement)"
 * - Friendly message: "खाता विवरण तैयार हो रहा है... कृपया 1 सेकंड बाद पुनः रीफ़्रेश करें।"
 * - Quick 1-tap reload button
 */
export class StatementErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Khatabook Statement ErrorBoundary captured error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 text-center">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-600 flex items-center justify-center mx-auto text-white shadow-lg shadow-emerald-900/50">
              <Receipt className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                खाता लेजर (Khatabook Statement)
              </h1>
              <p className="text-slate-300 text-sm leading-relaxed">
                खाता विवरण तैयार हो रहा है... कृपया 1 सेकंड बाद पुनः रीफ़्रेश करें।
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full py-3 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold text-sm transition shadow-lg shadow-emerald-900/40 flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4 animate-spin-reverse" />
                <span>पुनः रीफ़्रेश करें (Refresh Statement)</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default StatementErrorBoundary;
