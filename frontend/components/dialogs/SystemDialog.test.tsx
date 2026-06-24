import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SystemDialog } from "./SystemDialog";

function noop() {}

describe("SystemDialog", () => {
  it("renders the title and message", () => {
    const html = renderToStaticMarkup(
      <SystemDialog
        kind="warning"
        title="Shut Down"
        message="Are you sure you want to shut down XP Arcade?"
        onOk={noop}
        onCancel={noop}
      />,
    );
    expect(html).toContain("Shut Down");
    expect(html).toContain("Are you sure you want to shut down XP Arcade?");
  });

  it("renders default OK and Cancel labels", () => {
    const html = renderToStaticMarkup(
      <SystemDialog kind="info" title="T" message="M" onOk={noop} onCancel={noop} />,
    );
    expect(html).toContain("OK");
    expect(html).toContain("Cancel");
  });

  it("honors custom button labels", () => {
    const html = renderToStaticMarkup(
      <SystemDialog
        kind="info"
        title="T"
        message="M"
        okLabel="Yes"
        cancelLabel="No"
        onOk={noop}
        onCancel={noop}
      />,
    );
    expect(html).toContain("Yes");
    expect(html).toContain("No");
  });
});
