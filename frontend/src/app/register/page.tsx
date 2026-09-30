"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Building2,
  Eye,
  EyeOff,
  HeartHandshake,
  Lock,
  Mail,
  Package2,
  Truck,
} from "lucide-react";

import { useAuth } from "@/lib/auth/auth-context";
import { RegisterFormData, registerSchema } from "@/lib/validation/auth";
import { UserRole } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function RegisterPage() {
  const { register: registerAuth, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const { success } = useToast();

  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // If already logged in, redirect away from register page
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/app");
    }
  }, [isLoading, isAuthenticated, router]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      role: "FOOD_BUSINESS",
    },
  });

  const selectedRole = watch("role");

  const onSubmit = async (data: RegisterFormData) => {
    setServerError(null);
    setIsSubmitting(true);
    try {
      await registerAuth(data.email, data.password, data.role as UserRole);
      success("Your account has been registered and verified.", "Welcome");
      router.push("/app");
    } catch (err: any) {
      const message =
        err?.status === 409
          ? "An account with this email address already exists. Please sign in."
          : err?.status === 0
          ? "Unable to connect to the server. Please check your network connection."
          : err?.detail || "Could not complete registration. Please verify your information.";
      setServerError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const roleOptions: Array<{
    id: UserRole;
    title: string;
    description: string;
    icon: React.ReactNode;
  }> = [
    {
      id: "FOOD_BUSINESS",
      title: "Food Business",
      description: "Donate surplus food from your business.",
      icon: <Building2 className="h-5 w-5" />,
    },
    {
      id: "ORGANIZATION",
      title: "Organization",
      description: "Receive and manage donated food.",
      icon: <HeartHandshake className="h-5 w-5" />,
    },
    {
      id: "VOLUNTEER",
      title: "Volunteer",
      description: "Help transport donated food.",
      icon: <Truck className="h-5 w-5" />,
    },
  ];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50/50 p-4 sm:p-6 py-12">
      <div className="w-full max-w-lg space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <Link href="/" className="flex items-center space-x-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
              <Package2 className="h-6 w-6" />
            </div>
          </Link>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">
            Create an account
          </h1>
          <p className="text-xs text-zinc-500 max-w-sm">
            Join the automated local food surplus donation network
          </p>
        </div>

        {/* Registration Card */}
        <Card>
          <CardHeader>
            <CardTitle>Account Details</CardTitle>
            <CardDescription>
              Select your role and provide your account credentials.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              {serverError && (
                <Alert
                  variant="error"
                  title="Registration Failed"
                  onDismiss={() => setServerError(null)}
                >
                  {serverError}
                </Alert>
              )}

              {/* Accessible Role Selector */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-zinc-700 tracking-wide">
                  Account Role
                </label>
                <div
                  role="radiogroup"
                  aria-label="Account Role"
                  className="grid grid-cols-1 gap-2.5 sm:grid-cols-3"
                >
                  {roleOptions.map((role) => {
                    const isSelected = selectedRole === role.id;
                    return (
                      <button
                        key={role.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        disabled={isSubmitting}
                        onClick={() => setValue("role", role.id as any, { shouldValidate: true })}
                        className={cn(
                          "cursor-pointer rounded-lg border p-3 text-left transition-all flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                          isSelected
                            ? "border-emerald-600 bg-emerald-50/60 ring-1 ring-emerald-600 text-emerald-900"
                            : "border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700"
                        )}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <div
                            className={cn(
                              "p-1.5 rounded-md",
                              isSelected
                                ? "bg-emerald-600 text-white"
                                : "bg-zinc-100 text-zinc-500"
                            )}
                          >
                            {role.icon}
                          </div>
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold">{role.title}</h4>
                          <p className="text-[11px] text-zinc-500 mt-0.5 leading-tight">
                            {role.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {errors.role && (
                  <p className="text-xs font-medium text-rose-600">{errors.role.message}</p>
                )}
              </div>

              {/* Email */}
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

              {/* Password */}
              <Input
                label="Password"
                type={showPassword ? "text" : "password"}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                leftIcon={<Lock className="h-4 w-4" />}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="rounded p-1 text-zinc-400 hover:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                }
                error={errors.password?.message}
                helperText="Must be at least 8 characters long."
                disabled={isSubmitting}
                {...register("password")}
              />

              {/* Confirm Password */}
              <Input
                label="Confirm Password"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Re-enter your password"
                autoComplete="new-password"
                leftIcon={<Lock className="h-4 w-4" />}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="rounded p-1 text-zinc-400 hover:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                }
                error={errors.confirmPassword?.message}
                disabled={isSubmitting}
                {...register("confirmPassword")}
              />

              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={isSubmitting}
                disabled={isSubmitting}
                className="w-full mt-2"
              >
                Create Account
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Login Footer Link */}
        <p className="text-center text-xs text-zinc-500">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-emerald-600 hover:text-emerald-700 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
