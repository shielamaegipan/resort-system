import { useState, useCallback } from 'react';

// const [ask, dialog] = useConfirm();  ...  if (!(await ask({ title, message, confirmText, danger }))) return;  ...  render {dialog}
export function useConfirm() {
  const [state, setState] = useState(null);
  const ask = useCallback((opts) => new Promise((resolve) => setState({ ...opts, resolve })), []);
  const close = (value) => { state.resolve(value); setState(null); };

  const dialog = state && (
    <div className="modal-bg" onClick={() => close(false)}>
      <div className="modal confirm" role="alertdialog" onClick={(e) => e.stopPropagation()}>
        <h2>{state.title || 'Are you sure?'}</h2>
        <p>{state.message}</p>
        <div className="actions end">
          <button onClick={() => close(false)}>{state.cancelText || 'No, keep it'}</button>
          <button className={state.danger ? 'danger-solid' : 'primary'} onClick={() => close(true)}>{state.confirmText || 'Yes'}</button>
        </div>
      </div>
    </div>
  );
  return [ask, dialog];
}
