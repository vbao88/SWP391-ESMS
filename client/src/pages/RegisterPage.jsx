import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";

export function RegisterPage() {
  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <Card>
        <h1 className="text-2xl font-bold">Create Customer account</h1>
        <form className="mt-6 space-y-4" onSubmit={(event) => event.preventDefault()}>
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Full name" />
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2" type="email" placeholder="Email" />
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2" type="password" placeholder="Password" />
          <Button className="w-full" type="submit">Register</Button>
        </form>
        <p className="mt-5 text-sm text-slate-600">Already registered? <Link className="font-semibold" to="/login">Log in</Link></p>
      </Card>
    </div>
  );
}
