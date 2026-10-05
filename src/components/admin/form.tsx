"use client";

import { createContext, use, useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/lib/form";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;
const Ctx = createContext<FormState>({});

/**
 * Formulario del panel: muestra errores del servidor y conserva lo escrito.
 * Al cambiar `state.v` se vuelve a montar el contenido con los valores devueltos.
 */
export function AdminForm({ action, children, className = "space-y-5" }: { action: Action; children: React.ReactNode; className?: string }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className={className}>
      <Ctx value={state}>
        {state.error && (
          <p role="alert" className="rounded-md border border-oferta/40 bg-oferta/5 px-4 py-3 text-sm font-medium text-oferta">
            {state.error}
          </p>
        )}
        {state.message && (
          <p role="status" className="rounded-md border border-leaf/40 bg-leaf/5 px-4 py-3 text-sm font-medium text-leaf-dark">
            {state.message}
          </p>
        )}
        {/* El espaciado se repite aquí: los campos son hijos de este div, no del form. */}
        <div key={state.v ?? 0} className={className}>
          {children}
        </div>
      </Ctx>
    </form>
  );
}

function useField(name: string, initial: string | number | boolean | null | undefined) {
  const s = use(Ctx);
  return {
    value: s.values ? (s.values[name] ?? "") : initial == null ? "" : String(initial),
    error: s.errors?.[name],
  };
}

const input = "w-full rounded-md border border-line bg-white px-3 py-2 aria-invalid:border-oferta";

type Common = { name: string; label: string; hint?: string; className?: string };

function Wrap({ id, label, hint, error, className, children }: { id: string; label: string; hint?: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="mt-1 text-xs font-medium text-oferta">
          {error}
        </p>
      )}
    </div>
  );
}

export function Text({
  name,
  label,
  hint,
  className,
  initial,
  ...rest
}: Common & { initial?: string | number | null } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "defaultValue">) {
  const id = useId();
  const f = useField(name, initial);
  return (
    <Wrap id={id} label={label} hint={hint} error={f.error} className={className}>
      <input
        id={id}
        name={name}
        defaultValue={f.value}
        aria-invalid={f.error ? true : undefined}
        aria-describedby={f.error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        className={input}
        {...rest}
      />
    </Wrap>
  );
}

export function TextArea({ name, label, hint, className, initial, rows = 4, ...rest }: Common & { initial?: string | null; rows?: number; maxLength?: number; required?: boolean }) {
  const id = useId();
  const f = useField(name, initial);
  return (
    <Wrap id={id} label={label} hint={hint} error={f.error} className={className}>
      <textarea id={id} name={name} rows={rows} defaultValue={f.value} aria-invalid={f.error ? true : undefined} className={input} {...rest} />
    </Wrap>
  );
}

export function Select({
  name,
  label,
  hint,
  className,
  initial,
  options,
  empty,
  required,
}: Common & { initial?: string | null; options: { value: string; label: string }[]; empty?: string; required?: boolean }) {
  const id = useId();
  const f = useField(name, initial);
  return (
    <Wrap id={id} label={label} hint={hint} error={f.error} className={className}>
      <select id={id} name={name} defaultValue={f.value} required={required} aria-invalid={f.error ? true : undefined} className={input}>
        {empty !== undefined && <option value="">{empty}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Wrap>
  );
}

export function Check({ name, label, hint, initial }: Common & { initial?: boolean }) {
  const s = use(Ctx);
  const checked = s.values ? name in s.values : !!initial;
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-0.5 size-4 accent-leaf" />
      <span>
        <span className="font-semibold">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export function Submit({ children = "Guardar", variant = "primary" }: { children?: React.ReactNode; variant?: "primary" | "danger" | "plain" }) {
  const { pending } = useFormStatus();
  const styles = {
    primary: "bg-leaf text-white hover:bg-leaf-dark",
    danger: "border border-oferta text-oferta hover:bg-oferta hover:text-white",
    plain: "border border-line hover:border-leaf",
  }[variant];
  return (
    <button disabled={pending} className={`rounded-md px-5 py-2 font-semibold disabled:opacity-60 ${styles}`}>
      {pending ? "Guardando…" : children}
    </button>
  );
}

/** Botón de acción destructiva con confirmación nativa del navegador. */
export function DangerButton({ action, children, confirm: question }: { action: Action; children: React.ReactNode; confirm: string }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} onSubmit={(e) => !window.confirm(question) && e.preventDefault()} className="inline">
      <Submit variant="danger">{children}</Submit>
      {state.error && (
        <p role="alert" className="mt-2 text-sm font-medium text-oferta">
          {state.error}
        </p>
      )}
    </form>
  );
}
