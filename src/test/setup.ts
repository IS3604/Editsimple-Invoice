import '@testing-library/jest-dom/vitest';

// jsdom lacks a few browser APIs used by Radix / cmdk.
if (typeof window !== 'undefined') {
  class RO { observe() {} unobserve() {} disconnect() {} }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver ??= RO;
  Element.prototype.scrollIntoView ??= function scrollIntoView() {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
}
