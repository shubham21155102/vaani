import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// Stub a few browser APIs jsdom doesn't ship.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

Object.defineProperty(window, "scrollTo", { value: () => {}, writable: true });

// JSDOM doesn't implement Element.scrollIntoView.
if (!(Element.prototype as Element & { scrollIntoView?: () => void }).scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
}
