import Link from "next/link";
import { ArrowRight, Building2, HeartHandshake, Package2, ShieldCheck, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Navigation Header */}
      <header className="border-b border-zinc-200">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center space-x-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <Package2 className="h-5 w-5" />
            </div>
            <span className="text-base font-bold text-zinc-900 tracking-tight">
              FoodRescue Matcher
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Sign In
              </Button>
            </Link>
            <Link href="/register">
              <Button variant="primary" size="sm">
                Create Account
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Hero / Portal Content */}
      <main className="flex-1 flex flex-col justify-center">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 mb-6">
            <ShieldCheck className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
            Production-Ready Food Surplus Coordination Platform
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 sm:text-5xl">
            Direct, Geospatial Food Waste to Donation Matching
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-sm sm:text-base text-zinc-600 leading-relaxed">
            Connecting commercial food businesses with verified community organizations and volunteer
            dispatchers through automated safety checks, capacity reservations, and real-time pickup tracking.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/login">
              <Button size="lg" className="w-full sm:w-auto" rightIcon={<ArrowRight className="h-4 w-4" />}>
                Access Portal
              </Button>
            </Link>
            <Link href="/register">
              <Button variant="outline" size="lg" className="w-full sm:w-auto">
                Register Organization or Business
              </Button>
            </Link>
          </div>

          {/* Core Roles Grid */}
          <div className="mt-16 grid grid-cols-1 gap-6 text-left sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 mb-3">
                <Building2 className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-900">Food Businesses</h3>
              <p className="mt-1 text-xs text-zinc-600 leading-normal">
                Publish surplus food donations with temperature and perishability metadata for immediate local matching.
              </p>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-700 mb-3">
                <HeartHandshake className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-900">Verified Organizations</h3>
              <p className="mt-1 text-xs text-zinc-600 leading-normal">
                Receive ranked donation match offers with automated storage capacity reservations and pickup scheduling.
              </p>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700 mb-3">
                <Truck className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-900">Volunteer Dispatch</h3>
              <p className="mt-1 text-xs text-zinc-600 leading-normal">
                Accept transit routes within your operating radius and deliver surplus food securely to community recipients.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Minimal Footer */}
      <footer className="border-t border-zinc-200 py-6 text-center text-xs text-zinc-400">
        <p>Food Waste → Donation Matcher Platform</p>
      </footer>
    </div>
  );
}
