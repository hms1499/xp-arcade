import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { ChallengeDialog } from "./ChallengeDialog";
import type { Challenge } from "@/lib/challenge-link";

// @ts-expect-error -- React act flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const ADDR = "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV";
const C: Challenge = { gameId: "snake", target: 150, by: ADDR };

let root: Root | null = null;
let container: HTMLDivElement | null = null;
afterEach(() => {
  if (root && container) act(() => root!.unmount());
  container?.remove();
  root = null; container = null;
});

describe("ChallengeDialog", () => {
  it("renders the challenger, target, game, and both actions", () => {
    const html = renderToStaticMarkup(
      <ChallengeDialog challenge={C} onAccept={() => {}} onDecline={() => {}} />,
    );
    expect(html).toContain("150");
    expect(html).toContain("Snake");
    expect(html).toContain("SP2CM"); // shortAddress head
    expect(html).toContain("Accept &amp; Play");
    expect(html).toContain("Maybe later");
  });

  it("reads 'A friend' when by is absent", () => {
    const html = renderToStaticMarkup(
      <ChallengeDialog challenge={{ gameId: "snake", target: 150 }} onAccept={() => {}} onDecline={() => {}} />,
    );
    expect(html).toContain("A friend");
  });

  it("fires onAccept and onDecline", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const onAccept = vi.fn(); const onDecline = vi.fn();
    act(() => {
      root!.render(<ChallengeDialog challenge={C} onAccept={onAccept} onDecline={onDecline} />);
    });
    const buttons = Array.from(container.querySelectorAll("button"));
    const accept = buttons.find((b) => b.textContent?.includes("Accept"))!;
    const later = buttons.find((b) => b.textContent?.includes("Maybe later"))!;
    act(() => accept.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    act(() => later.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onDecline).toHaveBeenCalledTimes(1);
  });
});
