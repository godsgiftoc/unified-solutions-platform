"use client";

import { AlertTriangle, HelpCircle } from "lucide-react";
import { createContext, useCallback, useContext, useRef, useState } from "react";

import { Button, Field, inputClass, Modal } from "@/components/ui";

interface ConfirmOpts {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}
interface PromptOpts {
  title: string;
  message?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
}
interface DialogApi {
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  prompt: (o: PromptOpts) => Promise<string | null>;
}

const DialogContext = createContext<DialogApi>({
  confirm: async () => false,
  prompt: async () => null,
});

export const useConfirm = () => useContext(DialogContext).confirm;
export const usePrompt = () => useContext(DialogContext).prompt;

type State =
  | { kind: "confirm"; opts: ConfirmOpts }
  | { kind: "prompt"; opts: PromptOpts }
  | null;

/** Replaces the browser's native confirm()/prompt() with on-brand modals. */
export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>(null);
  const [text, setText] = useState("");
  const resolver = useRef<((v: boolean | string | null) => void) | undefined>(undefined);

  const confirm = useCallback(
    (opts: ConfirmOpts) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve as (v: boolean | string | null) => void;
        setState({ kind: "confirm", opts });
      }),
    [],
  );
  const prompt = useCallback(
    (opts: PromptOpts) =>
      new Promise<string | null>((resolve) => {
        resolver.current = resolve as (v: boolean | string | null) => void;
        setText(opts.defaultValue ?? "");
        setState({ kind: "prompt", opts });
      }),
    [],
  );

  const finish = (val: boolean | string | null) => {
    resolver.current?.(val);
    resolver.current = undefined;
    setState(null);
  };

  return (
    <DialogContext.Provider value={{ confirm, prompt }}>
      {children}

      {state?.kind === "confirm" && (
        <Modal
          open
          onClose={() => finish(false)}
          icon={state.opts.danger ? AlertTriangle : HelpCircle}
          title={state.opts.title}
          description={state.opts.message}
          footer={
            <>
              <Button variant="ghost" onClick={() => finish(false)}>{state.opts.cancelLabel ?? "Cancel"}</Button>
              <button
                autoFocus
                onClick={() => finish(true)}
                className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold text-white transition ${state.opts.danger ? "bg-red-600 hover:bg-red-700" : "bg-brand-600 hover:bg-brand-700"}`}
              >
                {state.opts.confirmLabel ?? "Confirm"}
              </button>
            </>
          }
        />
      )}

      {state?.kind === "prompt" && (
        <Modal
          open
          onClose={() => finish(null)}
          title={state.opts.title}
          description={state.opts.message}
          footer={
            <>
              <Button variant="ghost" onClick={() => finish(null)}>Cancel</Button>
              <button
                onClick={() => finish(text.trim() || null)}
                disabled={!text.trim()}
                className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
              >
                {state.opts.confirmLabel ?? "Save"}
              </button>
            </>
          }
        >
          <Field label={state.opts.label ?? "Value"}>
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={state.opts.placeholder}
              className={inputClass}
              onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) finish(text.trim()); }}
            />
          </Field>
        </Modal>
      )}
    </DialogContext.Provider>
  );
}
