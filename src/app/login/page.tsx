import { Suspense } from "react";
import LoginForm from "./login-form";
import LoginLoading from "./loading";

export const metadata = { title: "Sign in | Civic" };

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginForm />
    </Suspense>
  );
}
