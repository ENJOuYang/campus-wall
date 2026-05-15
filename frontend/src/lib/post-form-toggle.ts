import React from "react";

let _listeners: Array<() => void> = [];
let _visible = false;

export function togglePostForm() {
  _visible = !_visible;
  _listeners.forEach((fn) => fn());
}

export function hidePostForm() {
  if (_visible) {
    _visible = false;
    _listeners.forEach((fn) => fn());
  }
}

export function usePostFormVisible(): boolean {
  const [visible, setVisible] = React.useState(_visible);
  React.useEffect(() => {
    const fn = () => setVisible(_visible);
    _listeners.push(fn);
    return () => { _listeners = _listeners.filter((l) => l !== fn); };
  }, []);
  return visible;
}
