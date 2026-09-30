"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Lock, Mail, Package2 } from "lucide-react";

import { useAuth } from "@/lib/auth/auth-context";
import { LoginFormData, loginSchema } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

function getSafeReturnUrl(rawUrl: string | null): string {
  if (!rawUrl) return "/app";
  // Validate that returnUrl is an internal relative application path
  if (rawUrl.startsWith("/") && !rawUrl.startsWith("//") && !rawUrl.startsWith("/\\")) {
    return rawUrl;
  }
  return "/app";
}

function LoginForm() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = getSafeReturnUrl(searchParams.get("returnUrl"));
  const { success } = useToast();

  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // If already logged in, redirect away from login page
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace(returnUrl);
    }
  }, [isLoading, isAuthenticated, router, returnUrl]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setServerError(null);
    setIsSubmitting(true);
    try {
      const user = await login(data.email, data.password);
      success(`Welcome back, ${user.email}`, "Signed In");
      router.push(returnUrl);
    } catch (err: any) {
      const message =
        err?.status === 401
          ? "Invalid email or password. Please verify your credentials."
          : err?.status === 0
          ? "Unable to connect to the server. Please check your connection."
          : err?.detail || "An unexpected error occurred during sign in. Please try again.";
      setServerError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign In</CardTitle>
        <CardDescription>
          Enter your email and password to access your workspace.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {serverError && (
            <Alert
              variant="error"
              title="Sign In Failed"
              onDismiss={() => setServerError(null)}
            >
              {serverError}
            </Alert>
          )}

          <Input
            label="Email Address"
            type="email"
            placeholder="name@organization.org"
            autoComplete="email"
            leftIcon={<Mail className="h-4 w-4" />}
            error={errors.email?.message}
            disabled={isSubmitting}
            {...register("email")}
          />

          <Input
            label="Password"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            autoComplete="current-password"
            leftIcon={<Lock className="h-4 w-4" />}
            rightIcon={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="rounded p-1 text-zinc-400 hover:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={0}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            }
            error={errors.password?.message}
            disabled={isSubmitting}
            {...register("password")}
          />

          <Button
            type="submit"
            variant="primary"
            size="md"
            isLoading={isSubmitting}
            disabled={isSubmitting}
            className="w-full mt-2"
          >
            Sign In
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50/50 p-4 sm:p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <Link href="/" className="flex items-center space-x-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
              <Package2 className="h-6 w-6" />
            </div>
          </Link>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">
            Welcome back
          </h1>
          <p className="text-xs text-zinc-500">
            Sign in to continue to your workspace
          </p>
        </div>

        <Suspense
          fallback={
            <div className="flex h-56 items-center justify-center rounded-xl border border-zinc-200 bg-white">
              <Spinner size="md" className="text-emerald-600" />
            </div>
          }
        >
          <LoginForm />
        </Suspense>

        {/* Register Footer Link */}
        <p className="text-center text-xs text-zinc-500">
          Don&apos;t have an account yet?{" "}
          <Link
            href="/register"
            className="font-semibold text-emerald-600 hover:text-emerald-700 hover:underline"
          >
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
}
