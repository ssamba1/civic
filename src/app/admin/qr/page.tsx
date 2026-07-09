import type { Metadata } from "next";
import { QrTool } from "./qr-tool";

export const metadata: Metadata = { title: "Walk-up QR | Civic Admin" };

export default function AdminQrPage() {
  return <QrTool />;
}
