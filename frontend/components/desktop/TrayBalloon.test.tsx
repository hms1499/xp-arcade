// frontend/components/desktop/TrayBalloon.test.tsx
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { TrayBalloon } from "./TrayBalloon";

// @ts-expect-error -- non-standard React internal flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const props = {
  icon: "🔥",
  title: "Keep your streak",
  body: "Play today's challenge.",
  ctaLabel: "Play now",
  ariaLabel: "Dismiss streak reminder",
};

describe("TrayBalloon", () => {
  it("renders title, body, icon and CTA", () => {
    const html = renderToStaticMarkup(
      <TrayBalloon {...props} onCta={() => {}} onDismiss={() => {}} />,
    );
    expect(html).toContain("Keep your streak");
    expect(html).toContain("Play today&#x27;s challenge.");
    expect(html).toContain("Play now");
    expect(html).toContain("🔥");
  });

  it("fires onCta when CTA button is clicked", () => {
    const onCta = vi.fn();
    const onDismiss = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    let root: Root;
    act(() => {
      root = createRoot(container);
      root.render(
        <TrayBalloon {...props} onCta={onCta} onDismiss={onDismiss} />,
      );
    });
    // Click the CTA button (text "Play now")
    const buttons = container.querySelectorAll("button");
    const ctaBtn = Array.from(buttons).find((b) => b.textContent === "Play now");
    expect(ctaBtn).toBeTruthy();
    act(() => { ctaBtn!.click(); });
    expect(onCta).toHaveBeenCalledOnce();
    act(() => { root.unmount(); });
    document.body.removeChild(container);
  });

  it("fires onDismiss when dismiss button is clicked", () => {
    const onCta = vi.fn();
    const onDismiss = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    let root: Root;
    act(() => {
      root = createRoot(container);
      root.render(
        <TrayBalloon {...props} onCta={onCta} onDismiss={onDismiss} />,
      );
    });
    // Click the dismiss button (aria-label = ariaLabel prop)
    const dismissBtn = container.querySelector(`[aria-label="${props.ariaLabel}"]`) as HTMLButtonElement;
    expect(dismissBtn).toBeTruthy();
    act(() => { dismissBtn.click(); });
    expect(onDismiss).toHaveBeenCalledOnce();
    act(() => { root.unmount(); });
    document.body.removeChild(container);
  });
});
