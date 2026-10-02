import React from 'react';
import { errorService } from '../services/errorService.js';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    errorService.report(error, {
      scope: 'ui',
      route: this.props.route ?? null,
      componentStack: info?.componentStack ?? '',
    });
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return this.props.fallback ?? (
      <div className="page">
        <div className="empty">
          <strong>当前页面发生异常</strong>
          <span>已隔离本次页面错误，用户数据不会因此被清理。</span>
          <button className="primary" onClick={this.reset}>返回继续使用</button>
        </div>
      </div>
    );
  }
}
