import { createBrowserRouter } from "react-router-dom";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { PublicLayout } from "../components/layout/PublicLayout";
import { AdminDashboardPage } from "../pages/AdminDashboardPage";
import { CartPage } from "../pages/CartPage";
import { CustomerDashboardPage } from "../pages/CustomerDashboardPage";
import { HomePage } from "../pages/HomePage";
import { LoginPage } from "../pages/LoginPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { PrescriptionDashboardPage } from "../pages/PrescriptionDashboardPage";
import { ProductsPage } from "../pages/ProductsPage";
import { RegisterPage } from "../pages/RegisterPage";
import { SalesDashboardPage } from "../pages/SalesDashboardPage";

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/login", element: <LoginPage /> },
      { path: "/register", element: <RegisterPage /> },
      { path: "/products", element: <ProductsPage /> },
      { path: "/cart", element: <CartPage /> },
    ],
  },
  {
    path: "/customer",
    element: <DashboardLayout title="Customer Dashboard" />,
    children: [{ index: true, element: <CustomerDashboardPage /> }],
  },
  {
    path: "/sales",
    element: <DashboardLayout title="Sales Staff Dashboard" />,
    children: [{ index: true, element: <SalesDashboardPage /> }],
  },
  {
    path: "/prescription-staff",
    element: <DashboardLayout title="Prescription Staff Dashboard" />,
    children: [{ index: true, element: <PrescriptionDashboardPage /> }],
  },
  {
    path: "/admin",
    element: <DashboardLayout title="Administrator Dashboard" />,
    children: [{ index: true, element: <AdminDashboardPage /> }],
  },
  { path: "*", element: <NotFoundPage /> },
]);
