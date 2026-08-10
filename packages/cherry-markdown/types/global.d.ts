import Mermaid from 'mermaid';
import katex from 'katex';

// for IE
export {};

declare global {
  const BUILD_ENV: string;
  interface Window {
    // for IE
    clipboardData: ClipboardEvent['clipboardData'];
    mermaid?: typeof Mermaid;
    mermaidAPI?: (typeof Mermaid)['mermaidAPI'];
    echarts?: echarts.ECharts;
    MathJax?: any;
    katex?: katex;
  }

  interface HTMLDivElement {
    _cleanupResize?: (() => void) | null;
  }

  interface HTMLSpanElement {
    _clickX?: number;
  }

  interface CaretPosition {
    offsetNode: Node;
    offset: number;
  }

  interface Document {
    caretPositionFromPoint?: (x: number, y: number) => CaretPosition | null;
  }
}
