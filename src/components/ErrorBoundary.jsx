import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught an error:", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto max-w-xl px-4 py-14 text-center sm:px-6 sm:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold-400">
            {this.props.title || "Something went wrong"}
          </p>
          <h2 className="font-display mt-4 text-2xl font-bold text-white">
            This section could not be displayed.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            An unexpected error occurred while loading this part of the page.
          </p>
          <button
            onClick={this.handleReset}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-gold-500 px-6 py-3 text-sm font-semibold text-navy-950 transition hover:brightness-110"
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
