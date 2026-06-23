// frontend/components/shared/ChallengeBanner.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { ChallengeBanner } from "./ChallengeBanner";
import type { Challenge } from "@/lib/challenge-link";

// @ts-expect-error -- React act flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const C: Challenge = { gameId: "snake", target: 150, by: undefined };

let root: Root | null = null;
let container: HTMLDivElement | null = null;
afterEach(() => {
  if (root && container) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("ChallengeBanner", () => {
  it("renders nothing for a different game", () => {
    const html = renderToStaticMarkup(
      <ChallengeBanner challenge={C} status="accepted" gameId="tetris" score={0} sessionBest={0} onMet={() => {}} />,
    );
    expect(html).toBe("");
  });

  it("renders the target while accepted and below target", () => {
    const html = renderToStaticMarkup(
      <ChallengeBanner challenge={C} status="accepted" gameId="snake" score={20} sessionBest={20} onMet={() => {}} />,
    );
    expect(html).toContain("150");
    expect(html.toLowerCase()).toContain("beat");
  });

  it("shows crushed copy when status is met", () => {
    const html = renderToStaticMarkup(
      <ChallengeBanner challenge={C} status="met" gameId="snake" score={200} sessionBest={200} onMet={() => {}} />,
    );
    expect(html.toLowerCase()).toContain("crushed");
  });

  it("calls onMet once when the run reaches the target", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const onMet = vi.fn();
    act(() => {
      root!.render(
        <ChallengeBanner challenge={C} status="accepted" gameId="snake" score={150} sessionBest={0} onMet={onMet} />,
      );
    });
    expect(onMet).toHaveBeenCalledTimes(1);
  });

  it("does not call onMet below the target", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const onMet = vi.fn();
    act(() => {
      root!.render(
        <ChallengeBanner challenge={C} status="accepted" gameId="snake" score={100} sessionBest={100} onMet={onMet} />,
      );
    });
    expect(onMet).not.toHaveBeenCalled();
  });
});
