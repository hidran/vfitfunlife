import UserDetailClient from "./UserDetailClient";

// Static params for build
export function generateStaticParams() {
  return [{ id: "dummy" }];
}

interface UserDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function UserDetailPage({ params }: UserDetailPageProps) {
  const { id } = await params;
  return <UserDetailClient userId={id} />;
}
