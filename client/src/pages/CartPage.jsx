import { Card } from "../components/ui/card";

export function CartPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-3xl font-bold">Shopping cart</h1>
      <Card className="mt-8 text-center text-slate-600">Your starter cart is empty.</Card>
    </div>
  );
}
