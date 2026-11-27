"use client";

import { Component, type ReactNode } from "react";

type Props = {
  fallback: ReactNode;
  children: ReactNode;
};

type State = {
  failed: boolean;
};

/** If WebGL cannot start, show the calm flat shelves instead of a blank error. */
export class RoomErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

export function canCreateWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2") ||
        canvas.getContext("webgl") ||
        canvas.getContext("experimental-webgl"),
    );
  } catch {
    return false;
  }
}
