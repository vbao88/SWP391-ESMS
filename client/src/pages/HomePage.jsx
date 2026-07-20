import { ArrowRight, CalendarDays, ScanFace, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";

const features = [
  { icon: ShieldCheck, title: "Verified prescriptions", text: "Submit, review and reuse prescriptions securely." },
  { icon: CalendarDays, title: "Eye examination booking", text: "Choose a branch and a convenient 30-minute slot." },
  { icon: ScanFace, title: "Virtual try-on", text: "Planned face-shape recommendations and camera try-on." },
];

export function HomePage() {
  return (
    <>
      <section className="mx-auto grid max-w-7xl items-center gap-10 px-6 py-20 lg:grid-cols-2">
        <div>
          <Badge>Eyewear Shop Management System</Badge>
          <h1 className="mt-6 text-5xl font-black tracking-tight text-slate-950 md:text-6xl">
            Clear vision, simpler shopping.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
            Browse frames, configure prescription lenses, book eye examinations and track every order in one place.
          </p>
          <div className="mt-8 flex gap-3">
            <Link to="/products"><Button>Browse products <ArrowRight className="ml-2" size={18} /></Button></Link>
            <Link to="/register"><Button variant="secondary">Create account</Button></Link>
          </div>
        </div>
        <div className="rounded-3xl bg-slate-950 p-10 text-white shadow-2xl">
          <p className="text-sm font-semibold text-slate-300">Three Hanoi branches</p>
          <div className="mt-5 space-y-4 text-2xl font-bold">
            <p>Cầu Giấy</p><p>Đống Đa</p><p>Hà Đông</p>
          </div>
          <p className="mt-8 text-slate-300">Daily eye examination service from 09:00 to 21:00.</p>
        </div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-5 px-6 md:grid-cols-3">
        {features.map(({ icon: Icon, title, text }) => (
          <Card key={title}>
            <Icon size={28} />
            <h2 className="mt-4 text-lg font-bold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
          </Card>
        ))}
      </section>
    </>
  );
}
