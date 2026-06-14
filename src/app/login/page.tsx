import { Suspense } from "react";
import LoginLoading from "./loading";
import LoginForm from "./login-form";

export const metadata = { title: "Sign in | Civic" };

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginForm />
    </Suspense>
  );
}
