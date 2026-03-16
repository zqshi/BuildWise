import { Component, type ErrorInfo, type ReactNode } from "react";
import { formatRenderError } from "../shared/renderErrorFormatter";

type ViewErrorBoundaryProps = {
  children: ReactNode;
  viewKey: string;
  viewLabel: string;
};

type ViewErrorBoundaryState = {
  error: unknown;
};

export class ViewErrorBoundary extends Component<ViewErrorBoundaryProps, ViewErrorBoundaryState> {
  state: ViewErrorBoundaryState = {
    error: null
  };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error(`[buildwise] ${this.props.viewLabel} render failed`, error, errorInfo);
  }

  componentDidUpdate(prevProps: ViewErrorBoundaryProps) {
    if (prevProps.viewKey !== this.props.viewKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }
    const detail = formatRenderError(this.state.error);
    return (
      <section className="panel view-error-panel" role="alert">
        <div className="panel-head">
          <h2>{this.props.viewLabel}加载失败</h2>
        </div>
        <div className="view-error-content">
          <p className="view-error-summary">当前视图发生前端渲染异常，已阻止整页白屏。</p>
          <dl className="view-error-meta">
            <div>
              <dt>错误类型</dt>
              <dd>{detail.title}</dd>
            </div>
            <div>
              <dt>错误信息</dt>
              <dd>{detail.message}</dd>
            </div>
          </dl>
          <button
            type="button"
            className="btn ghost mini"
            onClick={() => this.setState({ error: null })}
          >
            重试渲染
          </button>
        </div>
      </section>
    );
  }
}
