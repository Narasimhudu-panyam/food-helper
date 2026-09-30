import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 p-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500 border border-zinc-200">
        <FileQuestion className="h-7 w-7" />
      </div>
      <h1 className="text-xl font-bold tracking-tight text-zinc-900">
        Page Not Found
      </h1>
      <p className="mt-1.5 max-w-sm text-xs text-zinc-500 leading-relaxed">
        The requested page does not exist or may have been moved.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <Link href="/app">
          <Button size="md" variant="primary">
            Go to Workspace
          </Button>
        </Link>
        <Link href="/">
          <Button size="md" variant="outline">
            Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
