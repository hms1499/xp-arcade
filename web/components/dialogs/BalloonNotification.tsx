"use client";
import { useToasts } from "@/state/toasts";

export function Balloons() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);

  return (
    <div className="fixed bottom-10 right-2 flex flex-col gap-2 z-50">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="window cursor-pointer"
          style={{ width: 260 }}
          onClick={() => dismiss(t.id)}
        >
          <div className="title-bar">
            <div className="title-bar-text">{t.title}</div>
            <div className="title-bar-controls">
              <button aria-label="Close" onClick={() => dismiss(t.id)} />
            </div>
          </div>
          <div className="window-body text-xs p-2">{t.body}</div>
        </div>
      ))}
    </div>
  );
}
