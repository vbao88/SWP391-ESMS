import { Card } from "../components/ui/card";

const mockProducts = [
  { name: "Classic Square Frame", price: "890,000 VND", type: "Prescription frame" },
  { name: "Urban Blue-Light Frame", price: "750,000 VND", type: "Office eyewear" },
  { name: "Summer Polarized Sunglasses", price: "1,190,000 VND", type: "Sunglasses" },
];

export function ProductsPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <h1 className="text-3xl font-bold">Products</h1>
      <p className="mt-2 text-slate-600">Static starter data; connect this page to the product API in the product module.</p>
      <div className="mt-8 grid gap-5 md:grid-cols-3">
        {mockProducts.map((product) => (
          <Card key={product.name}>
            <div className="aspect-[4/3] rounded-xl bg-slate-100" />
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{product.type}</p>
            <h2 className="mt-1 font-bold">{product.name}</h2>
            <p className="mt-2 text-sm">{product.price}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
