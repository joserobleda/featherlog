"use client";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/actions";

type RunOptions<T> = {
  /** Toast shown on success. */
  success?: string;
  onSuccess?: (data: T) => void;
  onError?: (error: string) => void;
  /** Show a toast with the error message (default true; field errors are shown inline too). */
  toastError?: boolean;
};

/**
 * Runs a server action inside a transition and keeps its pending state and per-field errors.
 * Domain errors are toasted; field errors are exposed for `<Field error>`.
 */
export function useActionRunner() {
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const run = useCallback(<T>(fn: () => Promise<ActionResult<T>>, opts: RunOptions<T> = {}) => {
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        if (opts.toastError !== false) toast.error(res.error);
        opts.onError?.(res.error);
        return;
      }
      setErrors({});
      if (opts.success) toast.success(opts.success);
      opts.onSuccess?.(res.data);
    });
  }, []);

  return { pending, errors, setErrors, run };
}
