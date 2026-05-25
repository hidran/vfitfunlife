import ProviderDetailClient from "./ProviderDetailClient";

export const dynamicParams = false;

// Static params for build
export function generateStaticParams() {
  return [{ id: "dummy" }];
}

interface ProviderDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function ProviderDetailPage({ params }: ProviderDetailPageProps) {
  const { id } = await params;
  return <ProviderDetailClient providerId={id} />;
}
