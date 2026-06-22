import { describe, it, expect, afterEach } from "vitest";
import { getFocusable } from "./useFocusTrap";

function mount(html: string): HTMLElement {
  const div = document.createElement("div");
  div.innerHTML = html;
  document.body.appendChild(div);
  return div;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("getFocusable", () => {
  it("collects buttons, links, and inputs in document order", () => {
    const c = mount(
      `<a href="#">one</a><button>two</button><input /><textarea></textarea>`,
    );
    const tags = getFocusable(c).map((el) => el.tagName.toLowerCase());
    expect(tags).toEqual(["a", "button", "input", "textarea"]);
  });

  it("skips disabled controls", () => {
    const c = mount(`<button>ok</button><button disabled>no</button>`);
    expect(getFocusable(c)).toHaveLength(1);
  });

  it("respects tabindex: includes 0, excludes -1", () => {
    const c = mount(
      `<div tabindex="0">in</div><div tabindex="-1">out</div>`,
    );
    const texts = getFocusable(c).map((el) => el.textContent);
    expect(texts).toEqual(["in"]);
  });

  it("returns an empty list when nothing is focusable", () => {
    const c = mount(`<p>just text</p>`);
    expect(getFocusable(c)).toEqual([]);
  });
});
