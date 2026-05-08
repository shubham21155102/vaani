import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { VoiceWave } from "./VoiceWave";

describe("VoiceWave", () => {
  it("renders 5 bars by default", () => {
    const { container } = render(<VoiceWave level={0.5} />);
    expect(container.querySelectorAll("span").length).toBe(5);
  });

  it("respects bars prop", () => {
    const { container } = render(<VoiceWave level={0.5} bars={9} />);
    expect(container.querySelectorAll("span").length).toBe(9);
  });

  it.each([
    ["accent", "bg-accent"],
    ["ok", "bg-ok"],
    ["muted", "bg-border"],
  ] as const)("color=%s applies %s", (color, expected) => {
    const { container } = render(<VoiceWave level={0.5} color={color} />);
    const bar = container.querySelectorAll("span")[0];
    expect(bar.className).toContain(expected);
  });

  it("applies custom className", () => {
    const { container } = render(<VoiceWave level={0.5} className="extra-cls" />);
    expect(container.firstChild).toHaveClass("extra-cls");
  });

  it("inactive bars have low opacity", () => {
    const { container } = render(<VoiceWave level={0} active={false} />);
    const style = (container.querySelectorAll("span")[0] as HTMLElement).style;
    expect(parseFloat(style.opacity)).toBeLessThan(0.6);
  });
});
