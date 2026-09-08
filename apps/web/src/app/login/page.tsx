import { Button, Card, CardContent, Input, Label } from "@openmonitor/ui";
import { ActivityIcon } from "lucide-react";
import Link from "next/link";
import { signIn } from "~/auth";
import { signupsEnabled } from "~/lib/signups";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  return <LoginForm searchParamsPromise={searchParams} />;
}

async function LoginForm({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const params = await searchParamsPromise;
  const error = params.error;
  const callbackUrl = params.callbackUrl ?? "/dashboard";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-md bg-foreground text-background">
          <ActivityIcon className="size-5" />
        </div>
        <div className="flex flex-col">
          <h1 className="font-semibold text-base leading-none">OpenMonitor</h1>
          <p className="text-muted-foreground text-xs">Admin</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-5">
          <form
            action={async (formData) => {
              "use server";
              await signIn("credentials", {
                email: formData.get("email"),
                password: formData.get("password"),
                redirectTo: callbackUrl,
              });
            }}
            className="flex flex-col gap-4"
          >
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
                autoComplete="current-password"
                required
              />
            </div>
            {error ? (
              <p className="text-destructive text-sm">
                {error === "CredentialsSignin" ? "Invalid email or password" : error}
              </p>
            ) : null}
            <Button type="submit">Sign in</Button>
            {signupsEnabled() ? (
              <p className="text-muted-foreground text-center text-xs">
                No account yet?{" "}
                <Link href="/signup" className="underline">
                  Create one
                </Link>
              </p>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
