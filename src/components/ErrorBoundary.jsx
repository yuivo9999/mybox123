import React from 'react';
import { errorService } from '../services/errorService.js';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.lastRecoverySignature = null;
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

    // 不再静默吞掉渲染异常：此前 fallback=null 会把运行时错误表现成整页黑屏。
    // 保留错误状态，让用户能看到真实异常并主动重试；这样才能定位后续回归。
  }

  reset = () => {
    this.lastRecoverySignature = null;
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    const message = this.state.error?.message || String(this.state.error || '未知渲染错误');
    return (
      <main className="page error-boundary-page">
        <section className="error-boundary-card" role="alert">
          <span className="eyebrow">TVBOX REACT · RUNTIME ERROR</span>
          <h1>页面渲染失败</h1>
          <p>应用没有继续显示黑屏。请先返回上一级，或重试当前页面。</p>
          <pre>{message}</pre>
          <div className="actions">
            <button className="secondary" type="button" onClick={this.reset}>重试</button>
            {this.props.onReset && (
              <button className="primary" type="button" onClick={this.reset}>返回安全页面</button>
            )}
          </div>
        </section>
      </main>
    );
  }
}
