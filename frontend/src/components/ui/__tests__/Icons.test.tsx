import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import * as Icons from "../Icons";

// Every icon should:
//  1. Render an <svg> with the shared defaults (viewBox, stroke).
//  2. Accept and apply a custom className (so Tailwind sizing works).
//  3. Forward arbitrary SVG props (data-testid, aria-label, etc.).
describe("Icon components", () => {
  const iconNames = Object.keys(Icons).filter((k) => /Icon$/.test(k));

  it("exports at least one icon", () => {
    expect(iconNames.length).toBeGreaterThan(0);
  });

  for (const name of Object.keys(Icons)) {
    if (!/Icon$/.test(name)) continue;
    const Component = (Icons as Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>>)[name];

    it(`${name} renders an accessible svg and forwards className`, () => {
      const { container } = render(
        <Component className="h-7 w-7 text-red-500" data-testid={`icon-${name}`} />,
      );
      const svg = container.querySelector("svg");
      expect(svg).toBeTruthy();
      expect(svg?.getAttribute("class")).toContain("h-7 w-7");
      expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
      expect(svg?.getAttribute("data-testid")).toBe(`icon-${name}`);
    });
  }
});
