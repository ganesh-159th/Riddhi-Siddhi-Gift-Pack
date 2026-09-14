import { Component } from "react";
import { withTranslation } from "react-i18next";

class ErrorBoundary extends Component {
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
    const { t, title } = this.props;
    if (this.state.hasError) {
      return (
        <div className="mx-auto max-w-xl px-4 py-14 text-center sm:px-6 sm:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold-400">
            {title || t("errorBoundary.title")}
          </p>
          <h2 className="font-display mt-4 text-2xl font-bold text-white">
            {t("errorBoundary.heading")}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            {t("errorBoundary.body")}
          </p>
          <button
            onClick={this.handleReset}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-gold-500 px-6 py-3 text-sm font-semibold text-navy-950 transition hover:brightness-110"
          >
            {t("errorBoundary.retry")}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default withTranslation()(ErrorBoundary);