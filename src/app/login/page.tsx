import { Suspense } from "react";
import LoginForm from "./login-form";

export const metadata = { title: "Sign in | Civic" };

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
