import { ActiveServerProvider } from "@/components/dashboard/ActiveServerProvider";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <ActiveServerProvider>{children}</ActiveServerProvider>;
}
