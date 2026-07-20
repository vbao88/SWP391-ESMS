import { cn } from "../../lib/utils";

export function Button({ className, variant = "primary", ...props }) {
  const variants = {
    primary: "bg-slate-950 text-white hover:bg-slate-800",
    secondary: "bg-white text-slate-900 border border-slate-300 hover:bg-slate-50",
    ghost: "bg-transparent text-slate-700 hover:bg-slate-100",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
