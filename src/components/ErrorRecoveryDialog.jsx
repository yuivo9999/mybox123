import React from 'react';
import { AlertCircle, X } from 'lucide-react';
import './errorRecoveryDialog.css';

export function ErrorRecoveryDialog({ onReturn }) {
  return (
    <div className="error-recovery-backdrop" role="presentation">
      <div className="error-recovery-dialog" role="alertdialog" aria-modal="true" aria-labelledby="error-recovery-title" aria-describedby="error-recovery-message">
        <button className="error-recovery-close" type="button" aria-label="关闭" onClick={onReturn}>
          <X size={18} />
        </button>
        <div className="error-recovery-icon" aria-hidden="true"><AlertCircle size={24} /></div>
        <div className="error-recovery-copy">
          <strong id="error-recovery-title">当前页面发生异常</strong>
          <span id="error-recovery-message">已隔离本次页面错误，用户数据不会因此被清理。</span>
        </div>
        <button className="primary error-recovery-action" type="button" onClick={onReturn}>返回继续使用</button>
      </div>
    </div>
  );
}
