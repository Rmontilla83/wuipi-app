import { redirect } from "next/navigation";

// Facturación se mudó al ERP Administrativo
export default function FacturacionRedirect() {
  redirect("/erp");
}
