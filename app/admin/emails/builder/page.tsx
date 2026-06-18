import { createClient } from "@/lib/supabase/server";
import { EmailBuilder } from "@/components/email-builder/EmailBuilder";
import { defaultTemplate } from "@/components/email-builder/blocks";
import {
  DEFAULT_DESIGN,
  EMAIL_DEFS,
  EMAIL_KEYS,
  type EmailKey,
} from "@/lib/email/types";

export const dynamic = "force-dynamic";

export default async function EmailBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const sp = await searchParams;
  const key = (EMAIL_KEYS.includes(sp.email as EmailKey) ? sp.email : EMAIL_DEFS[0].key) as EmailKey;

  const supabase = await createClient();
  const db = supabase as unknown as { from: (t: string) => any };
  const { data } = await db
    .from("email_templates")
    .select("*")
    .eq("template_key", key)
    .maybeSingle();

  const blocks = Array.isArray(data?.blocks) && data.blocks.length ? data.blocks : defaultTemplate();
  const design = { ...DEFAULT_DESIGN, ...(data?.design ?? {}) };
  const subject = data?.subject ?? "";
  const enabled = data?.enabled ?? true;

  return (
    <EmailBuilder
      key={key}
      emailKey={key}
      initialSubject={subject}
      initialBlocks={blocks}
      initialDesign={design}
      initialEnabled={enabled}
    />
  );
}
