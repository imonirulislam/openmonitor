import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@openmonitor/ui";
import { headers } from "next/headers";
import { submitUnlock } from "./actions";

export default async function UnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string; page?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? undefined;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle>This status page is private</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={submitUnlock} className="flex flex-col gap-3">
            <input type="hidden" name="workspace" value={sp.workspace ?? ""} />
            <input type="hidden" name="page" value={sp.page ?? ""} />
            <input type="hidden" name="host" value={host ?? ""} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoFocus required />
            </div>
            {sp.error ? <p className="text-destructive text-sm">{sp.error}</p> : null}
            <Button type="submit">Unlock</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
