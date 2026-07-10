import type { Metadata } from "next";
import "./admin.css";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false }
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // .admin-root scopes the ported admin stylesheet so it cannot leak into
  // the customer-facing pages (both sheets share historic class names).
  return <div className="admin-root">{children}</div>;
}
