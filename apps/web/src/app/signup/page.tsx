import { Button, Card, CardContent, Input, Label } from "@openmonitor/ui";
import { ActivityIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { signUp } from "~/lib/actions/signup";
import { signupsEnabled } from "~/lib/signups";
import { SlugField } from "./slug-field";

// Read the flag per request. Prerendered, it would bake in whichever value
// SIGNUPS_ENABLED had at build time and keep 404ing after you turn it on.
export const dynamic = "force-dynamic";

/** Closed unless SIGNUPS_ENABLED=on. The slug becomes the status page host. */
export default function SignupPage() {
  if (!signupsEnabled()) notFound();

  const statusPageUrl = process.env.NEXT_PUBLIC_STATUS_PAGE_URL ?? "http://localhost:5003";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-md bg-foreground text-background">
          <ActivityIcon className="size-5" />
        </div>
        <div className="flex flex-col">
          <h1 className="font-semibold text-base leading-none">OpenMonitor</h1>
          <p className="text-muted-foreground text-xs">Create an account</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-5">
          <form action={signUp} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
              <p className="text-muted-foreground text-xs">At least 8 characters.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="workspaceName">Workspace name</Label>
              <Input
                id="workspaceName"
                name="workspaceName"
                required
                maxLength={200}
                placeholder="Acme Inc"
              />
            </div>
            <SlugField statusPageUrl={statusPageUrl} />
            <Button type="submit">Create account</Button>
            <p className="text-muted-foreground text-center text-xs">
              Already have an account?{" "}
              <Link href="/login" className="underline">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
