"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

/** Matches the CSS close transition so the book finishes shutting before we leave. */
const CLOSE_MS = 560;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

type Phase = "enter" | "open" | "closing";

type Props = {
  titleId: string;
  cloth: string;
  title: string;
  author: string;
  cover: ReactNode;
  children: ReactNode;
};

/**
 * A modal book over the shelf: the cover swings open to a two-page spread and
 * swings shut again on close, then history goes back to the walk.
 */
export function BookPopup({ titleId, cloth, title, author, cover, children }: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closingRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("enter");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    // The walk reads this to ignore arrow keys and Space while a book is open.
    document.documentElement.dataset.bookOpen = "true";

    // Cache Components keeps a left route mounted but hidden; when it comes
    // back this effect re-runs, so start every open from a clean closed state
    // (with transitions off under reduced motion this is effectively instant).
    closingRef.current = false;
    let raf = requestAnimationFrame(() => {
      setPhase("enter");
      raf = requestAnimationFrame(() => setPhase("open"));
    });

    return () => {
      cancelAnimationFrame(raf);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      delete document.documentElement.dataset.bookOpen;
      if (dialog.open) dialog.close();
    };
  }, []);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setPhase("closing");
    const reduce = window.matchMedia(REDUCED_MOTION).matches;
    closeTimerRef.current = setTimeout(
      () => {
        dialogRef.current?.close();
        router.back();
      },
      reduce ? 0 : CLOSE_MS,
    );
  }, [router]);

  const onBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (bookRef.current && !bookRef.current.contains(event.target as Node)) close();
  };

  return (
    <dialog
      ref={dialogRef}
      className="book-popup"
      data-phase={phase}
      aria-labelledby={titleId}
      style={{ "--book-cloth": cloth } as CSSProperties}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close();
        }
      }}
      onClick={onBackdropClick}
    >
      <div className="book-popup__stage">
        <div ref={bookRef} className="book-popup__book">
          <button
            type="button"
            className="book-popup__close"
            onClick={close}
            aria-label="Close book and return to the shelf"
          >
            <span aria-hidden="true">×</span>
            <span className="book-popup__close-text">Close</span>
          </button>

          <div className="book-popup__page book-popup__page--left" aria-hidden="true" />

          <div className="book-popup__page book-popup__page--text">
            <div className="book-popup__cover-inline">{cover}</div>
            {children}
          </div>

          <div className="book-popup__flap">
            <div className="book-popup__face book-popup__face--front" aria-hidden="true">
              <span className="book-popup__front-rule" />
              <span className="book-popup__front-title">{title}</span>
              {author && <span className="book-popup__front-author">{author}</span>}
              <span className="book-popup__front-rule" />
            </div>
            <div className="book-popup__face book-popup__face--back">
              <div className="book-popup__cover-art">{cover}</div>
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}
