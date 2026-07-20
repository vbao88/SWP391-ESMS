import { cn } from "../../lib/utils";

export function Badge({ className, ...props }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700",
        className,
      )}
      {...props}
    />
  );
}
