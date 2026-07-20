import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20 text-center">
      <p className="text-6xl font-black">404</p>
      <h1 className="mt-4 text-2xl font-bold">Page not found</h1>
      <Link className="mt-6 inline-block font-semibold" to="/">Return home</Link>
    </div>
  );
}
