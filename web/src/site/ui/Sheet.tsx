// A native <dialog>, so focus is trapped, Escape closes and the page behind is inert without any code of ours. A
// bottom sheet on a phone; on a laptop the menu stays a sheet and other dialogs centre. It closes on its backdrop.
import { useEffect, useRef, type ReactNode } from "react";
import { CloseIcon } from "./icons.tsx";
import "./sheet.css";

export function Sheet({ open, onClose, title, children, wide = false }: { open: boolean; onClose(): void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      data-wide={wide ? "" : undefined}
      aria-labelledby={`${title.replace(/\W+/g, "-").toLowerCase()}-sheet`}
      onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="sheet-body glass" data-glass="thick">
        <div className="sheet-grip" aria-hidden="true" />
        <header className="sheet-head">
          <h2 id={`${title.replace(/\W+/g, "-").toLowerCase()}-sheet`} className="sheet-title">{title}</h2>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
