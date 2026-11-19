"use client";

import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/error-note";
import { useDeleteAccount } from "@/lib/api/hooks";
import { useRef } from "react";

export function DeleteDataButton() {
  const dialog = useRef<HTMLDialogElement>(null);
  const remove = useDeleteAccount();

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => dialog.current?.showModal()}>
        Delete my data
      </Button>
      <dialog
        ref={dialog}
        className="surface m-auto w-[min(92vw,460px)] rounded-[1.75rem] p-0 text-ink shadow-(--shadow-float) backdrop:bg-black/75 backdrop:backdrop-blur-md"
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
      >
        <div className="p-8 sm:p-9">
          <p className="eyebrow text-danger/80">This cannot be undone</p>
          <h2 className="display mt-4 text-[2.5rem] leading-none">
            Delete <em className="text-ember-soft">everything</em>?
          </h2>
          <p className="mt-4 text-[14px] leading-relaxed text-ink-muted">
            This permanently removes your profile, your music submissions, your answers and your sound
            profile. Anonymous audio features of public tracks are kept because they contain nothing about
            you.
          </p>
          {remove.error && <ErrorNote className="mt-4">{remove.error.message}</ErrorNote>}
          <div className="mt-8 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => dialog.current?.close()}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() =>
                remove.mutate(undefined, {
                  onSuccess: () => {
                    dialog.current?.close();
                    // A full load, not a client-side route: clearing the cache
                    // wakes the page's session guard, whose redirect to /start
                    // raced this one. A fresh document also keeps nothing of
                    // the deleted profile in memory.
                    window.location.replace("/");
                  },
                })
              }
            >
              Delete permanently
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
