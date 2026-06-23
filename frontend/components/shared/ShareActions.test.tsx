import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// @ts-expect-error -- React act flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/state/wallet", () => ({
  useWallet: (sel: (s: { address: string | null }) => unknown) =>
    sel({ address: "SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV" }),
}));

import { ShareActions } from "./ShareActions";

let root: Root; let container: HTMLDivElement;
const writeText = vi.fn().mockResolvedValue(undefined);
beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText } });
  writeText.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("ShareActions challenge button", () => {
  it("copies a challenge deep link with game and score", async () => {
    act(() => root.render(<ShareActions gameId="snake" score={150} />));
    const btn = Array.from(container.querySelectorAll("button"))
      .find((b) => b.textContent?.includes("Challenge a friend"))!;
    await act(async () => {
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    const url = writeText.mock.calls[0][0] as string;
    expect(url).toContain("challenge=snake");
    expect(url).toContain("score=150");
  });
});
