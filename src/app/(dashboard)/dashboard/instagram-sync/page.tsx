import InstagramSyncPreview from "./instagram-sync-preview";

export default async function InstagramSyncPage({ searchParams }: {
  searchParams?: Promise<{ schoolId?: string }>;
}) {
  const params = await searchParams;
  return <InstagramSyncPreview schoolId={params?.schoolId || ""} />;
}
