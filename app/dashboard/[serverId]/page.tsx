import { ServerDetailClient } from './ServerDetailClient';

interface Props {
  params: Promise<{ serverId: string }>;
}

export default async function ServerDetailPage({ params }: Props) {
  const { serverId } = await params;
  return <ServerDetailClient serverId={serverId} initialServer={null} />;
}
