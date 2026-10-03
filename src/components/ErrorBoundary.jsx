import React from 'react';
import { errorService } from '../services/errorService.js';
import { ErrorRecoveryDialog } from './ErrorRecoveryDialog.jsx';

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
    return this.props.fallback ?? <ErrorRecoveryDialog onReturn={this.reset} />;
  }
}
