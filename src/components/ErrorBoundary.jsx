import React from 'react';
import { errorService } from '../services/errorService.js';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.recoveryAttempted = false;
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

    // 页面级渲染异常不再弹出阻塞式错误窗口。
    // 先让上层导航回到安全页面，再自动重试一次当前应用树。
    if (!this.recoveryAttempted) {
      this.recoveryAttempted = true;
      this.props.onReset?.();
      setTimeout(() => {
        this.setState({ hasError: false, error: null });
      }, 0);
    }
  }

  reset = () => {
    this.recoveryAttempted = false;
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return this.props.fallback ?? null;
  }
}
