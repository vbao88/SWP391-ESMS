import { Glasses, ShoppingCart } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Button } from "../ui/button";

const navClass = ({ isActive }) =>
  isActive ? "font-semibold text-slate-950" : "text-slate-600 hover:text-slate-950";

export function PublicLayout() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 font-bold text-slate-950">
            <Glasses size={24} /> Lensora Optical
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            <NavLink to="/products" className={navClass}>Products</NavLink>
            <NavLink to="/cart" className={navClass}>Cart</NavLink>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/cart" aria-label="Cart" className="rounded-lg p-2 hover:bg-slate-100">
              <ShoppingCart size={20} />
            </Link>
            <Button variant="secondary" onClick={() => { window.location.href = "/login"; }}>Log in</Button>
          </div>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="mt-16 border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-8 text-sm text-slate-500">
          ESMS starter • Lensora Optical • SWP391
        </div>
      </footer>
    </div>
  );
}
