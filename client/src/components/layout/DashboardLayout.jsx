import { NavLink, Outlet } from "react-router-dom";

export function DashboardLayout({ title, navigation = [] }) {
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-xl font-bold">{title}</h1>
      </header>
      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-8 md:grid-cols-[220px_1fr]">
        <aside className="rounded-2xl bg-slate-950 p-4 text-white">
          <p className="mb-4 text-sm font-semibold text-slate-300">Workspace</p>
          <nav className="space-y-2">
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className="block rounded-lg px-3 py-2 text-sm hover:bg-white/10"
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <section>
          <Outlet />
        </section>
      </div>
    </div>
  );
}
